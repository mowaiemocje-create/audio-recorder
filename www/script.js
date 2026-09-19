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

      const hasPermission = await VoiceRecorder.hasAudioRecordingPermission();
      if (!hasPermission.value) {
        const requested = await VoiceRecorder.requestAudioRecordingPermission();
        if (!requested.value) {
          alert("Brak uprawnień do mikrofonu.");
          return;
        }
      }

      // Uruchomienie z parametrem nagrywania w tle
      const result = await VoiceRecorder.startRecording();
      if (result.value) {
        isRecording = true;
        console.log("Natywne nagrywanie zostało uruchomione.");
        if (typeof updateUI === "function") updateUI(true);
      }
    } catch (err) {
      console.error("Błąd natywnego nagrywania:", err);
      alert("Błąd mikrofonu: " + (err.message || err));
    }
  }
}

async function stopNativeRecording() {
  if (window.Capacitor && window.Capacitor.isNativePlatform()) {
    try {
      const VoiceRecorder = window.Capacitor.Plugins.VoiceRecorder;
      const result = await VoiceRecorder.stopRecording();
      isRecording = false;
      if (typeof updateUI === "function") updateUI(false);
      alert("Nagranie pomyślnie zapisane!");
    } catch (err) {
      console.error("Błąd zatrzymywania:", err);
    }
  }
}
