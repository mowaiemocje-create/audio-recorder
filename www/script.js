async function startRecording() {
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.NativeAudio) {
    try {
      await window.Capacitor.Plugins.NativeAudio.startRecord();
      console.log("Natywne nagrywanie w tle uruchomione");
    } catch (err) {
      console.error("Błąd nagrywania natywnego:", err);
      alert("Błąd: " + (err.message || err));
    }
  } else {
    alert("Wersja przeglądarkowa – przetestuj na pliku APK w telefonie");
  }
}

async function stopRecording() {
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.NativeAudio) {
    try {
      await window.Capacitor.Plugins.NativeAudio.stopRecord();
      console.log("Natywne nagrywanie zatrzymane");
    } catch (err) {
      console.error("Błąd zatrzymania:", err);
    }
  }
}
