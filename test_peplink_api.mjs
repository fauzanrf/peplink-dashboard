import { readFile } from 'fs/promises';

async function run() {
  const envFile = await readFile('.env.local', 'utf8');
  const env = Object.fromEntries(envFile.split('\n').filter(l => l && !l.startsWith('#')).map(l => {
    const i = l.indexOf('=');
    return [l.substring(0, i), l.substring(i+1)];
  }));

  const tokenUrl = 'https://api.ic.peplink.com/api/oauth2/token';
  const authHeader = Buffer.from(env.PEPLINK_CLIENT_ID + ':' + env.PEPLINK_CLIENT_SECRET).toString('base64');
  let res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + authHeader,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  let data = await res.json();
  const token = data.access_token;

  console.log('Testing /loc?start=2026-07-28 00:00:00&end=2026-07-28 23:59:59');
  let locsUrl = 'https://api.ic.peplink.com/rest/o/gdyv8w/g/3/d/54/loc?start=2026-07-28%2000:00:00&end=2026-07-28%2023:59:59';
  let locsRes = await fetch(locsUrl, { headers: { 'Authorization': 'Bearer ' + token }});
  console.log('/loc STATUS:', locsRes.status);
  if (locsRes.ok) {
     let payload = await locsRes.json();
     console.log('/loc returned points:', payload.data ? payload.data.length : 'no data array');
     if (payload.data && payload.data.length > 0) {
         console.log('First point:', JSON.stringify(payload.data[0]));
         console.log('Last point:', JSON.stringify(payload.data[payload.data.length - 1]));
     }
  }

}
run();
