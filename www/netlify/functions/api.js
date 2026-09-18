// Netlify Function — proxy dla http://newspeech.nazwa.pl/api
const https = require('https');
const http = require('http');

exports.handler = async function(event, context) {
  const path = event.path.replace('/.netlify/functions/api', '');
  const targetUrl = 'http://newspeech.nazwa.pl/api' + path + (event.rawQuery ? '?' + event.rawQuery : '');
  
  const method = event.httpMethod;
  const headers = {
    'Content-Type': event.headers['content-type'] || 'application/json',
    'Accept': 'application/json',
  };
  if(event.headers['authorization']) {
    headers['Authorization'] = event.headers['authorization'];
  }

  return new Promise((resolve) => {
    const req = http.request(targetUrl, {
      method,
      headers,
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: {
            'Content-Type': res.headers['content-type'] || 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          },
          body,
        });
      });
    });
    req.on('error', (e) => {
      resolve({ statusCode: 500, body: JSON.stringify({ error: e.message }) });
    });
    if(event.body) req.write(event.body);
    req.end();
  });
};
