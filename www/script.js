async function startRecording() {
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.NativeAudio) {
    await window.Capacitor.Plugins.NativeAudio.startRecord();
    console.log("Uruchomiono czyste natywne nagrywanie Java w tle");
  } else {
    alert("Wersja przeglądarkowa - uruchom aplikację na telefonie jako APK");
  }
}

async function stopRecording() {
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.NativeAudio) {
    await window.Capacitor.Plugins.NativeAudio.stopRecord();
    console.log("Natywne nagrywanie zatrzymane. Plik zapisano w pamięci aplikacji");
  }
}
