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
      const KeepAwake = window.Capacitor.Plugins.KeepAwake;

      // 1. Zapobiegaj uśpieniu procesora po wygaszeniu ekranu
      if (KeepAwake) {
        await KeepAwake.keepAwake();
      }

      // 2. Sprawdź uprawnienia do mikrofonu
      const hasPerm = await VoiceRecorder.hasAudioRecordingPermission();
      if (!hasPerm.value) {
        const req = await VoiceRecorder.requestAudioRecordingPermission();
        if (!req.value) {
          alert("Brak zgody na mikrofon.");
          return;
        }
      }

      // 3. Rozpocznij nagrywanie natywne
      const result = await VoiceRecorder.startRecording();
      if (result.value) {
        isRecording = true;
        if (typeof updateUI === "function") updateUI(true);
        if (typeof startVisualizer === "function") startVisualizer();
      }
    } catch (err) {
      alert("Błąd startu nagrywania: " + JSON.stringify(err));
    }
  }
}

async function stopNativeRecording() {
  if (window.Capacitor && window.Capacitor.isNativePlatform()) {
    try {
      const VoiceRecorder = window.Capacitor.Plugins.VoiceRecorder;
      const KeepAwake = window.Capacitor.Plugins.KeepAwake;

      const result = await VoiceRecorder.stopRecording();
      isRecording = false;

      // Zezwól na ponowne usypianie urządzenia
      if (KeepAwake) {
        await KeepAwake.allowSleep();
      }

      if (typeof updateUI === "function") updateUI(false);
      if (typeof stopVisualizer === "function") stopVisualizer();

      alert("Nagranie zakończone i zapisane!");
    } catch (err) {
      alert("Błąd zatrzymywania: " + JSON.stringify(err));
    }
  }
}
