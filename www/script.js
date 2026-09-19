let isRecording = false;

async function toggleRecording() {
  if (!isRecording) {
    await startNativeRecording();
  } else {
    await stopNativeRecording();
  }
}

async function startNativeRecording() {
  if (window.Capacitor && window.Capacitor.isNativePlatform()) {
    try {
      const VoiceRecorder = window.Capacitor.Plugins.VoiceRecorder;

      // Sprawdzenie i prośba o uprawnienia do mikrofonu
      const hasPerm = await VoiceRecorder.hasAudioRecordingPermission();
      if (!hasPerm.value) {
        const req = await VoiceRecorder.requestAudioRecordingPermission();
        if (!req.value) {
          alert("Brak zgody na mikrofon w systemie Android.");
          return;
        }
      }

      // Start nagrywania natywnego
      const result = await VoiceRecorder.startRecording();
      if (result.value) {
        isRecording = true;
        if (typeof updateUI === "function") updateUI(true);
        if (typeof startVisualizer === "function") startVisualizer();
      }
    } catch (err) {
      alert("Błąd startu nagrywania: " + JSON.stringify(err));
    }
  } else {
    alert("Aplikacja musi być uruchomiona jako plik APK na telefonie!");
  }
}

async function stopNativeRecording() {
  if (window.Capacitor && window.Capacitor.isNativePlatform()) {
    try {
      const VoiceRecorder = window.Capacitor.Plugins.VoiceRecorder;
      const result = await VoiceRecorder.stopRecording();
      isRecording = false;

      if (typeof updateUI === "function") updateUI(false);
      if (typeof stopVisualizer === "function") stopVisualizer();

      alert("Nagranie pomyślnie zapisane!");
    } catch (err) {
      alert("Błąd zatrzymywania: " + JSON.stringify(err));
    }
  }
}
