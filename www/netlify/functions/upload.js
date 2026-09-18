// Netlify Function — proxy dla multipart upload do NS
const http = require('http');

exports.handler = async function(event, context) {
  if(event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  const auth = event.headers['authorization'] || '';
  const contentType = event.headers['content-type'] || '';
  const body = event.isBase64Encoded 
    ? Buffer.from(event.body, 'base64')
    : Buffer.from(event.body || '', 'utf-8');

  return new Promise((resolve) => {
    const options = {
      hostname: 'newspeech.nazwa.pl',
      port: 80,
      path: '/api/recordings',
      method: 'POST',
      headers: {
        'Authorization': auth,
        'Content-Type': contentType,
        'Content-Length': body.length,
      },
    };

    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const responseBody = Buffer.concat(chunks).toString('utf-8');
        resolve({
          statusCode: res.statusCode,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: responseBody,
        });
      });
    });
    req.on('error', (e) => {
      resolve({ statusCode: 500, body: JSON.stringify({ error: e.message }) });
    });
    req.write(body);
    req.end();
  });
};
