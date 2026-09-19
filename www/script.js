let isRecording = false;

async function toggleRecording() {
  if (!isRecording) {
    await startNativeRecording();
  } else {
    await stopNativeRecording();
  }
}

async function startNativeRecording() {
  // Wymuszamy sprawdzenie obecności natywnej wtyczki
  if (!window.Capacitor || !window.Capacitor.isNativePlatform()) {
    alert("BŁĄD: Aplikacja uruchomiła się w trybie przeglądarkowym, a nie natywnym Androidzie!");
    return;
  }

  const VoiceRecorder = window.Capacitor.Plugins.VoiceRecorder;

  if (!VoiceRecorder) {
    alert("BŁĄD: Wtyczka VoiceRecorder nie została załadowana w Androidzie.");
    return;
  }

  try {
    // Sprawdzenie i prośba o uprawnienia
    const hasPerm = await VoiceRecorder.hasAudioRecordingPermission();
    if (!hasPerm.value) {
      const req = await VoiceRecorder.requestAudioRecordingPermission();
      if (!req.value) {
        alert("Brak zgody na mikrofon w systemie Android.");
        return;
      }
    }

    // Start natywnego nagrywania
    const startResult = await VoiceRecorder.startRecording();
    if (startResult.value) {
      isRecording = true;
      console.log("Natywne nagrywanie rozpoczęte.");
      if (typeof updateUI === "function") updateUI(true);
      if (typeof startVisualizer === "function") startVisualizer();
    } else {
      alert("Nie udało się uruchomić natywnego nagrywania.");
    }
  } catch (err) {
    console.error("Błąd podczas startu nagrywania:", err);
    alert("Błąd natywny: " + JSON.stringify(err));
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

    alert("Nagranie zapisane pomyślnie w pamięci natywnej!");
  } catch (err) {
    console.error("Błąd zatrzymywania nagrania:", err);
    alert("Błąd podczas zatrzymywania: " + JSON.stringify(err));
  }
}
