package com.pitchrec.backgroundrecorder;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Base64;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.ByteArrayOutputStream;

// KLUCZOWY plik całego rozwiązania: prawdziwy Android Foreground Service.
//
// WERSJA NATYWNA (v4): faktyczne nagrywanie (AAudio, pętla odczytu próbek, zapis WAV) zostało
// przeniesione do kodu C++ (native-lib.cpp, przez wrapper NativeAudioRecorder) — POZA zasięg
// Javy i jej cyklu życia. To próba obejścia ograniczenia utrzymującego się mimo wyczerpania
// WSZYSTKICH dostępnych technik na poziomie Java (Foreground Service z poprawnym typem,
// WakeLock, MediaSession, AudioFocus, różne AudioSource) — wciąż milkło po dokładnie 5
// sekundach od zablokowania ekranu, mimo że serwis/powiadomienie przeżywały.
//
// Cała reszta (Foreground Service, MediaSession, WakeLock, AudioFocus, powiadomienie) ZOSTAJE
// bez zmian — to wciąż potencjalnie pomocne warstwy ochrony, tylko SAM ODCZYT PRÓBEK już nie
// dzieje się w Javie.
public class BackgroundRecorderService extends Service {

    public static final String ACTION_START = "com.pitchrec.backgroundrecorder.START";
    public static final String ACTION_PAUSE = "com.pitchrec.backgroundrecorder.PAUSE";
    public static final String ACTION_RESUME = "com.pitchrec.backgroundrecorder.RESUME";
    public static final String ACTION_STOP = "com.pitchrec.backgroundrecorder.STOP";
    public static final String CHANNEL_ID = "pitchrec_recording_channel";
    public static final int NOTIFICATION_ID = 1001;

    public static volatile String currentStatus = "NONE"; // "NONE" | "RECORDING" | "PAUSED"

    private final NativeAudioRecorder nativeRecorder = new NativeAudioRecorder();
    private File outputFile;
    private long recordingStartedAt = 0L;
    private long pausedAccumMs = 0L;
    private long lastResumeAt = 0L;
    private PowerManager.WakeLock wakeLock;
    private MediaSession mediaSession;
    private AudioFocusRequest audioFocusRequest;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        releaseWakeLock();
        releaseAudioFocus();
        releaseMediaSession();
        super.onDestroy();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_START.equals(action)) handleStart();
        else if (ACTION_PAUSE.equals(action)) handlePause();
        else if (ACTION_RESUME.equals(action)) handleResume();
        else if (ACTION_STOP.equals(action)) handleStop();
        return START_STICKY;
    }

    private void handleStart() {
        if ("RECORDING".equals(currentStatus)) return;

        createNotificationChannel();
        setupMediaSession();
        Notification notification = buildNotification("Nagrywanie…");

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            int combinedType = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                    | ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK;
            startForeground(NOTIFICATION_ID, notification, combinedType);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "PitchRec:BackgroundRecorderWakeLock");
            wakeLock.setReferenceCounted(false);
            wakeLock.acquire(4 * 60 * 60 * 1000L);
        } catch (Exception e) { /* ignorowane */ }

        try {
            AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                AudioAttributes attrs = new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build();
                audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                        .setAudioAttributes(attrs)
                        .build();
                am.requestAudioFocus(audioFocusRequest);
            } else {
                //noinspection deprecation
                am.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
            }
        } catch (Exception e) { /* ignorowane */ }

        try {
            outputFile = new File(getCacheDir(), "bg_recording_" + System.currentTimeMillis() + ".wav");
            boolean started = nativeRecorder.nativeStart(outputFile.getAbsolutePath());
            if (!started) {
                throw new IOException("nativeStart() zwrocilo false — nagrywanie nie wystartowalo");
            }

            recordingStartedAt = System.currentTimeMillis();
            pausedAccumMs = 0L;
            lastResumeAt = recordingStartedAt;
            currentStatus = "RECORDING";
        } catch (Exception e) {
            currentStatus = "NONE";
            releaseWakeLock();
            releaseAudioFocus();
            releaseMediaSession();
            BackgroundRecorderPlugin.rejectStop("FAILED_TO_RECORD", e.getMessage());
            stopForegroundCompat();
            stopSelf();
        }
    }

    private void handlePause() {
        if (!"RECORDING".equals(currentStatus)) return;
        nativeRecorder.nativePause();
        pausedAccumMs += System.currentTimeMillis() - lastResumeAt;
        currentStatus = "PAUSED";
        updatePlaybackState(PlaybackState.STATE_PAUSED);
        updateNotification("Pauza");
    }

    private void handleResume() {
        if (!"PAUSED".equals(currentStatus)) return;
        nativeRecorder.nativeResume();
        lastResumeAt = System.currentTimeMillis();
        currentStatus = "RECORDING";
        updatePlaybackState(PlaybackState.STATE_PLAYING);
        updateNotification("Nagrywanie…");
    }

    private void handleStop() {
        if ("NONE".equals(currentStatus)) {
            BackgroundRecorderPlugin.rejectStop("RECORDING_HAS_NOT_STARTED", null);
            stopForegroundCompat();
            stopSelf();
            return;
        }
        try {
            long pcmBytesWritten = nativeRecorder.nativeStop();

            if (outputFile == null || !outputFile.exists() || pcmBytesWritten == 0L) {
                BackgroundRecorderPlugin.rejectStop("EMPTY_RECORDING", null);
            } else {
                long durationMs = System.currentTimeMillis() - recordingStartedAt - pausedAccumMs;
                byte[] bytes = readFileBytes(outputFile);
                String base64 = Base64.encodeToString(bytes, Base64.NO_WRAP);
                BackgroundRecorderPlugin.resolveStop(base64, durationMs, "audio/wav");
                outputFile.delete();
            }
        } catch (Exception e) {
            BackgroundRecorderPlugin.rejectStop("FAILED_TO_FETCH_RECORDING", e.getMessage());
        } finally {
            currentStatus = "NONE";
            releaseWakeLock();
            releaseAudioFocus();
            releaseMediaSession();
            stopForegroundCompat();
            stopSelf();
        }
    }

    private byte[] readFileBytes(File file) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        try (FileInputStream fis = new FileInputStream(file)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = fis.read(buffer)) != -1) {
                bos.write(buffer, 0, read);
            }
        }
        return bos.toByteArray();
    }

    private void setupMediaSession() {
        if (mediaSession != null) return;
        try {
            MediaSession session = new MediaSession(this, "PitchRecBackgroundRecorder");
            session.setCallback(new MediaSession.Callback() {});
            PlaybackState state = new PlaybackState.Builder()
                    .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_STOP)
                    .setState(PlaybackState.STATE_PLAYING, 0, 1f)
                    .build();
            session.setPlaybackState(state);
            session.setActive(true);
            mediaSession = session;
        } catch (Exception e) { /* ignorowane */ }
    }

    private void updatePlaybackState(int state) {
        try {
            float speed = (state == PlaybackState.STATE_PLAYING) ? 1f : 0f;
            PlaybackState playbackState = new PlaybackState.Builder()
                    .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_STOP)
                    .setState(state, 0, speed)
                    .build();
            if (mediaSession != null) mediaSession.setPlaybackState(playbackState);
        } catch (Exception e) { }
    }

    private void releaseMediaSession() {
        try {
            if (mediaSession != null) {
                mediaSession.setActive(false);
                mediaSession.release();
            }
        } catch (Exception e) { }
        mediaSession = null;
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Exception e) { }
        wakeLock = null;
    }

    private void releaseAudioFocus() {
        try {
            AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) {
                am.abandonAudioFocusRequest(audioFocusRequest);
            } else {
                //noinspection deprecation
                am.abandonAudioFocus(null);
            }
        } catch (Exception e) { }
        audioFocusRequest = null;
    }

    private void stopForegroundCompat() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            //noinspection deprecation
            stopForeground(true);
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "Nagrywanie w tle", NotificationManager.IMPORTANCE_LOW);
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            manager.createNotificationChannel(channel);
        }
    }

    private Notification buildNotification(String text) {
        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            //noinspection deprecation
            builder = new Notification.Builder(this);
        }
        builder.setContentTitle("PitchRec")
                .setContentText(text)
                .setSmallIcon(getApplicationInfo().icon)
                .setOngoing(true);

        if (mediaSession != null) {
            try {
                builder.setStyle(new Notification.MediaStyle().setMediaSession(mediaSession.getSessionToken()));
            } catch (Exception e) { }
        }

        return builder.build();
    }

    private void updateNotification(String text) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        manager.notify(NOTIFICATION_ID, buildNotification(text));
    }
}
