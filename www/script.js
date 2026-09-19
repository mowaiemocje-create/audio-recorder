async function startRecording() {
  if (window.Capacitor && window.Capacitor.isNativePlatform()) {
    try {
      if (window.Capacitor.Plugins && window.Capacitor.Plugins.NativeAudio) {
        await window.Capacitor.Plugins.NativeAudio.startRecord();
        console.log("Czysta rola natywna wystartowala");
      }
    } catch (err) {
      console.error("Błąd usługi:", err);
      alert("Błąd: " + (err.message || err));
    }
    return;
  }
}

async function stopRecording() {
  if (window.Capacitor && window.Capacitor.isNativePlatform()) {
    try {
      if (window.Capacitor.Plugins && window.Capacitor.Plugins.NativeAudio) {
        await window.Capacitor.Plugins.NativeAudio.stopRecord();
        console.log("Natywna usługa zatrzymana");
      }
    } catch (err) {
      console.error("Błąd zatrzymania:", err);
    }
  }
}
