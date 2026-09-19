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

      // 1. Sprawdź i zażądaj uprawnień do mikrofonu i powiadomień
      const hasMicPerm = await VoiceRecorder.hasAudioRecordingPermission();
      if (!hasMicPerm.value) {
        const reqMic = await VoiceRecorder.requestAudioRecordingPermission();
        if (!reqMic.value) {
          alert("Brak uprawnień do mikrofonu.");
          return;
        }
      }

      // 2. Włącz nagrywanie natywne
      const result = await VoiceRecorder.startRecording();
      if (result.value) {
        isRecording = true;
        console.log("Natywne nagrywanie w tle uruchomione.");
        if (typeof updateUI === "function") updateUI(true);
        if (typeof startVisualizer === "function") startVisualizer();
      }
    } catch (err) {
      console.error("Błąd natywnego nagrywania:", err);
      alert("Błąd mikrofonu: " + (err.message || err));
    }
  } else {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      isRecording = true;
      if (typeof updateUI === "function") updateUI(true);
    } catch (err) {
      alert("Błąd mikrofonu: " + err.message);
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
      if (typeof stopVisualizer === "function") stopVisualizer();

      alert("Nagranie zakończone i zapisane!");
    } catch (err) {
      console.error("Błąd zatrzymywania nagrywania:", err);
    }
  } else {
    isRecording = false;
    if (typeof updateUI === "function") updateUI(false);
  }
}
