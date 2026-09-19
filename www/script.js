// Zmienna do śledzenia stanu
let isRecording = false;
let autoStopTimer = null;

// Główna funkcja wywoływana przez Twój przycisk
async function toggleRecording() {
  if (!isRecording) {
    await startNativeRecording();
  } else {
    await stopNativeRecording();
  }
}

async function startNativeRecording() {
  // Jeśli uruchomiono na telefonie z Capacitor
  if (window.Capacitor && window.Capacitor.isNativePlatform()) {
    try {
      const VoiceRecorder = window.Capacitor.Plugins.VoiceRecorder;

      // Sprawdzenie uprawnień
      const hasPerm = await VoiceRecorder.hasAudioRecordingPermission();
      if (!hasPerm.value) {
        const req = await VoiceRecorder.requestAudioRecordingPermission();
        if (!req.value) {
          alert("Brak zgody na mikrofon.");
          return;
        }
      }

      // Start nagrywania natywnego
      const result = await VoiceRecorder.startRecording();
      if (result.value) {
        isRecording = true;
        console.log("Natywne nagrywanie uruchomione.");

        // Wyczyszczenie ewentualnych timerów, które mogłyby zatrzymać nagrywanie po 5s
        if (autoStopTimer) clearTimeout(autoStopTimer);

        // Wywołanie Twoich oryginalnych funkcji interfejsu (jeśli istnieją w index.html)
        if (typeof updateUI === "function") updateUI(true);
        if (typeof startVisualizer === "function") startVisualizer();
      }
    } catch (err) {
      alert("Błąd natywnego nagrywania: " + JSON.stringify(err));
    }
  } else {
    alert("Aplikacja nie działa w trybie natywnym Androida!");
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
      alert("Błąd zatrzymywania: " + JSON.stringify(err));
    }
  }
}
