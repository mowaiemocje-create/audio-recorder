package com.pitchrec.backgroundrecorder;

// Cienki wrapper JNI — cała faktyczna logika nagrywania (AAudio, pętla odczytu, zapis WAV)
// jest w kodzie natywnym (native-lib.cpp). Ta klasa tylko deklaruje metody native i ładuje
// bibliotekę współdzieloną (.so) zbudowaną przez CMake.
public class NativeAudioRecorder {
    static {
        System.loadLibrary("pitchrecnative");
    }

    // Zwraca true jeśli nagrywanie faktycznie wystartowało.
    public native boolean nativeStart(String outputPath);

    public native void nativePause();

    public native void nativeResume();

    // Zwraca liczbę zapisanych bajtów PCM (0 jeśli nic nie nagrano / błąd).
    public native long nativeStop();
}
