let isRecording = false;

async function toggleRecording() {
  if (!isRecording) {
    await startNativeRecording();
  } else {
    await stopNativeRecording();
  }
}

async function startNativeRecording() {
  if (!(window.Capacitor && window.Capacitor.isNativePlatform())) {
    alert("Aplikacja musi być uruchomiona jako plik APK na telefonie!");
    return;
  }
  try {
    const BackgroundRecorder = window.Capacitor.Plugins.BackgroundRecorder;

    const hasPerm = await BackgroundRecorder.hasAudioRecordingPermission();
    if (!hasPerm.value) {
      const req = await BackgroundRecorder.requestAudioRecordingPermission();
      if (!req.value) {
        alert("Brak zgody na mikrofon w systemie Android.");
        return;
      }
    }

    const result = await BackgroundRecorder.startRecording();
    if (result.value) {
      isRecording = true;
      if (typeof updateUI === "function") updateUI(true);
      if (typeof startVisualizer === "function") startVisualizer();
    }
  } catch (err) {
    alert("Błąd startu nagrywania: " + JSON.stringify(err));
  }
}

async function pauseNativeRecording() {
  if (!(window.Capacitor && window.Capacitor.isNativePlatform())) return;
  try {
    await window.Capacitor.Plugins.BackgroundRecorder.pauseRecording();
  } catch (err) {
    alert("Błąd pauzy: " + JSON.stringify(err));
  }
}

async function resumeNativeRecording() {
  if (!(window.Capacitor && window.Capacitor.isNativePlatform())) return;
  try {
    await window.Capacitor.Plugins.BackgroundRecorder.resumeRecording();
  } catch (err) {
    alert("Błąd wznowienia: " + JSON.stringify(err));
  }
}

async function stopNativeRecording() {
  if (!(window.Capacitor && window.Capacitor.isNativePlatform())) return;
  try {
    const BackgroundRecorder = window.Capacitor.Plugins.BackgroundRecorder;
    const result = await BackgroundRecorder.stopRecording();
    isRecording = false;

    if (typeof updateUI === "function") updateUI(false);
    if (typeof stopVisualizer === "function") stopVisualizer();

    if (typeof handleRecordingFinished === "function") {
      handleRecordingFinished(result.recordDataBase64, result.msDuration, result.mimeType);
    }

    alert("Nagranie pomyślnie zapisane!");
  } catch (err) {
    alert("Błąd zatrzymywania: " + JSON.stringify(err));
  }
}
