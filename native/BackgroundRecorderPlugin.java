package com.pitchrec.backgroundrecorder;

import android.content.Intent;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.PermissionState;

@CapacitorPlugin(
    name = "BackgroundRecorder",
    permissions = {
        @Permission(strings = { android.Manifest.permission.RECORD_AUDIO }, alias = "microphone")
    }
)
public class BackgroundRecorderPlugin extends Plugin {

    static PluginCall pendingStopCall;

    @PluginMethod
    public void hasAudioRecordingPermission(PluginCall call) {
        boolean granted = getPermissionState("microphone") == PermissionState.GRANTED;
        JSObject ret = new JSObject();
        ret.put("value", granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestAudioRecordingPermission(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            JSObject ret = new JSObject();
            ret.put("value", true);
            call.resolve(ret);
            return;
        }
        requestPermissionForAlias("microphone", call, "permissionCallback");
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        boolean granted = getPermissionState("microphone") == PermissionState.GRANTED;
        JSObject ret = new JSObject();
        ret.put("value", granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void startRecording(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            call.reject("MISSING_PERMISSION");
            return;
        }
        try {
            Intent intent = new Intent(getContext(), BackgroundRecorderService.class);
            intent.setAction(BackgroundRecorderService.ACTION_START);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(intent);
            } else {
                getContext().startService(intent);
            }
            JSObject ret = new JSObject();
            ret.put("value", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("FAILED_TO_RECORD", e.getMessage());
        }
    }

    @PluginMethod
    public void pauseRecording(PluginCall call) {
        sendAction(BackgroundRecorderService.ACTION_PAUSE);
        JSObject ret = new JSObject();
        ret.put("value", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void resumeRecording(PluginCall call) {
        sendAction(BackgroundRecorderService.ACTION_RESUME);
        JSObject ret = new JSObject();
        ret.put("value", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void stopRecording(PluginCall call) {
        pendingStopCall = call;
        Intent intent = new Intent(getContext(), BackgroundRecorderService.class);
        intent.setAction(BackgroundRecorderService.ACTION_STOP);
        getContext().startService(intent);
    }

    @PluginMethod
    public void getCurrentStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("status", BackgroundRecorderService.currentStatus);
        call.resolve(ret);
    }

    @PluginMethod
    public void isIgnoringBatteryOptimizations(PluginCall call) {
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        boolean ignoring = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            ignoring = pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
        }
        JSObject ret = new JSObject();
        ret.put("value", ignoring);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            JSObject ret = new JSObject();
            ret.put("value", true);
            call.resolve(ret);
            return;
        }
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        if (pm.isIgnoringBatteryOptimizations(getContext().getPackageName())) {
            JSObject ret = new JSObject();
            ret.put("value", true);
            call.resolve(ret);
            return;
        }
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            getActivity().startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("value", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("FAILED_TO_REQUEST", e.getMessage());
        }
    }

    private void sendAction(String action) {
        Intent intent = new Intent(getContext(), BackgroundRecorderService.class);
        intent.setAction(action);
        getContext().startService(intent);
    }

    static void resolveStop(String base64, long durationMs, String mimeType) {
        JSObject ret = new JSObject();
        ret.put("recordDataBase64", base64);
        ret.put("msDuration", durationMs);
        ret.put("mimeType", mimeType);
        if (pendingStopCall != null) {
            pendingStopCall.resolve(ret);
            pendingStopCall = null;
        }
    }

    static void rejectStop(String code, String message) {
        if (pendingStopCall != null) {
            pendingStopCall.reject(code, message);
            pendingStopCall = null;
        }
    }
}
