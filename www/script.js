import { MediaRecorder } from '@capacitor-community/media-recorder';

async function startRecording() {
  try {
    // Sprawdzenie i wymuszenie uprawnień
    await MediaRecorder.requestPermissions();
    
    // Rozpoczęcie natywnego nagrywania w tle
    await MediaRecorder.startRecording({
      fileName: 'recording_' + Date.now() + '.aac'
    });
    console.log("Natywne nagrywanie w tle uruchomione.");
  } catch (err) {
    console.error("Błąd nagrywania:", err);
    alert("Błąd: " + (err.message || err));
  }
}

async function stopRecording() {
  try {
    const result = await MediaRecorder.stopRecording();
    alert("Nagranie zapisane: " + result.value.recordUrl);
  } catch (err) {
    console.error("Błąd zatrzymania:", err);
  }
}
