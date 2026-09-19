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
      const KeepAwake = window.Capacitor.Plugins.KeepAwake || (window.CapacitorCommunity && window.CapacitorCommunity.KeepAwake);

      // Podtrzymanie pracy procesora po zablokowaniu ekranu
      if (KeepAwake && typeof KeepAwake.keepAwake === "function") {
        try { await KeepAwake.keepAwake(); } catch (e) { console.log("KeepAwake opt error:", e); }
      }

      // Sprawdzenie uprawnień do mikrofonu
      const hasPerm = await VoiceRecorder.hasAudioRecordingPermission();
      if (!hasPerm.value) {
        const req = await VoiceRecorder.requestAudioRecordingPermission();
        if (!req.value) {
          alert("Brak zgody na mikrofon w systemie Android.");
          return;
        }
      }

      // Rozpoczęcie nagrywania natywnego
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
      const KeepAwake = window.Capacitor.Plugins.KeepAwake || (window.CapacitorCommunity && window.CapacitorCommunity.KeepAwake);

      const result = await VoiceRecorder.stopRecording();
      isRecording = false;

      if (KeepAwake && typeof KeepAwake.allowSleep === "function") {
        try { await KeepAwake.allowSleep(); } catch (e) {}
      }

      if (typeof updateUI === "function") updateUI(false);
      if (typeof stopVisualizer === "function") stopVisualizer();

      alert("Nagranie zakończone i zapisane!");
    } catch (err) {
      alert("Błąd zatrzymywania: " + JSON.stringify(err));
    }
  }
}
