let mediaRec = null;

async function startRecording() {
  // Jeśli uruchomiono na Androidzie (Capacitor/Cordova)
  if (window.Media) {
    const src = "recording_" + Date.now() + ".m4a";
    mediaRec = new Media(
      src,
      () => console.log("Nagrywanie zakonczone powodzeniem"),
      (err) => console.error("Błąd nagrywania:", err)
    );
    
    mediaRec.startRecord();
    console.log("Natywne nagrywanie w tle uruchomione bez ograniczen");
  } else {
    // Fallback dla przeglądarki WWW
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("Nagrywanie w przegladarce");
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
    alert("Nagranie zostalo zapisane!");
  }
}
