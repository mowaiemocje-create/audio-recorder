// Stary serwer (newspeech.nazwa.pl) wycofany — aplikacja korzysta wyłącznie z nowego.
const NS_TARGET = 'https://ns.nowamowa.com/api/v1';
// WAŻNE: serwer waliduje nagłówek Origin/Referer względem SUROWEGO adresu IP backendu
// (potwierdzone przechwyceniem prawdziwego żądania przeglądarki), NIE względem nazwy domeny
// ns.nowamowa.com. Bez tego dokładnego adresu serwer odrzuca żądanie z błędem 500.
// UWAGA: 169.58.194.167 to adres Cloudflare (nie prawdziwy serwer źródłowy) — Cloudflare
// BLOKUJE łączenie się z nim BEZPOŚREDNIO przez surowe IP (błąd 1003) — to działa tylko
// jako wartość nagłówka Origin/Referer, NIE jako docelowy adres połączenia.
const NS_ORIGIN = 'http://169.58.194.167';
function resolveTarget(request) {
  return NS_TARGET;
}
function resolveOrigin(request) {
  return NS_ORIGIN;
}
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, Email, X-NS-Server',
};

// Firebase Realtime Database — darmowy, bez limitu operacji
const FB = 'https://pitchrec-map-default-rtdb.europe-west1.firebasedatabase.app/map';
const LIVE_TTL = 300000;   // 5 min
const AVAIL_TTL = 7200000; // 2h

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(request.url);

    // POST /map/ping — kursant nagrywa
    if (url.pathname === '/map/ping' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { lat, lon, name, cat, userId, city, sys } = body;
        if (!lat || !lon || !name || !cat) return json({ error: 'Brak pol' }, 400);

        const uid = String(userId || name).toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
        // Klucz historii oparty na IMIENIU (nie userId) — userId bywa numerycznym ID kursanta przy
        // nagrywaniu na żywo, ale przy synchronizacji CSV (Google Forms) nie mamy tego ID, tylko imię.
        // Gdyby historia też używała uid, te dwie ścieżki tworzyłyby DUPLIKATY zamiast się nadpisywać.
        const nameKey = String(name).toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
        const point = {
          lat: Math.round(lat * 10000) / 10000,
          lon: Math.round(lon * 10000) / 10000,
          name: String(name).slice(0, 30),
          cat, city: city || '', ts: Date.now(), sys: sys || '',
        };

        // Live: PUT nadpisuje per uid:cat (auto-wygaśnie przez cleanup)
        const liveKey = uid + '_' + cat.replace(/[^a-zA-Z0-9]/g, '_');
        await fbPut('live/' + liveKey, point);

        // Historia: PUT per imię:cat:lokalizacja (~55m precision — lat*2000, nie lat*100 które dawało ~1.1km!)
        const hkey = nameKey + '_' + cat.replace(/[^a-zA-Z0-9]/g, '_') + '_' +
          Math.round(point.lat * 2000) + '_' + Math.round(point.lon * 2000);
        await fbPut('hist/' + hkey, point);

        return json({ ok: true });
      } catch (e) { return json({ error: e.message }, 500); }
    }

    // POST /map/hist — zapisz punkt(y) historyczny(e). Obsługuje pojedynczy punkt LUB tablicę (batch).
    // WAŻNE: używa JEDNEGO zbiorczego zapisu Firebase (multi-path PATCH) zamiast pętli PUT —
    // Cloudflare Workers (darmowy plan) ma limit ok. 50 sub-requestów na wywołanie,
    // więc przy dużych paczkach (100+) pętla PUT rzucała 500 (przekroczony limit).
    if (url.pathname === '/map/hist' && request.method === 'POST') {
      try {
        const body = await request.json();
        const points = Array.isArray(body) ? body : [body];
        const updates = {};
        let saved = 0;
        for (const p of points) {
          const { lat, lon, name, cat, city, ts, sys } = p;
          if (!lat || !lon || !name || !cat) continue;
          const point = {
            lat: Math.round(lat * 10000) / 10000,
            lon: Math.round(lon * 10000) / 10000,
            name: String(name).slice(0, 30),
            cat, city: city || '',
            ts: ts || Date.now(), sys: sys || '',
          };
          // Ten sam klucz oparty na imieniu co w /map/ping — żeby CSV i nagrania na żywo
          // dla tego samego wydarzenia trafiały w JEDEN wpis, zamiast tworzyć duplikaty
          const nameKey = String(name).toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
          const hkey = nameKey + '_' + cat.replace(/[^a-zA-Z0-9]/g, '_') + '_'
            + Math.round(point.lat * 2000) + '_' + Math.round(point.lon * 2000);
          updates[hkey] = point;
          saved++;
        }
        if (saved > 0) await fbPatch('hist', updates); // JEDEN request niezależnie od liczby punktów
        return json({ ok: true, saved });
      } catch(e) { return json({ error: e.message }, 500); }
    }

    // DELETE /map/hist — jednorazowe czyszczenie CAŁEJ historii (np. gdy stare klucze osierocone
    // po zmianie formatu klucza kolidują z nowymi). Użyj ostrożnie — usuwa WSZYSTKO, potem trzeba
    // zsynchronizować CSV od nowa żeby odtworzyć dane pod nowym, spójnym formatem klucza.
    if (url.pathname === '/map/hist' && request.method === 'DELETE') {
      try {
        await fbDelete('hist');
        return json({ ok: true, cleared: true });
      } catch(e) { return json({ error: e.message }, 500); }
    }

    // POST /map/avail — dostępny do rozmowy
    if (url.pathname === '/map/avail' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { userId, name, phone, available, city } = body;
        if (!userId || !name) return json({ error: 'Brak danych' }, 400);

        const uid = String(userId).toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
        if (!available) {
          await fbDelete('avail/' + uid);
        } else {
          await fbPut('avail/' + uid, {
            name: String(name).slice(0, 30),
            phone: phone ? String(phone).slice(0, 20) : null,
            city: city || '', ts: Date.now(),
          });
        }
        return json({ ok: true });
      } catch (e) { return json({ error: e.message }, 500); }
    }

    // GET /map/points — pobierz wszystkie punkty z Firebase
    // WYMAGA ważnego tokena NS — weryfikowanego faktycznym zapytaniem do serwera NS,
    // nie tylko sprawdzeniem czy token "istnieje" (to działa identycznie w każdej przeglądarce)
    if (url.pathname === '/map/points' && request.method === 'GET') {
      const authHeader = request.headers.get('Authorization');
      const emailHeader = request.headers.get('Email') || '';
      if (!authHeader) {
        return json({ error: 'Brak autoryzacji — zaloguj się' }, 401);
      }
      try {
        const upstreamOriginMP = resolveOrigin(request);
        // WAŻNE: /dashboard jest CIĘŻKIM endpointem (liczy statystyki) — używanie go do
        // samej weryfikacji "czy token jest ważny", odpytywanego co 30s przez mapę,
        // mogło powodować sporadyczne timeouty/przeciążenia mylone z wygasłym tokenem.
        // record_categories to lekki endpoint, wystarczający do samej weryfikacji.
        const checkAuth = await fetch(resolveTarget(request) + '/record_categories', {
          headers: {
            'Authorization': authHeader, 'Email': emailHeader, 'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Origin': upstreamOriginMP, 'Referer': upstreamOriginMP + '/',
          }
        });
        if (!checkAuth.ok) {
          return json({ error: 'Token nieprawidłowy lub wygasł — zaloguj się ponownie' }, 401);
        }
      } catch (e) {
        return json({ error: 'Nie udało się zweryfikować logowania' }, 401);
      }
      try {
        const now = Date.now();

        // Pobierz live, hist, avail równolegle (3 requesty zamiast KV list)
        const [liveRaw, histRaw, availRaw] = await Promise.all([
          fbGet('live'), fbGet('hist'), fbGet('avail')
        ]);

        // Live: filtruj stare (>5min)
        const live = [];
        if (liveRaw) {
          Object.values(liveRaw).forEach(p => {
            if (now - p.ts < LIVE_TTL) live.push({ ...p, type: 'live' });
          });
        }

        // Historia: filtruj te które są aktualnie live
        const liveKeys = new Set(live.map(p => p.name + ':' + p.cat + ':' + p.lat + ':' + p.lon));
        const hist = [];
        if (histRaw) {
          Object.values(histRaw).forEach(p => {
            const k = p.name + ':' + p.cat + ':' + p.lat + ':' + p.lon;
            if (!liveKeys.has(k)) hist.push({ ...p, type: 'history' });
          });
        }

        // Dostępni: filtruj wygasłe (>2h)
        const avail = [];
        if (availRaw) {
          Object.values(availRaw).forEach(p => {
            if (now - p.ts < AVAIL_TTL) avail.push({ ...p, type: 'available' });
          });
        }

        return json({ live, history: hist, available: avail });
      } catch (e) { return json({ error: e.message }, 500); }
    }

    // POST /overpass — proxy Overpass API
    if (url.pathname === '/overpass') {
      try {
        let query;
        if (request.method === 'POST') {
          const body = await request.text();
          query = body; // może być data=... lub samo zapytanie
        } else {
          query = 'data='+encodeURIComponent(url.searchParams.get('data')||'');
        }
        // Upewnij się że query ma prefix data=
        if (!query.startsWith('data=')) query = 'data='+encodeURIComponent(query);
        const r = await fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 PitchRec/1.0',
            'Referer': 'https://overpass-turbo.eu/',
          },
          body: query,
        });
        const data = await r.text();
        return new Response(data, {status:r.status, headers:{...CORS,'Content-Type':'application/json'}});
      } catch(e) { return json({error:e.message},500); }
    }

    // GET /nominatim — proxy Nominatim search API
    if (url.pathname === '/nominatim' && request.method === 'GET') {
      try {
        const params = url.search; // przekaż wszystkie parametry
        const r = await fetch('https://nominatim.openstreetmap.org/search'+params, {
          headers: {'User-Agent':'PitchRec/1.0','Accept-Language':'pl,en'}
        });
        const data = await r.text();
        return new Response(data, {status:r.status, headers:{...CORS,'Content-Type':'application/json'}});
      } catch(e) { return json({error:e.message},500); }
    }

    // PROXY do NewSpeech
    const targetUrl = resolveTarget(request) + url.pathname + url.search;
    const reqHeaders = new Headers();
    const ct = request.headers.get('Content-Type');
    const auth = request.headers.get('Authorization');
    const email = request.headers.get('Email');
    if (ct) reqHeaders.set('Content-Type', ct);
    if (auth) reqHeaders.set('Authorization', auth);
    if (email) reqHeaders.set('Email', email);
    reqHeaders.set('Accept', 'application/json');
    // Niektóre serwery (np. nowszy/testowy) mogą odrzucać/błędnie obsługiwać żądania
    // serwer-do-serwera bez nagłówków przypominających prawdziwą przeglądarkę — Cloudflare
    // Workers domyślnie NIE wysyła User-Agent ani Origin tak jak zwykła przeglądarka.
    reqHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    const upstreamOrigin = resolveOrigin(request);
    reqHeaders.set('Origin', upstreamOrigin);
    reqHeaders.set('Referer', upstreamOrigin + '/');
    try {
      const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer();
      const response = await fetch(targetUrl, { method: request.method, headers: reqHeaders, body });
      const rb = await response.arrayBuffer();
      if (!response.ok) {
        // Log diagnostyczny widoczny w `wrangler tail` — pokazuje DOKŁADNIE co odpowiedział
        // serwer docelowy, przydatne przy debugowaniu np. dlaczego upload nagrań zwraca 500
        // tylko na jednym z serwerów.
        let bodyPreview;
        try { bodyPreview = new TextDecoder().decode(rb).slice(0, 500); } catch(e) { bodyPreview = '[binary]'; }
        console.log('UPSTREAM ERROR', {
          method: request.method, path: url.pathname, target: targetUrl,
          upstreamStatus: response.status, contentType: response.headers.get('Content-Type'),
          bodyLength: rb.byteLength, bodyPreview,
        });
      }
      return new Response(rb, {
        status: response.status,
        headers: { ...CORS, 'Content-Type': response.headers.get('Content-Type') || 'application/json' },
      });
    } catch (err) {
      console.log('PROXY FETCH THREW', { method: request.method, path: url.pathname, target: targetUrl, message: err.message, stack: err.stack });
      return new Response(JSON.stringify({ error: err.message }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
  }
};

// Firebase REST helpers
async function fbGet(path) {
  const r = await fetch(FB + '/' + path + '.json');
  if (!r.ok) return null;
  return r.json();
}
async function fbPut(path, data) {
  await fetch(FB + '/' + path + '.json', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}
// Zbiorczy zapis wielu kluczy pod jedną ścieżką w JEDNYM requeście (Firebase multi-path update)
async function fbPatch(path, updates) {
  await fetch(FB + '/' + path + '.json', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
}
async function fbDelete(path) {
  await fetch(FB + '/' + path + '.json', { method: 'DELETE' });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data),
    { status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store, no-cache, must-revalidate' } });
}
