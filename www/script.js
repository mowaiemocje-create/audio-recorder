let isRecording = false;
let audioChunks = [];

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

      const result = await VoiceRecorder.startRecording();
      if (result.value) {
        isRecording = true;
        console.log("Natywne nagrywanie w tle zostało uruchomione.");
        
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
      console.log("Strumień otwarty w przeglądarce");
      isRecording = true;
      if (typeof updateUI === "function") updateUI(true);
    } catch (err) {
      alert("Błąd mikrofonu w przeglądarce: " + err.message);
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

      console.log("Nagranie zakończone:", result.value);
      alert("Nagranie pomyślnie zapisane!");
    } catch (err) {
      console.error("Błąd zatrzymywania natywnego nagrywania:", err);
    }
  } else {
    isRecording = false;
    if (typeof updateUI === "function") updateUI(false);
  }
}
