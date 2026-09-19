let isRecording = false;

async function toggleRecording() {
  if (!isRecording) {
    await startNativeRecording();
  } else {
    await stopNativeRecording();
  }
}

async function startNativeRecording() {
  if (!window.Capacitor || !window.Capacitor.isNativePlatform()) {
    alert("BŁĄD: Wyruchomiono w przeglądarce, a nie w aplikacji natywnej!");
    return;
  }

  const VoiceRecorder = window.Capacitor.Plugins.VoiceRecorder;

  try {
    // Sprawdzenie i prośba o uprawnienia do mikrofonu
    const hasPerm = await VoiceRecorder.hasAudioRecordingPermission();
    if (!hasPerm.value) {
      const req = await VoiceRecorder.requestAudioRecordingPermission();
      if (!req.value) {
        alert("Brak zgody na mikrofon.");
        return;
      }
    }

    // Uruchomienie ciągłego nagrywania
    const startResult = await VoiceRecorder.startRecording();
    if (startResult.value) {
      isRecording = true;
      if (typeof updateUI === "function") updateUI(true);
      if (typeof startVisualizer === "function") startVisualizer();
    } else {
      alert("Nie udało się uruchomić nagrywania.");
    }
  } catch (err) {
    alert("Błąd nagrywania: " + JSON.stringify(err));
  }
}

async function stopNativeRecording() {
  if (!window.Capacitor || !window.Capacitor.isNativePlatform()) return;

  try {
    const VoiceRecorder = window.Capacitor.Plugins.VoiceRecorder;
    const result = await VoiceRecorder.stopRecording();
    isRecording = false;

    if (typeof updateUI === "function") updateUI(false);
    if (typeof stopVisualizer === "function") stopVisualizer();

    alert("Nagranie zakończone i zapisane!");
  } catch (err) {
    alert("Błąd zatrzymywania: " + JSON.stringify(err));
  }
}
