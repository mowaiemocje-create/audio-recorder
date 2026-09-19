async function startRecording() {
  if (window.Capacitor && window.Capacitor.isNativePlatform()) {
    try {
      const VoiceRecorder = window.Capacitor.Plugins.VoiceRecorder;
      
      // 1. Sprawdzenie i prośba o uprawnienia
      const hasPermission = await VoiceRecorder.hasAudioRecordingPermission();
      if (!hasPermission.value) {
        await VoiceRecorder.requestAudioRecordingPermission();
      }

      // 2. Uruchomienie natywnego nagrywania w tle
      await VoiceRecorder.startRecording();
      console.log("Natywne nagrywanie w tle uruchomione.");
    } catch (err) {
      console.error("Błąd nagrywania:", err);
      alert("Błąd: " + (err.message || err));
    }
    return;
  }
}

async function stopRecording() {
  if (window.Capacitor && window.Capacitor.isNativePlatform()) {
    try {
      const VoiceRecorder = window.Capacitor.Plugins.VoiceRecorder;
      const result = await VoiceRecorder.stopRecording();
      console.log("Nagranie zakończone:", result.value);
      alert("Nagranie zostało pomyślnie zapisane!");
    } catch (err) {
      console.error("Błąd zatrzymania:", err);
    }
  }
}
