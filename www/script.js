import { BackgroundMode } from '@capacitor-community/background-mode';

let mediaRecorder;
let audioChunks = [];

async function startRecording() {
  // Włączenie usługi w tle, chroniącej proces przed zamknięciem przez Androida
  try {
    await BackgroundMode.enable();
    await BackgroundMode.disableWebViewOptimizations(); // Utrzymuje pętlę zdarzeń JS przy zablokowanym ekranie
  } catch (e) {
    console.log('Uruchomiono w standardowej przeglądarce');
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);
  audioChunks = [];

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      audioChunks.push(event.data);
      // Przekaż dane do swojego wykresu audio
      updateAudioChart(event.data);
    }
  };

  mediaRecorder.start(100); // Próbkowanie co 100ms
}

async function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  try {
    await BackgroundMode.disable();
  } catch (e) {
    console.log('Tło wyłączone');
  }
}