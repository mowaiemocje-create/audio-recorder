cat << 'EOF' > www/script.js
// Zmienne globalne
let mediaRecorder = null;
let audioChunks = [];
let silentAudioCtx = null;
let currentLocation = null;
let locationWatchId = null;

// 1. Inicjalizacja opcji Background Mode po starcie aplikacji Cordova/Capacitor
document.addEventListener('deviceready', () => {
  if (window.cordova && window.cordova.plugins && window.cordova.plugins.backgroundMode) {
    const bg = window.cordova.plugins.backgroundMode;
    
    bg.setDefaults({
      title: 'Nagrywanie w tle',
      text: 'Aplikacja rejestruje dźwięk i pozycję GPS...',
      resume: true,
      hidden: false,
      bigText: true
    });
    
    bg.enable();
    bg.disableWebViewOptimizations();
  }
}, false);

// 2. Generator cichego tonu (Keep-Alive) – zapobiega uśpieniu mikrofonu przez Androida
function startSilentAudioKeepAlive() {
  try {
    if (!silentAudioCtx) {
      silentAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = silentAudioCtx.createOscillator();
      const gain = silentAudioCtx.createGain();
      gain.gain.value = 0.001; // Niesłyszalny sygnał utrzymujący aktywność audio
      osc.connect(gain);
      gain.connect(silentAudioCtx.destination);
      osc.start();
    }
  } catch (e) {
    console.error("Błąd AudioContext Keep-Alive:", e);
  }
}

function stopSilentAudioKeepAlive() {
  if (silentAudioCtx) {
    silentAudioCtx.close();
    silentAudioCtx = null;
  }
}

// 3. Pobieranie i aktualizacja lokalizacji GPS
function startLocationTracking() {
  if (navigator.geolocation) {
    locationWatchId = navigator.geolocation.watchPosition(
      (position) => {
        currentLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          timestamp: new Date().toISOString()
        };
        console.log("Aktualna lokalizacja GPS:", currentLocation);
      },
      (error) => {
        console.warn("Błąd pobierania GPS:", error.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000
      }
    );
  }
}

function stopLocationTracking() {
  if (locationWatchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(locationWatchId);
    locationWatchId = null;
  }
}

// 4. Funkcja aktualizacji wykresu audio (możesz dopasować pod własny rysunek/canvas)
function updateAudioChart(chunkData) {
  // Miejsce na logiczną aktualizację wykresu w UI
  console.log("Pobrana próbka audio:", chunkData.size, "bajtów");
}

// 5. Rozpoczęcie nagrywania
async function startRecording() {
  try {
    // Aktywacja natywnej usługi w tle
    if (window.cordova && window.cordova.plugins && window.cordova.plugins.backgroundMode) {
      window.cordova.plugins.backgroundMode.enable();
      window.cordova.plugins.backgroundMode.disableWebViewOptimizations();
    }

    // Uruchomienie tła Keep-Alive i GPS
    startSilentAudioKeepAlive();
    startLocationTracking();

    // Pobranie strumienia z mikrofonu
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
        updateAudioChart(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      const audioUrl = URL.createObjectURL(audioBlob);
      
      // Jeśli masz w HTML element <audio id="audioPlayer">
      const player = document.getElementById('audioPlayer');
      if (player) {
        player.src = audioUrl;
      }
    };

    mediaRecorder.start(100); // Rejestracja pakietów co 100 ms
    console.log("Nagrywanie włączone");
  } catch (err) {
    console.error("Błąd startu nagrywania:", err);
    alert("Błąd mikrofonu: " + err.message);
  }
}

// 6. Zatrzymanie nagrywania
async function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    if (mediaRecorder.stream) {
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
  }

  stopSilentAudioKeepAlive();
  stopLocationTracking();

  if (window.cordova && window.cordova.plugins && window.cordova.plugins.backgroundMode) {
    window.cordova.plugins.backgroundMode.disable();
  }

  console.log("Nagrywanie zatrzymane");
}
EOF