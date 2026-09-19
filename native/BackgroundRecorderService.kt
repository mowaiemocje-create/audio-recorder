package com.pitchrec.backgroundrecorder

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.MediaRecorder
import android.os.Build
import android.os.IBinder
import android.util.Base64
import java.io.File

class BackgroundRecorderService : Service() {

    private var recorder: MediaRecorder? = null
    private var outputFile: File? = null
    private var recordingStartedAt: Long = 0L
    private var pausedAccumMs: Long = 0L
    private var lastResumeAt: Long = 0L

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> handleStart()
            ACTION_PAUSE -> handlePause()
            ACTION_RESUME -> handleResume()
            ACTION_STOP -> handleStop()
        }
        return START_STICKY
    }

    private fun handleStart() {
        if (currentStatus == "RECORDING") return

        createNotificationChannel()
        val notification = buildNotification("Nagrywanie…")

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        try {
            outputFile = File(cacheDir, "bg_recording_${System.currentTimeMillis()}.m4a")
            recorder = MediaRecorder().apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setAudioEncodingBitRate(192000)
                setAudioSamplingRate(44100)
                setOutputFile(outputFile!!.absolutePath)
                prepare()
                start()
            }
            recordingStartedAt = System.currentTimeMillis()
            pausedAccumMs = 0L
            lastResumeAt = recordingStartedAt
            currentStatus = "RECORDING"
        } catch (e: Exception) {
            currentStatus = "NONE"
            BackgroundRecorderPlugin.rejectStop("FAILED_TO_RECORD", e.message)
            stopForegroundCompat()
            stopSelf()
        }
    }

    private fun handlePause() {
        if (currentStatus != "RECORDING") return
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                recorder?.pause()
                pausedAccumMs += System.currentTimeMillis() - lastResumeAt
                currentStatus = "PAUSED"
                updateNotification("Pauza")
            }
        } catch (e: Exception) {}
    }

    private fun handleResume() {
        if (currentStatus != "PAUSED") return
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                recorder?.resume()
                lastResumeAt = System.currentTimeMillis()
                currentStatus = "RECORDING"
                updateNotification("Nagrywanie…")
            }
        } catch (e: Exception) {}
    }

    private fun handleStop() {
        if (currentStatus == "NONE") {
            BackgroundRecorderPlugin.rejectStop("RECORDING_HAS_NOT_STARTED", null)
            stopForegroundCompat()
            stopSelf()
            return
        }
        try {
            recorder?.stop()
            recorder?.release()
            recorder = null

            val file = outputFile
            if (file == null || !file.exists() || file.length() == 0L) {
                BackgroundRecorderPlugin.rejectStop("EMPTY_RECORDING", null)
            } else {
                val durationMs = System.currentTimeMillis() - recordingStartedAt - pausedAccumMs
                val bytes = file.readBytes()
                val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                BackgroundRecorderPlugin.resolveStop(base64, durationMs, "audio/mp4")
                file.delete()
            }
        } catch (e: Exception) {
            BackgroundRecorderPlugin.rejectStop("FAILED_TO_FETCH_RECORDING", e.message)
        } finally {
            currentStatus = "NONE"
            stopForegroundCompat()
            stopSelf()
        }
    }

    private fun stopForegroundCompat() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Nagrywanie w tle",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(text: String): Notification {
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        builder
            .setContentTitle("PitchRec")
            .setContentText(text)
            .setSmallIcon(applicationInfo.icon)
            .setOngoing(true)
        return builder.build()
    }

    private fun updateNotification(text: String) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID, buildNotification(text))
    }

    companion object {
        const val ACTION_START = "com.pitchrec.backgroundrecorder.START"
        const val ACTION_PAUSE = "com.pitchrec.backgroundrecorder.PAUSE"
        const val ACTION_RESUME = "com.pitchrec.backgroundrecorder.RESUME"
        const val ACTION_STOP = "com.pitchrec.backgroundrecorder.STOP"
        const val CHANNEL_ID = "pitchrec_recording_channel"
        const val NOTIFICATION_ID = 1001

        @Volatile
        var currentStatus: String = "NONE"
    }
}
