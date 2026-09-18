// DEBUG Worker — pokazuje co się dzieje
const TARGET = 'http://newspeech.nazwa.pl/api';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const targetUrl = TARGET + url.pathname + url.search;

    const reqHeaders = new Headers();
    const ct = request.headers.get('Content-Type');
    const auth = request.headers.get('Authorization');
    if (ct) reqHeaders.set('Content-Type', ct);
    if (auth) reqHeaders.set('Authorization', auth);
    reqHeaders.set('Accept', 'application/json');

    let bodyText = '';
    let body = undefined;
    if (!['GET', 'HEAD'].includes(request.method)) {
      body = await request.arrayBuffer();
      bodyText = new TextDecoder().decode(body);
    }

    try {
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: reqHeaders,
        body: body,
      });

      const responseBody = await response.text();

      // Zwróć też info debugowe w headerze
      return new Response(responseBody, {
        status: response.status,
        headers: {
          ...CORS,
          'Content-Type': response.headers.get('Content-Type') || 'application/json',
          'X-Debug-Target': targetUrl,
          'X-Debug-Method': request.method,
          'X-Debug-Status': String(response.status),
        },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ 
          error: err.message,
          debug_target: targetUrl,
          debug_method: request.method,
          debug_body: bodyText
        }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    }
  }
};
