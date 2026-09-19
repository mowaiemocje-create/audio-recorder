package com.pitchrec.backgroundrecorder

import android.content.Intent
import android.os.Build
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

@CapacitorPlugin(
    name = "BackgroundRecorder",
    permissions = [
        Permission(strings = [android.Manifest.permission.RECORD_AUDIO], alias = "microphone")
    ]
)
class BackgroundRecorderPlugin : Plugin() {

    @PluginMethod
    fun hasAudioRecordingPermission(call: PluginCall) {
        val granted = getPermissionState("microphone") == com.getcapacitor.PermissionState.GRANTED
        val ret = JSObject()
        ret.put("value", granted)
        call.resolve(ret)
    }

    @PluginMethod
    fun requestAudioRecordingPermission(call: PluginCall) {
        if (getPermissionState("microphone") == com.getcapacitor.PermissionState.GRANTED) {
            val ret = JSObject()
            ret.put("value", true)
            call.resolve(ret)
            return
        }
        requestPermissionForAlias("microphone", call, "permissionCallback")
    }

    @PermissionCallback
    private fun permissionCallback(call: PluginCall) {
        val granted = getPermissionState("microphone") == com.getcapacitor.PermissionState.GRANTED
        val ret = JSObject()
        ret.put("value", granted)
        call.resolve(ret)
    }

    @PluginMethod
    fun startRecording(call: PluginCall) {
        if (getPermissionState("microphone") != com.getcapacitor.PermissionState.GRANTED) {
            call.reject("MISSING_PERMISSION")
            return
        }
        try {
            val intent = Intent(context, BackgroundRecorderService::class.java)
            intent.action = BackgroundRecorderService.ACTION_START
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
            val ret = JSObject()
            ret.put("value", true)
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("FAILED_TO_RECORD", e.message)
        }
    }

    @PluginMethod
    fun pauseRecording(call: PluginCall) {
        sendAction(BackgroundRecorderService.ACTION_PAUSE)
        val ret = JSObject()
        ret.put("value", true)
        call.resolve(ret)
    }

    @PluginMethod
    fun resumeRecording(call: PluginCall) {
        sendAction(BackgroundRecorderService.ACTION_RESUME)
        val ret = JSObject()
        ret.put("value", true)
        call.resolve(ret)
    }

    @PluginMethod
    fun stopRecording(call: PluginCall) {
        pendingStopCall = call
        val intent = Intent(context, BackgroundRecorderService::class.java)
        intent.action = BackgroundRecorderService.ACTION_STOP
        context.startService(intent)
    }

    @PluginMethod
    fun getCurrentStatus(call: PluginCall) {
        val ret = JSObject()
        ret.put("status", BackgroundRecorderService.currentStatus)
        call.resolve(ret)
    }

    private fun sendAction(action: String) {
        val intent = Intent(context, BackgroundRecorderService::class.java)
        intent.action = action
        context.startService(intent)
    }

    companion object {
        var pendingStopCall: PluginCall? = null

        fun resolveStop(base64: String, durationMs: Long, mimeType: String) {
            val ret = JSObject()
            ret.put("recordDataBase64", base64)
            ret.put("msDuration", durationMs)
            ret.put("mimeType", mimeType)
            pendingStopCall?.resolve(ret)
            pendingStopCall = null
        }

        fun rejectStop(code: String, message: String?) {
            pendingStopCall?.reject(code, message)
            pendingStopCall = null
        }
    }
}
