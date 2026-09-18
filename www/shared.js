'use strict';
window.PR = {};

/* ── SINGLE DB, VERSION 1, STORE: 'samples' ── */
PR.db = null;
PR.openDB = function(cb) {
  if (PR.db) { if(cb) cb(); return; } // already open
  try {
    const r = indexedDB.open('pitchrec_v3', 1);
    r.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('samples'))
        d.createObjectStore('samples', {keyPath:'id', autoIncrement:true});
    };
    r.onsuccess = e => {
      PR.db = e.target.result;
      PR.db.onerror = ev => console.warn('[PR] db error', ev);
      if(cb) cb();
    };
    r.onerror = e => { console.warn('[PR] openDB error', e); if(cb) cb(); };
    r.onblocked = e => { console.warn('[PR] openDB blocked', e); if(cb) cb(); };
  } catch(e) { console.warn('[PR] openDB exception', e); if(cb) cb(); }
};

PR.dbAdd = function(obj, cb) {
  if(!PR.db) { console.warn('[PR] dbAdd: no db'); return; }
  try {
    const tx = PR.db.transaction('samples','readwrite');
    const req = tx.objectStore('samples').add(obj);
    req.onsuccess = () => { if(cb) cb(req.result); };
    req.onerror = e => { console.warn('[PR] dbAdd error', e); };
  } catch(e) { console.warn('[PR] dbAdd exception', e); }
};

PR.dbDel = function(id) {
  if(!PR.db) return;
  try {
    PR.db.transaction('samples','readwrite').objectStore('samples').delete(id);
  } catch(e) { console.warn('[PR] dbDel exception', e); }
};

PR.dbAll = function(cb) {
  if(!PR.db) { console.warn('[PR] dbAll: no db'); cb([]); return; }
  try {
    const req = PR.db.transaction('samples','readonly').objectStore('samples').getAll();
    req.onsuccess = () => cb(req.result || []);
    req.onerror   = e => { console.warn('[PR] dbAll error', e); cb([]); };
  } catch(e) { console.warn('[PR] dbAll exception', e); cb([]); }
};

/* ── FEATURES — returns plain Array[8] ── */
PR.features = function(buf) {
  const SR = 44100;
  const N  = Math.min(buf.length, SR * 3);
  if (N < 512) return [0,0,0.5,0,0,0,0.5,0];

  let rms=0; for(let i=0;i<N;i++) rms+=buf[i]*buf[i]; rms=Math.sqrt(rms/N);
  let zcr=0; for(let i=1;i<N;i++) if(buf[i]*buf[i-1]<0) zcr++; zcr/=N;

  const WS=1024, ws=Math.max(0,Math.floor(N/2)-WS/2);
  const win=new Float32Array(WS);
  for(let i=0;i<WS;i++){
    const idx=ws+i;
    win[i]=(idx<N?buf[idx]:0)*0.5*(1-Math.cos(2*Math.PI*i/WS));
  }
  const B=128, mag=new Float32Array(B);
  for(let k=1;k<B;k++){
    let re=0,im=0;
    for(let n=0;n<WS;n+=4){
      const a=2*Math.PI*k*n/WS;
      re+=win[n]*Math.cos(a); im-=win[n]*Math.sin(a);
    }
    mag[k]=Math.sqrt(re*re+im*im);
  }

  let cN=0,cD=0; for(let k=1;k<B;k++){cN+=k*mag[k];cD+=mag[k];}
  const centroid=cD>0?cN/cD/B:0.5;
  const cut=Math.round(2000*WS/SR/4);
  let hi=0,tot=0; for(let k=1;k<B;k++){tot+=mag[k];if(k>cut)hi+=mag[k];}
  const bright=tot>0?hi/tot:0;
  let ls=0,li=0; for(let k=1;k<B;k++){const m=Math.max(1e-10,mag[k]);ls+=Math.log(m);li+=m;}
  const flat=li>0?Math.min(1,Math.exp(ls/B)/(li/B)*20):0;
  let peak=0; for(let i=0;i<N;i++) if(Math.abs(buf[i])>peak) peak=Math.abs(buf[i]);
  const crest=rms>0?Math.min(1,peak/(rms*10)):0;
  const lc=Math.round(500*WS/SR/4);
  let low=0; for(let k=1;k<=lc&&k<B;k++) low+=mag[k];
  const lowr=tot>0?low/tot:0;
  const fLen=Math.round(SR*0.02); const fe=[];
  for(let i=0;i+fLen<N;i+=fLen){
    let e=0; for(let j=0;j<fLen;j++) e+=buf[i+j]**2; fe.push(e/fLen);
  }
  const mean=fe.length?fe.reduce((a,b)=>a+b,0)/fe.length:0;
  const variance=fe.length?fe.reduce((a,b)=>a+(b-mean)**2,0)/fe.length:0;
  const tremor=Math.min(1,Math.sqrt(variance)/(mean+1e-10));

  // Always return plain Array (safe for IndexedDB + JSON)
  return [
    Number(rms.toFixed(6)),
    Number(zcr.toFixed(6)),
    Number(centroid.toFixed(6)),
    Number(bright.toFixed(6)),
    Number(flat.toFixed(6)),
    Number(crest.toFixed(6)),
    Number(lowr.toFixed(6)),
    Number(tremor.toFixed(6))
  ];
};

const W8=[1,2,2,1.5,3,2,1.5,2];
PR.dist = function(a, b) {
  let d=0;
  for(let i=0;i<8;i++) {
    const ai=+a[i]||0, bi=+b[i]||0;
    d += W8[i]*(ai-bi)*(ai-bi);
  }
  return Math.sqrt(d);
};

PR.score = function(feat, entry) {
  if(!entry||!entry.good||!entry.bad||!entry.good.length||!entry.bad.length) return null;
  const K=Math.min(3, entry.good.length, entry.bad.length);
  const dG=entry.good.map(g=>PR.dist(feat,g)).sort((a,b)=>a-b).slice(0,K);
  const dB=entry.bad.map(b=>PR.dist(feat,b)).sort((a,b)=>a-b).slice(0,K);
  const aG=dG.reduce((a,b)=>a+b,0)/dG.length;
  const aB=dB.reduce((a,b)=>a+b,0)/dB.length;
  const t=aG+aB; if(!t) return 50;
  return Math.max(0,Math.min(100,Math.round(aB/t*100)));
};

PR.buildModel = function(rows) {
  const m={};
  rows.forEach(r=>{
    if(!r.vowel||!r.type) return;
    if(!m[r.vowel]) m[r.vowel]={good:[],bad:[]};
    if(r.type==='good'||r.type==='bad') {
      // Ensure features is plain Array of numbers
      let f = r.features;
      if(!Array.isArray(f)) {
        try { f = Array.from(f); } catch(e) { return; }
      }
      if(f.length!==8) return;
      m[r.vowel][r.type].push(f.map(Number));
    }
  });
  return m;
};

PR.attack = function(buf) {
  const SR=44100;
  const onset=Math.round(SR*0.025), body=Math.round(SR*0.1);
  if(buf.length<body) return {s:50,hard:false,lbl:'—'};
  let e1=0,e2=0;
  for(let i=0;i<onset;i++) e1+=buf[i]**2; e1=Math.sqrt(e1/onset);
  for(let i=onset;i<body;i++) e2+=buf[i]**2; e2=Math.sqrt(e2/(body-onset));
  const ratio=e2>0.001?e1/e2:1;
  const s=Math.max(0,Math.min(100,Math.round((2.5-ratio)/2.5*100)));
  return {s, hard:ratio>1.6, lbl:ratio>1.6?'TWARDY':'MIĘKKI'};
};

PR.tension = function(buf) {
  if(buf.length<1024) return {s:50,tense:false,lbl:'—'};
  const f=PR.features(buf);
  const t=f[4]*0.35+f[5]*0.3+f[1]*500*0.2+f[7]*0.15;
  const s=Math.max(0,Math.min(100,Math.round((1-t)*100)));
  return {s, tense:s<45, lbl:s<45?'NAPIĘTY':'MIĘKKI'};
};
