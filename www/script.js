async function startRecording() {
  // 1. Jeśli aplikacja działa jako natywny plik APK na Androidzie
  if (window.Capacitor && window.Capacitor.isNativePlatform()) {
    try {
      if (window.Capacitor.Plugins && window.Capacitor.Plugins.NativeAudio) {
        await window.Capacitor.Plugins.NativeAudio.startRecord();
        console.log("Uruchomiono natywny serwis nagrywania w Javie");
      }
    } catch (err) {
      console.error("Błąd usługi natywnej:", err);
      alert("Natywny błąd nagrywania: " + (err.message || err));
    }
    return; // Zakończ funkcję - nie wywołuj navigator.mediaDevices.getUserMedia!
  }

  // 2. Jeśli aplikacja jest uruchomiona w zwykłej przeglądarce komputerowej (Cloudflare Pages)
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log("Nagrywanie w przeglądarce uruchomione");
  } catch (err) {
    alert("Błąd mikrofonu w przeglądarce: " + err.message);
  }
}

async function stopRecording() {
  if (window.Capacitor && window.Capacitor.isNativePlatform()) {
    try {
      if (window.Capacitor.Plugins && window.Capacitor.Plugins.NativeAudio) {
        await window.Capacitor.Plugins.NativeAudio.stopRecord();
        console.log("Zatrzymano natywny serwis w Javie");
      }
    } catch (err) {
      console.error("Błąd zatrzymania:", err);
    }
    return;
  }
}
