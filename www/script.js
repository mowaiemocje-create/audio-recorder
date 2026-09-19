async function startRecording() {
  if (window.Capacitor && window.Capacitor.isNativePlatform()) {
    try {
      const VoiceRecorder = window.Capacitor.Plugins.VoiceRecorder;

      // 1. Sprawdzenie statusu uprawnień
      const status = await VoiceRecorder.hasAudioRecordingPermission();
      
      if (!status.value) {
        // 2. Wymuszenie okna dialogowego w Androidzie
        const requested = await VoiceRecorder.requestAudioRecordingPermission();
        if (!requested.value) {
          alert("Uprawnienie do mikrofonu jest wymagane do nagrywania.");
          return;
        }
      }

      // 3. Rozpoczęcie nagrywania w tle
      await VoiceRecorder.startRecording();
      console.log("Natywne nagrywanie w tle zostało uruchomione.");
    } catch (err) {
      console.error("Błąd nagrywania:", err);
      alert("Błąd mikrofonu: " + (err.message || err));
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
