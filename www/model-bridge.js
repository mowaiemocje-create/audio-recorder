/* ═══════════════════════════════════════════════════
   model-bridge.js
   Shared between index.html (DAW) and train.html
   Loads trained model from IndexedDB and exposes:
     ModelBridge.getModel()      → {A:{good,bad}, ...}
     ModelBridge.classify(feat, vowel) → 0-100
     ModelBridge.analyzeAttack(buf, srate) → {score, label}
     ModelBridge.analyzeAccent(buf, srate) → {score, label}
     ModelBridge.extractFeatures(buf)     → Float32Array[8]
═══════════════════════════════════════════════════ */
window.ModelBridge = (function() {
  const WEIGHTS = new Float32Array([1,2,2,1.5,3,2,1.5,2]);

  function featDist(a, b) {
    let d = 0;
    for (let i = 0; i < a.length; i++) d += WEIGHTS[i] * ((a[i]-b[i])**2);
    return Math.sqrt(d);
  }

  function extractFeatures(samples) {
    const N = Math.min(samples.length, 44100*3);
    const buf = samples instanceof Float32Array ? samples.subarray(0,N) : new Float32Array(Array.from(samples).slice(0,N));
    let rms=0; for(let i=0;i<N;i++) rms+=buf[i]*buf[i]; rms=Math.sqrt(rms/N);
    let zcr=0; for(let i=1;i<N;i++) if(buf[i]*buf[i-1]<0) zcr++; zcr/=N;
    const winSize=2048, start=Math.floor(N/2)-winSize/2;
    const win=new Float32Array(winSize);
    for(let i=0;i<winSize;i++){const idx=start+i;win[i]=(idx>=0&&idx<N?buf[idx]:0)*0.5*(1-Math.cos(2*Math.PI*i/winSize));}
    const BINS=256, mag=new Float32Array(BINS);
    for(let k=1;k<BINS;k++){let re=0,im=0;for(let n=0;n<winSize;n+=4){const a=2*Math.PI*k*n/winSize;re+=win[n]*Math.cos(a);im-=win[n]*Math.sin(a);}mag[k]=Math.sqrt(re*re+im*im);}
    let cN=0,cD=0; for(let k=1;k<BINS;k++){cN+=k*mag[k];cD+=mag[k];}
    const centroid=cD>0?cN/cD/BINS:0.5;
    const cutBin=Math.round(2000*winSize/44100/4);
    let hi=0,tot=0; for(let k=1;k<BINS;k++){tot+=mag[k];if(k>cutBin)hi+=mag[k];}
    const brightness=tot>0?hi/tot:0;
    let ls=0,li=0; for(let k=1;k<BINS;k++){const m=Math.max(1e-10,mag[k]);ls+=Math.log(m);li+=m;}
    const flatness=li>0?Math.min(1,Math.exp(ls/BINS)/(li/BINS)*20):0;
    let peak=0; for(let i=0;i<N;i++) if(Math.abs(buf[i])>peak)peak=Math.abs(buf[i]);
    const crest=rms>0?Math.min(1,peak/(rms*10)):0;
    const lowCut=Math.round(500*winSize/44100/4);
    let low=0; for(let k=1;k<=lowCut&&k<BINS;k++) low+=mag[k];
    const lowRatio=tot>0?low/tot:0;
    const fLen=Math.round(44100*0.02); const fe=[];
    for(let i=0;i+fLen<N;i+=fLen){let e=0;for(let j=0;j<fLen;j++)e+=buf[i+j]**2;fe.push(e/fLen);}
    const mean=fe.reduce((a,b)=>a+b,0)/fe.length||0;
    const variance=fe.reduce((a,b)=>a+(b-mean)**2,0)/fe.length||0;
    const tremor=Math.min(1,Math.sqrt(variance)/(mean+1e-10));
    return new Float32Array([rms,zcr,centroid,brightness,flatness,crest,lowRatio,tremor]);
  }

  function classify(features, modelEntry) {
    if (!modelEntry||!modelEntry.good||!modelEntry.bad||!modelEntry.good.length||!modelEntry.bad.length) return null;
    const K=3;
    const dG=modelEntry.good.map(g=>featDist(features,new Float32Array(g))).sort((a,b)=>a-b).slice(0,K);
    const dB=modelEntry.bad.map(b=>featDist(features,new Float32Array(b))).sort((a,b)=>a-b).slice(0,K);
    const aG=dG.reduce((a,b)=>a+b,0)/dG.length;
    const aB=dB.reduce((a,b)=>a+b,0)/dB.length;
    const t=aG+aB; if(!t) return 50;
    return Math.max(0,Math.min(100,Math.round(aB/t*100)));
  }

  // Attack analysis: look at first 80ms of a voiced segment
  // Hard attack = sudden energy spike (high crest in first 20ms vs next 60ms)
  // Soft attack = gradual energy rise
  function analyzeAttack(buf, srate) {
    const onset = Math.round(srate*0.02); // 20ms
    const body  = Math.round(srate*0.08); // 80ms
    if (buf.length < body) return {score:50, label:'BRAK DANYCH', hard:false};
    let e1=0, e2=0;
    for(let i=0;i<onset;i++) e1+=buf[i]**2; e1=Math.sqrt(e1/onset);
    for(let i=onset;i<body;i++) e2+=buf[i]**2; e2=Math.sqrt(e2/(body-onset));
    // Hard attack: e1 >> e2 (energy front-loaded)
    const ratio = e2>0.001 ? e1/e2 : 1;
    // ratio > 1.8 = hard attack (energy spike at start)
    // ratio < 1.2 = soft attack (gradual build)
    const score = Math.max(0, Math.min(100, Math.round((2.5 - ratio) / 2.5 * 100)));
    const hard = ratio > 1.6;
    return {score, label: hard ? 'TWARDY ATAK' : 'MIĘKKI ATAK', hard, ratio};
  }

  // Accent analysis: look at the energy peak in a segment
  // Tense accent = high ZCR + high spectral flatness + high crest at peak
  // Resonant accent = low flatness, sustained energy, low ZCR
  function analyzeAccent(buf, srate) {
    if (buf.length < srate*0.1) return {score:50, label:'BRAK DANYCH', tense:false};
    const features = extractFeatures(buf);
    // Key indicators of tension: flatness (idx4), crest (idx5), zcr (idx1), tremor (idx7)
    const tensionScore = features[4]*0.35 + features[5]*0.3 + features[1]*500*0.2 + features[7]*0.15;
    const score = Math.max(0, Math.min(100, Math.round((1 - tensionScore) * 100)));
    const tense = score < 45;
    return {score, label: tense ? 'NAPIĘTY AKCENT' : 'MIĘKKI AKCENT', tense, features};
  }

  // Load model from IndexedDB (pitchrec_train3)
  function loadModel(cb) {
    const req = indexedDB.open('pitchrec_train3', 1);
    req.onsuccess = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('samples')) { cb({}); return; }
      const r = db.transaction('samples','readonly').objectStore('samples').getAll();
      r.onsuccess = () => {
        const rows = r.result;
        const model = {};
        rows.forEach(row => {
          if (!model[row.vowel]) model[row.vowel] = {good:[], bad:[]};
          model[row.vowel][row.type].push(row.features);
        });
        cb(model);
      };
    };
    req.onerror = () => cb({});
  }

  return { extractFeatures, classify, analyzeAttack, analyzeAccent, loadModel };
})();
