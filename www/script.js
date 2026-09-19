async function startRecording() {
  if (window.Capacitor && window.Capacitor.isNativePlatform() && window.Capacitor.Plugins && window.Capacitor.Plugins.NativeAudio) {
    try {
      await window.Capacitor.Plugins.NativeAudio.startRecord();
      console.log("Natywne nagrywanie w tle uruchomione");
      return;
    } catch (err) {
      console.warn("Błąd wtyczki natywnej:", err);
    }
  }

  // Fallback dla czystego JavaScript w przeglądarce
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log("Strumień mikrofonu otwarty w WebView");
  } catch (err) {
    console.error("Błąd mikrofonu WebView:", err);
  }
}

async function stopRecording() {
  if (window.Capacitor && window.Capacitor.isNativePlatform() && window.Capacitor.Plugins && window.Capacitor.Plugins.NativeAudio) {
    try {
      await window.Capacitor.Plugins.NativeAudio.stopRecord();
      console.log("Natywne nagrywanie zatrzymane");
    } catch (err) {
      console.error("Błąd zatrzymania:", err);
    }
  }
}
