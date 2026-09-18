

let mediaRecorder;
let audioChunks = [];

async function startRecording() {
  // Włączenie usługi w tle na telefonie (jeśli uruchomione jako APK)
  if (window.cordova && window.cordova.plugins && window.cordova.plugins.backgroundMode) {
    window.cordova.plugins.backgroundMode.enable();
    window.cordova.plugins.backgroundMode.disableWebViewOptimizations();
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);
  audioChunks = [];

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      audioChunks.push(event.data);
      updateAudioChart(event.data);
    }
  };

  mediaRecorder.start(100);
}

async function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  if (window.cordova && window.cordova.plugins && window.cordova.plugins.backgroundMode) {
    window.cordova.plugins.backgroundMode.disable();
  }
}