let mediaRec = null;

// Inicjalizacja usługi w tle po gotowości urządzenia
document.addEventListener('deviceready', () => {
  if (window.cordova && window.cordova.plugins && window.cordova.plugins.backgroundMode) {
    const bg = window.cordova.plugins.backgroundMode;
    bg.setDefaults({
      title: 'Rejestrator dźwięku',
      text: 'Trwa nagrywanie audio w tle...',
      icon: 'icon',
      color: 'F14F4D',
      resume: true,
      hidden: false,
      bigText: true
    });
    bg.disableWebViewOptimizations();
  }
}, false);

async function startRecording() {
  // 1. Włącz powiadomienie i usługę Foreground Service w Androidzie
  if (window.cordova && window.cordova.plugins && window.cordova.plugins.backgroundMode) {
    window.cordova.plugins.backgroundMode.enable();
  }

  // 2. Uruchom natywne nagrywanie Media
  if (window.Media) {
    const src = "recording_" + Date.now() + ".m4a";
    mediaRec = new Media(
      src,
      () => console.log("Nagrywanie zakończone sukcesem"),
      (err) => console.error("Błąd nagrywania Media:", err)
    );
    
    mediaRec.startRecord();
    console.log("Natywne nagrywanie w tle uruchomione bez ograniczeń czasowych");
  } else {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("Nagrywanie w przeglądarce");
    } catch (e) {
      alert("Brak dostępu do mikrofonu: " + e.message);
    }
  }
}

async function stopRecording() {
  if (mediaRec) {
    mediaRec.stopRecord();
    mediaRec.release();
    mediaRec = null;
  }

  // Wyłącz powiadomienie z paska stanu
  if (window.cordova && window.cordova.plugins && window.cordova.plugins.backgroundMode) {
    window.cordova.plugins.backgroundMode.disable();
  }

  alert("Nagranie zostało zapisane!");
}
