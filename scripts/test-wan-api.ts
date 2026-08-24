// No dotenv needed, we will run with --env-file

async function getPeplinkAccessToken(): Promise<string> {
  const baseUrl = process.env.PEPLINK_BASE_URL || 'https://api.ic.peplink.com';
  const clientId = process.env.PEPLINK_CLIENT_ID;
  const clientSecret = process.env.PEPLINK_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('MISSING_CREDENTIALS');
  }

  const tokenUrl = `${baseUrl.replace(/\/$/, '')}/api/oauth2/token`;
  const bodyParams = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: bodyParams.toString()
  });

  const data = await response.json();
  return data.access_token;
}

async function testDeviceEndpoint() {
  try {
    console.log('Fetching token...');
    const token = await getPeplinkAccessToken();
    console.log('Token received.');

    const orgId = 'gdyv8w';
    const groupId = '3';
    const deviceId = '54';
    const baseUrl = process.env.PEPLINK_BASE_URL || 'https://api.ic.peplink.com';

    const url = `${baseUrl.replace(/\/$/, '')}/rest/o/${orgId}/g/${groupId}/d/${deviceId}`;
    console.log('Fetching URL:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    console.log('Status:', response.status);
    const payload = await response.json();
    console.log(JSON.stringify(payload, null, 2));
  } catch (err) {
    console.error(err);
  }
}

testDeviceEndpoint();
