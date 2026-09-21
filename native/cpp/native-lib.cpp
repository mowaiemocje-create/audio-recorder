// native-lib.cpp
//
// Natywna implementacja nagrywania przez AAudio (nowoczesne, zalecane przez Google API
// audio na poziomie natywnym, dostępne od API 26+). Cały odczyt próbek i zapis do pliku
// dzieje się tutaj, w C++, na dedykowanym wątku POSIX (pthread) — poza zasięgiem Javy i
// jej cyklu życia/GC. To próba obejścia ograniczenia, które utrzymywało się mimo
// wyczerpania wszystkich dostępnych technik na poziomie Java (Foreground Service z
// poprawnym typem, WakeLock, MediaSession, AudioFocus, różne AudioSource) — potwierdzone
// dekompilacją działającej aplikacji (RecForge), że jej faktyczna pętla odczytu
// prawdopodobnie też działa w kodzie natywnym, nie w Javie.
//
// WAŻNE ZASTRZEŻENIE: ten kod nie został skompilowany ani przetestowany lokalnie (brak
// dostępu do pełnego Android NDK w środowisku, w którym był pisany) — składnia i logika są
// starannie napisane zgodnie z oficjalną dokumentacją AAudio, ale realistycznie może
// wymagać jednej-dwóch rund poprawek po pierwszej próbie budowania przez GitHub Actions
// (który ma pełny, prawdziwy NDK).

#include <jni.h>
#include <aaudio/AAudio.h>
#include <pthread.h>
#include <unistd.h>
#include <cstdio>
#include <cstring>
#include <atomic>
#include <string>

#define SAMPLE_RATE 44100
#define CHANNELS 1
#define FORMAT AAUDIO_FORMAT_PCM_I16

static AAudioStream* g_stream = nullptr;
static FILE* g_outputFile = nullptr;
static pthread_t g_readThread;
static std::atomic<bool> g_recording(false);
static std::atomic<bool> g_paused(false);
static std::atomic<long> g_pcmBytesWritten(0);
static std::string g_outputPath;

// ── Zapis nagłówka WAV (44 bajty) — placeholder na start, prawdziwe wartości ustawiane
// na końcu, tak samo jak w wcześniejszej wersji Java. ──
static void writeWavHeaderPlaceholder(FILE* f) {
    char header[44] = {0};
    fwrite(header, 1, 44, f);
}

static void writeIntLE(FILE* f, int32_t value) {
    unsigned char bytes[4];
    bytes[0] = value & 0xff;
    bytes[1] = (value >> 8) & 0xff;
    bytes[2] = (value >> 16) & 0xff;
    bytes[3] = (value >> 24) & 0xff;
    fwrite(bytes, 1, 4, f);
}

static void writeShortLE(FILE* f, int16_t value) {
    unsigned char bytes[2];
    bytes[0] = value & 0xff;
    bytes[1] = (value >> 8) & 0xff;
    fwrite(bytes, 1, 2, f);
}

static void finalizeWavHeader(FILE* f, long pcmDataSize) {
    long totalDataLen = pcmDataSize + 36;
    int channels = CHANNELS;
    int bitsPerSample = 16;
    long byteRate = SAMPLE_RATE * channels * bitsPerSample / 8;
    int blockAlign = channels * bitsPerSample / 8;

    fseek(f, 0, SEEK_SET);
    fwrite("RIFF", 1, 4, f);
    writeIntLE(f, (int32_t) totalDataLen);
    fwrite("WAVE", 1, 4, f);
    fwrite("fmt ", 1, 4, f);
    writeIntLE(f, 16);
    writeShortLE(f, 1); // PCM
    writeShortLE(f, (int16_t) channels);
    writeIntLE(f, SAMPLE_RATE);
    writeIntLE(f, (int32_t) byteRate);
    writeShortLE(f, (int16_t) blockAlign);
    writeShortLE(f, (int16_t) bitsPerSample);
    fwrite("data", 1, 4, f);
    writeIntLE(f, (int32_t) pcmDataSize);
}

// ── Wątek dedykowany wyłącznie do czytania próbek z AAudio i zapisu do pliku ──
static void* readLoop(void* arg) {
    const int32_t framesPerRead = 1024;
    int16_t buffer[framesPerRead * CHANNELS];

    while (g_recording.load()) {
        if (g_paused.load()) {
            usleep(50 * 1000); // 50ms
            continue;
        }
        aaudio_result_t result = AAudioStream_read(g_stream, buffer, framesPerRead, 100000000L /* 100ms timeout w nanosekundach */);
        if (result > 0) {
            int32_t framesRead = result;
            size_t bytesToWrite = framesRead * CHANNELS * sizeof(int16_t);
            if (g_outputFile != nullptr) {
                fwrite(buffer, 1, bytesToWrite, g_outputFile);
                g_pcmBytesWritten += bytesToWrite;
            }
        }
        // result <= 0: błąd albo timeout pojedynczego odczytu — nie przerywa pętli,
        // spróbuje ponownie w następnej iteracji (podobnie jak w implementacji Java).
    }
    return nullptr;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_pitchrec_backgroundrecorder_NativeAudioRecorder_nativeStart(
        JNIEnv* env, jobject /* this */, jstring outputPath) {
    if (g_recording.load()) return JNI_FALSE; // już nagrywa

    const char* pathChars = env->GetStringUTFChars(outputPath, nullptr);
    g_outputPath = std::string(pathChars);
    env->ReleaseStringUTFChars(outputPath, pathChars);

    g_outputFile = fopen(g_outputPath.c_str(), "wb");
    if (g_outputFile == nullptr) return JNI_FALSE;
    writeWavHeaderPlaceholder(g_outputFile);
    g_pcmBytesWritten = 0;

    AAudioStreamBuilder* builder = nullptr;
    aaudio_result_t result = AAudio_createStreamBuilder(&builder);
    if (result != AAUDIO_OK || builder == nullptr) {
        fclose(g_outputFile);
        g_outputFile = nullptr;
        return JNI_FALSE;
    }

    AAudioStreamBuilder_setDirection(builder, AAUDIO_DIRECTION_INPUT);
    AAudioStreamBuilder_setSampleRate(builder, SAMPLE_RATE);
    AAudioStreamBuilder_setChannelCount(builder, CHANNELS);
    AAudioStreamBuilder_setFormat(builder, FORMAT);
    AAudioStreamBuilder_setPerformanceMode(builder, AAUDIO_PERFORMANCE_MODE_LOW_LATENCY);
    // AAUDIO_INPUT_PRESET_VOICE_RECOGNITION — dostrojone pod nagrywanie głosu (bez AEC
    // wymuszonego jak przy VOICE_COMMUNICATION, ale wciąż zoptymalizowane pod mowę).
    AAudioStreamBuilder_setInputPreset(builder, AAUDIO_INPUT_PRESET_VOICE_RECOGNITION);

    result = AAudioStreamBuilder_openStream(builder, &g_stream);
    AAudioStreamBuilder_delete(builder);

    if (result != AAUDIO_OK || g_stream == nullptr) {
        fclose(g_outputFile);
        g_outputFile = nullptr;
        return JNI_FALSE;
    }

    result = AAudioStream_requestStart(g_stream);
    if (result != AAUDIO_OK) {
        AAudioStream_close(g_stream);
        g_stream = nullptr;
        fclose(g_outputFile);
        g_outputFile = nullptr;
        return JNI_FALSE;
    }

    g_recording = true;
    g_paused = false;
    pthread_create(&g_readThread, nullptr, readLoop, nullptr);

    return JNI_TRUE;
}

extern "C" JNIEXPORT void JNICALL
Java_com_pitchrec_backgroundrecorder_NativeAudioRecorder_nativePause(JNIEnv*, jobject) {
    g_paused = true;
}

extern "C" JNIEXPORT void JNICALL
Java_com_pitchrec_backgroundrecorder_NativeAudioRecorder_nativeResume(JNIEnv*, jobject) {
    g_paused = false;
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_pitchrec_backgroundrecorder_NativeAudioRecorder_nativeStop(JNIEnv*, jobject) {
    if (!g_recording.load()) return 0;

    g_recording = false;
    pthread_join(g_readThread, nullptr);

    if (g_stream != nullptr) {
        AAudioStream_requestStop(g_stream);
        AAudioStream_close(g_stream);
        g_stream = nullptr;
    }

    long finalBytes = g_pcmBytesWritten.load();
    if (g_outputFile != nullptr) {
        finalizeWavHeader(g_outputFile, finalBytes);
        fclose(g_outputFile);
        g_outputFile = nullptr;
    }

    return (jlong) finalBytes;
}
