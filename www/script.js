async function startRecording() {
  if (window.Capacitor && window.Capacitor.isNativePlatform()) {
    try {
      if (window.Capacitor.Plugins && window.Capacitor.Plugins.NativeAudio) {
        await window.Capacitor.Plugins.NativeAudio.startRecord();
        console.log("Natywne nagrywanie w tle uruchomione");
      }
    } catch (err) {
      console.error("Błąd usługi natywnej:", err);
      alert("Błąd: " + (err.message || err));
    }
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log("Strumień audio otwarty w przeglądarce");
  } catch (err) {
    alert("Błąd mikrofonu w przeglądarce: " + err.message);
  }
}

async function stopRecording() {
  if (window.Capacitor && window.Capacitor.isNativePlatform()) {
    try {
      if (window.Capacitor.Plugins && window.Capacitor.Plugins.NativeAudio) {
        await window.Capacitor.Plugins.NativeAudio.stopRecord();
        console.log("Natywne nagrywanie zatrzymane");
      }
    } catch (err) {
      console.error("Błąd zatrzymania:", err);
    }
    return;
  }
}
