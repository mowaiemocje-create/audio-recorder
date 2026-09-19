let nativeMediaRecorder = null;
let webMediaRecorder = null;
let audioChunks = [];
let currentRecordingFile = '';

// Inicjalizacja pracy w tle
document.addEventListener('deviceready', () => {
  if (window.cordova && window.cordova.plugins && window.cordova.plugins.backgroundMode) {
    const bg = window.cordova.plugins.backgroundMode;
    bg.setDefaults({
      title: 'Nagrywanie w tle',
      text: 'Natywne nagrywanie audio jest aktywne...',
      resume: true,
      hidden: false
    });
    bg.enable();
    bg.disableWebViewOptimizations();
  }
}, false);

// Start nagrywania (Natywny na telefonie / Web w przeglądarce)
async function startRecording() {
  // 1. Aktywacja usługi w tle
  if (window.cordova && window.cordova.plugins && window.cordova.plugins.backgroundMode) {
    window.cordova.plugins.backgroundMode.enable();
    window.cordova.plugins.backgroundMode.disableWebViewOptimizations();
  }

  // 2. Jeśli uruchomione w aplikacji APK (dostępny moduł Media)
  if (window.Media) {
    currentRecordingFile = 'audio_record_' + Date.now() + '.m4a';
    
    // Utworzenie natywnego rejestratora w kodzie Androida
    nativeMediaRecorder = new Media(
      currentRecordingFile,
      () => console.log("Natywne nagrywanie zakończone sukcesem"),
      (err) => console.error("Błąd natywnego nagrywania:", err)
    );

    nativeMediaRecorder.startRecord();
    console.log("Uruchomiono NATYWNE nagrywanie Androida (działa bez limitu w tle)");
  } 
  // 3. Fallback dla zwykłej przeglądarki WWW (Cloudflare Pages)
  else {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    webMediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    webMediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    webMediaRecorder.start(100);
    console.log("Uruchomiono nagrywanie w przeglądarce Web");
  }
}

// Zatrzymanie nagrywania
async function stopRecording() {
  // Zatrzymanie nagrywania natywnego
  if (nativeMediaRecorder) {
    nativeMediaRecorder.stopRecord();
    nativeMediaRecorder.release();
    
    console.log("Natywne nagrywanie zatrzymane. Plik:", currentRecordingFile);
    alert("Nagranie w tle zostało zapisane natywnie!");
    nativeMediaRecorder = null;
  }

  // Zatrzymanie nagrywania Web
  if (webMediaRecorder && webMediaRecorder.state !== 'inactive') {
    webMediaRecorder.stop();
    webMediaRecorder = null;
  }

  // Wyłączenie trybu background mode
  if (window.cordova && window.cordova.plugins && window.cordova.plugins.backgroundMode) {
    window.cordova.plugins.backgroundMode.disable();
  }
}
