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
import android.media.MediaRecorder;
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

// Prawdziwy Android Foreground Service z nagrywaniem MediaRecorder wewnątrz. Prosta,
// sprawdzona wersja — działa poprawnie przy targetSdkVersion 33 (aktualnie używanym, bo
// aplikacja jest na razie dystrybuowana bezpośrednio, nie przez Google Play). Bardziej
// złożone podejścia (ręczna pętla AudioRecord w Javie, natywny kod C++/AAudio) były próbą
// obejścia restrykcji specyficznych dla SDK 35 — niepotrzebne przy SDK 33.
public class BackgroundRecorderService extends Service {

    public static final String ACTION_START = "com.pitchrec.backgroundrecorder.START";
    public static final String ACTION_PAUSE = "com.pitchrec.backgroundrecorder.PAUSE";
    public static final String ACTION_RESUME = "com.pitchrec.backgroundrecorder.RESUME";
    public static final String ACTION_STOP = "com.pitchrec.backgroundrecorder.STOP";
    public static final String CHANNEL_ID = "pitchrec_recording_channel";
    public static final int NOTIFICATION_ID = 1001;

    public static volatile String currentStatus = "NONE"; // "NONE" | "RECORDING" | "PAUSED"

    private MediaRecorder recorder;
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
            outputFile = new File(getCacheDir(), "bg_recording_" + System.currentTimeMillis() + ".m4a");
            recorder = new MediaRecorder();
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            recorder.setAudioEncodingBitRate(192000);
            recorder.setAudioSamplingRate(44100);
            recorder.setOutputFile(outputFile.getAbsolutePath());
            recorder.prepare();
            recorder.start();

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
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                recorder.pause();
                pausedAccumMs += System.currentTimeMillis() - lastResumeAt;
                currentStatus = "PAUSED";
                updatePlaybackState(PlaybackState.STATE_PAUSED);
                updateNotification("Pauza");
            }
        } catch (Exception e) { /* ignorowane */ }
    }

    private void handleResume() {
        if (!"PAUSED".equals(currentStatus)) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                recorder.resume();
                lastResumeAt = System.currentTimeMillis();
                currentStatus = "RECORDING";
                updatePlaybackState(PlaybackState.STATE_PLAYING);
                updateNotification("Nagrywanie…");
            }
        } catch (Exception e) { /* ignorowane */ }
    }

    private void handleStop() {
        if ("NONE".equals(currentStatus)) {
            BackgroundRecorderPlugin.rejectStop("RECORDING_HAS_NOT_STARTED", null);
            stopForegroundCompat();
            stopSelf();
            return;
        }
        try {
            recorder.stop();
            recorder.release();
            recorder = null;

            if (outputFile == null || !outputFile.exists() || outputFile.length() == 0L) {
                BackgroundRecorderPlugin.rejectStop("EMPTY_RECORDING", null);
            } else {
                long durationMs = System.currentTimeMillis() - recordingStartedAt - pausedAccumMs;
                byte[] bytes = readFileBytes(outputFile);
                String base64 = Base64.encodeToString(bytes, Base64.NO_WRAP);
                BackgroundRecorderPlugin.resolveStop(base64, durationMs, "audio/mp4");
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
