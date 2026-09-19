let isRecordingNative = false;

async function toggleRecording() {
  if (!isRecordingNative) {
    await startNativeRecording();
  } else {
    await stopNativeRecording();
  }
}

async function startNativeRecording() {
  if (window.Capacitor && window.Capacitor.isNativePlatform()) {
    try {
      const VoiceRecorder = window.Capacitor.Plugins.VoiceRecorder;

      // 1. Sprawdzenie i prośba o uprawnienia systemowe Androida
      const hasPermission = await VoiceRecorder.hasAudioRecordingPermission();
      if (!hasPermission.value) {
        const requested = await VoiceRecorder.requestAudioRecordingPermission();
        if (!requested.value) {
          alert("Brak uprawnień do mikrofonu.");
          return;
        }
      }

      // 2. Wywołanie czystego, natywnego rejestratora w Javie (Foreground Service)
      const result = await VoiceRecorder.startRecording();
      if (result.value) {
        isRecordingNative = true;
        console.log("Natywne nagrywanie w Javie (Foreground Service) zostało uruchomione.");
        updateUI(true);
      }
    } catch (err) {
      console.error("Błąd uruchamiania natywnego nagrywania:", err);
      alert("Błąd nagrywania natywnego: " + (err.message || err));
    }
  } else {
    alert("Natywne nagrywanie w tle wymaga uruchomienia na telefonie Android.");
  }
}

async function stopNativeRecording() {
  if (window.Capacitor && window.Capacitor.isNativePlatform()) {
    try {
      const VoiceRecorder = window.Capacitor.Plugins.VoiceRecorder;
      const result = await VoiceRecorder.stopRecording();
      isRecordingNative = false;
      updateUI(false);
      
      console.log("Nagranie natywne zakończone sukcesem:", result.value);
      alert("Nagranie natywne zostało pomyślnie zapisane!");
    } catch (err) {
      console.error("Błąd zatrzymywania natywnego nagrywania:", err);
    }
  }
}

function updateUI(recording) {
  const btn = document.getElementById("recordBtn") || document.querySelector("button");
  if (btn) {
    btn.innerText = recording ? "Stop Recording" : "Start Recording";
    btn.style.backgroundColor = recording ? "#dc3545" : "#28a745";
  }
}
