let isRecording = false;

async function toggleRecording() {
  if (!isRecording) {
    await startNativeRecording();
  } else {
    await stopNativeRecording();
  }
}

async function startNativeRecording() {
  if (!(window.Capacitor && window.Capacitor.isNativePlatform())) {
    alert("Aplikacja musi być uruchomiona jako plik APK na telefonie!");
    return;
  }
  try {
    const VoiceRecorder = window.Capacitor.Plugins.VoiceRecorder;
    const ForegroundService = window.Capacitor.Plugins.ForegroundService;

    // Sprawdzenie i prośba o uprawnienia do mikrofonu
    const hasPerm = await VoiceRecorder.hasAudioRecordingPermission();
    if (!hasPerm.value) {
      const req = await VoiceRecorder.requestAudioRecordingPermission();
      if (!req.value) {
        alert("Brak zgody na mikrofon w systemie Android.");
        return;
      }
    }

    if (ForegroundService) {
      await ForegroundService.startForegroundService({
        id: 1,
        title: "PitchRec",
        body: "Nagrywanie w tle...",
        smallIcon: "ic_stat_icon_config_sample",
        serviceType: "microphone"
      });
    }

    // Start nagrywania natywnego
    const result = await VoiceRecorder.startRecording();
    if (result.value) {
      isRecording = true;
      if (typeof updateUI === "function") updateUI(true);
      if (typeof startVisualizer === "function") startVisualizer();
    } else {
      if (ForegroundService) { try { await ForegroundService.stopForegroundService(); } catch (e) {} }
    }
  } catch (err) {
    alert("Błąd startu nagrywania: " + JSON.stringify(err));
  }
}

async function stopNativeRecording() {
  if (!(window.Capacitor && window.Capacitor.isNativePlatform())) return;
  try {
    const VoiceRecorder = window.Capacitor.Plugins.VoiceRecorder;
    const ForegroundService = window.Capacitor.Plugins.ForegroundService;
    const result = await VoiceRecorder.stopRecording();
    isRecording = false;

    if (ForegroundService) { try { await ForegroundService.stopForegroundService(); } catch (e) {} }

    if (typeof updateUI === "function") updateUI(false);
    if (typeof stopVisualizer === "function") stopVisualizer();

    alert("Nagranie pomyślnie zapisane!");
  } catch (err) {
    alert("Błąd zatrzymywania: " + JSON.stringify(err));
  }
}
