export interface GpsLocationData {
  latitude: number;
  longitude: number;
  speed: number;
  altitude: number;
  heading: number;
  timestamp: number;
  formattedTime: string;
  accuracy?: number;
  satellites?: number;
  address?: string;
  deviceName: string;
  deviceId: string;
  orgId: string;
  groupId: string;
  connectionStatus: 'ONLINE' | 'SIMULATED' | 'NO_GPS' | 'AUTH_ERROR' | 'OFFLINE';
  isSimulated: boolean;
  errorMessage?: string;
  errorCode?: string;
  gpsAvailable?: boolean;
}

export interface GpsHistoryPoint {
  latitude: number;
  longitude: number;
  speed: number;
  altitude: number;
  heading: number;
  timestamp: number;
}

export interface GpsHistoryResponse {
  points: GpsHistoryPoint[];
  totalPoints: number;
  deviceName: string;
  isSimulated: boolean;
  timeRangeHours: number;
  routeStats?: {
    distanceKm: number;
    durationMinutes: number;
    maxSpeedKmh: number;
    avgSpeedKmh: number;
  };
}

export interface PeplinkWanSignal {
  rssi?: number;
  sinr?: number;
  rsrp?: number;
  rsrq?: number;
}

export interface PeplinkWanInterface {
  id: number;
  type: string;
  status: string;
  name: string;
  s2g3glte?: string;
  signal?: PeplinkWanSignal;
  bandName?: string;
}

export interface PeplinkDeviceStatusResponse {
  interfaces: PeplinkWanInterface[];
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

export async function getPeplinkAccessToken(): Promise<string> {
  const baseUrl = process.env.PEPLINK_BASE_URL || 'https://api.ic.peplink.com';
  const clientId = process.env.PEPLINK_CLIENT_ID;
  const clientSecret = process.env.PEPLINK_CLIENT_SECRET;

  if (!clientId || !clientSecret || clientId.includes('your_oauth') || clientSecret.includes('your_oauth')) {
    throw new Error('MISSING_CREDENTIALS: PEPLINK_CLIENT_ID or PEPLINK_CLIENT_SECRET not configured');
  }

  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken;
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
    body: bodyParams.toString(),
    cache: 'no-store',
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    const errorText = await response.text();
    let parsedMsg = `OAuth HTTP ${response.status}`;
    try {
      const errObj = JSON.parse(errorText);
      parsedMsg = errObj.error_description || errObj.message || errObj.error || parsedMsg;
    } catch {
      // Keep plain text
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error(`UNAUTHORIZED: Peplink OAuth client authentication failed (${parsedMsg})`);
    }
    throw new Error(`OAUTH_FAILED: ${parsedMsg}`);
  }

  const data = await response.json();
  const accessToken = data.access_token;
  const expiresInSeconds = data.expires_in || 3600;

  if (!accessToken) {
    throw new Error('INVALID_TOKEN_RESPONSE: No access_token returned by Peplink OAuth2 server');
  }

  cachedToken = {
    accessToken,
    expiresAt: Date.now() + (expiresInSeconds - 60) * 1000
  };

  return accessToken;
}

export async function fetchLiveGpsData(): Promise<GpsLocationData> {
  const orgId = process.env.PEPLINK_ORG_ID || 'gdyv8w';
  const groupId = process.env.PEPLINK_GROUP_ID || '3';
  const deviceId = process.env.PEPLINK_DEVICE_ID || '54';
  const deviceName = process.env.PEPLINK_DEVICE_NAME || 'Balance_45C2';
  const baseUrl = process.env.PEPLINK_BASE_URL || 'https://api.ic.peplink.com';

  try {
    const token = await getPeplinkAccessToken();
    
    // 1. Fetch real device status from device list API
    let connectionStatus: 'ONLINE' | 'OFFLINE' = 'OFFLINE';
    try {
      const devListUrl = `${baseUrl.replace(/\/$/, '')}/rest/o/${orgId}/g/${groupId}/d`;
      const devRes = await fetch(devListUrl, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(5000)
      });
      if (devRes.ok) {
        const devPayload = await devRes.json();
        const devices = devPayload.data || [];
        const targetDevice = devices.find((d: any) => String(d.id) === String(deviceId));
        if (targetDevice) {
          connectionStatus = targetDevice.status === 'online' ? 'ONLINE' : 'OFFLINE';
        }
      }
    } catch (e) {
      console.warn('Failed to fetch device list status', e);
    }

    // 2. Fetch GPS location data
    const locUrl = `${baseUrl.replace(/\/$/, '')}/rest/o/${orgId}/g/${groupId}/d/${deviceId}/loc`;
    let response = await fetch(locUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000)
    });

    if (response.status === 401) {
      cachedToken = null; 
      const freshToken = await getPeplinkAccessToken();
      response = await fetch(locUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${freshToken}`,
          'Accept': 'application/json'
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(10000)
      });
    }

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`NO_GPS_FIX: Location endpoint returned 404 for device ${deviceName} (ID: ${deviceId})`);
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error(`UNAUTHORIZED: Access denied to device ${deviceId} in Organization ${orgId}`);
      }
      throw new Error(`API_ERROR: Peplink API returned status ${response.status}`);
    }

    const payload = await response.json();
    let rawData = payload.data || payload;
    
    if (Array.isArray(rawData)) {
      rawData = rawData[0]; // the actual loc endpoint returns data: [{ ... }]
    }

    if (!rawData || rawData.la === undefined) {
      throw new Error(`No GPS data returned by Peplink`);
    }

    let timestampMs = Date.now();
    if (typeof rawData.ts === 'string') {
      timestampMs = new Date(rawData.ts).getTime();
      if (isNaN(timestampMs)) timestampMs = Date.now();
    } else if (typeof rawData.ts === 'number') {
      timestampMs = rawData.ts < 1e11 ? rawData.ts * 1000 : rawData.ts;
    }

    const lat = Number(rawData.la);
    const lng = Number(rawData.lo);
    const speedKph = Number(rawData.speed_kph ?? (rawData.sp ? rawData.sp * 3.6 : 0));
    const alt = Number(rawData.at ?? 0);
    const head = Number(rawData.he ?? 0);

    // EXACT Server-side logging as requested by user
    console.log('[PEPLINK GPS]');
    console.log(`status: ${connectionStatus}`);
    console.log(`latitude: ${lat}`);
    console.log(`longitude: ${lng}`);
    console.log(`speed: ${speedKph}`);
    console.log(`altitude: ${alt}`);
    console.log(`heading: ${head}`);
    console.log(`timestamp: ${new Date(timestampMs).toISOString()}`);

    return {
      latitude: lat,
      longitude: lng,
      speed: speedKph,
      altitude: alt,
      heading: head,
      timestamp: timestampMs,
      formattedTime: new Date(timestampMs).toLocaleTimeString(),
      accuracy: rawData.accuracy,
      satellites: rawData.satellites,
      address: `${lat.toFixed(5)}°, ${lng.toFixed(5)}°`,
      deviceName,
      deviceId,
      orgId,
      groupId,
      connectionStatus,
      isSimulated: false,
      gpsAvailable: rawData.isExist
    };
  } catch (err: any) {
    console.error('Peplink GPS API Error:', err);
    throw err;
  }
}

export async function fetchHistoricalGpsData(startTimeStr?: string, endTimeStr?: string): Promise<GpsHistoryResponse & { debug?: any }> {
  const orgId = process.env.PEPLINK_ORG_ID || 'gdyv8w';
  const groupId = process.env.PEPLINK_GROUP_ID || '3';
  const deviceId = process.env.PEPLINK_DEVICE_ID || '54';
  const baseUrl = process.env.PEPLINK_BASE_URL || 'https://api.ic.peplink.com';

  if (!startTimeStr || !endTimeStr) {
    throw new Error('MISSING_TIME_RANGE: start and end time are required for historical replay');
  }

  let debugInfo: any = {
    endpoint: `/rest/o/${orgId}/g/${groupId}/d/${deviceId}/loc`,
    startTime: startTimeStr,
    endTime: endTimeStr,
    status: 0,
    rawPayload: null,
    error: null,
  };

  try {
    let token = await getPeplinkAccessToken();
    
    const locUrl = `${baseUrl.replace(/\/$/, '')}/rest/o/${orgId}/g/${groupId}/d/${deviceId}/loc?start=${encodeURIComponent(startTimeStr)}&end=${encodeURIComponent(endTimeStr)}`;
    debugInfo.url = locUrl;
    
    let response = await fetch(locUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000)
    });

    if (response.status === 401) {
      cachedToken = null;
      token = await getPeplinkAccessToken();
      response = await fetch(locUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(10000)
      });
    }

    debugInfo.status = response.status;
    if (!response.ok) {
      if (response.status === 404) {
        debugInfo.error = 'NO_GPS_DATA: Location history not found';
        throw new Error(`NO_GPS_DATA: Location history not found for device ${deviceId}`);
      }
      debugInfo.error = `IC2 API CONNECTION ERROR: status ${response.status}`;
      throw new Error(`IC2 API CONNECTION ERROR: status ${response.status}`);
    }

    const payload = await response.json();
    debugInfo.rawPayload = payload;
    const rawData = payload.data;

    if (!Array.isArray(rawData) || rawData.length === 0) {
      debugInfo.error = 'No data points in payload';
      return {
        points: [],
        totalPoints: 0,
        deviceName: 'Balance_45C2',
        isSimulated: false,
        timeRangeHours: 24,
        debug: debugInfo
      };
    }

    let rawPoints: GpsHistoryPoint[] = rawData.map((pt: any) => {
      let tsMs = Date.now();
      if (typeof pt.ts === 'string') {
        tsMs = new Date(pt.ts).getTime();
        if (isNaN(tsMs)) tsMs = Date.now();
      } else if (typeof pt.ts === 'number') {
        tsMs = pt.ts < 1e11 ? pt.ts * 1000 : pt.ts;
      }
      
      return {
        latitude: Number(pt.la),
        longitude: Number(pt.lo),
        speed: Number(pt.speed_kph ?? (pt.sp ? pt.sp * 3.6 : 0)),
        altitude: Number(pt.at ?? 0),
        heading: Number(pt.he ?? 0),
        timestamp: tsMs
      };
    });

    // 1. Sort by timestamp ascending
    rawPoints.sort((a, b) => a.timestamp - b.timestamp);

    // Haversine formula
    const getDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371; // km
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(Math.max(0, Math.min(1, a))), Math.sqrt(Math.max(0, 1-a)));
      return R * c;
    };

    // 2. Filter duplicates and outliers, calculate stats
    const validPoints: GpsHistoryPoint[] = [];
    let distanceKm = 0;
    let maxSpeedKmh = 0;
    let sumSpeedKmh = 0;

    for (let i = 0; i < rawPoints.length; i++) {
      const pt = rawPoints[i];
      
      // Skip missing or invalid coordinates
      if (pt.latitude === null || pt.longitude === null || isNaN(pt.latitude) || isNaN(pt.longitude)) {
        continue;
      }
      
      if (validPoints.length > 0) {
        const lastPt = validPoints[validPoints.length - 1];
        if (pt.timestamp <= lastPt.timestamp) continue; // Duplicate or out-of-order
        
        const dist = getDistanceKm(lastPt.latitude, lastPt.longitude, pt.latitude, pt.longitude);
        const timeDiffHours = (pt.timestamp - lastPt.timestamp) / 3600000;
        
        // Calculate segment speed
        const segmentSpeedKmh = timeDiffHours > 0 ? dist / timeDiffHours : 0;
        
        // Sanity check: Impossible speed (>250 km/h) implies a GPS jump/outlier
        if (segmentSpeedKmh > 250) {
          continue; // Skip this outlier point
        }
        
        distanceKm += dist;
      }
      
      validPoints.push(pt);
      if (pt.speed > maxSpeedKmh) maxSpeedKmh = pt.speed;
      sumSpeedKmh += pt.speed;
    }

    const durationMinutes = validPoints.length > 1 
      ? (validPoints[validPoints.length - 1].timestamp - validPoints[0].timestamp) / 60000 
      : 0;

    return {
      points: validPoints,
      totalPoints: validPoints.length,
      deviceName: 'Balance_45C2',
      isSimulated: false,
      timeRangeHours: 24,
      debug: debugInfo,
      routeStats: {
        distanceKm,
        durationMinutes,
        maxSpeedKmh,
        avgSpeedKmh: validPoints.length > 0 ? sumSpeedKmh / validPoints.length : 0
      }
    };
  } catch (err: any) {
    debugInfo.error = err.message;
    console.error('Historical Peplink GPS API Error:', err);
    throw Object.assign(err, { debug: debugInfo });
  }
}

export async function fetchLiveDeviceStatus(): Promise<PeplinkDeviceStatusResponse> {
  const orgId = process.env.PEPLINK_ORG_ID || 'gdyv8w';
  const groupId = process.env.PEPLINK_GROUP_ID || '3';
  const deviceId = process.env.PEPLINK_DEVICE_ID || '54';
  const baseUrl = process.env.PEPLINK_BASE_URL || 'https://api.ic.peplink.com';

  try {
    let token = await getPeplinkAccessToken();
    
    const url = `${baseUrl.replace(/\/$/, '')}/rest/o/${orgId}/g/${groupId}/d/${deviceId}`;
    
    let response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000)
    });

    if (response.status === 401) {
      cachedToken = null;
      token = await getPeplinkAccessToken();
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(10000)
      });
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch device status. Status: ${response.status}`);
    }

    const payload = await response.json();
    const interfaces = payload.data?.interfaces || [];

    // Map into our strict interface
    const mappedInterfaces: PeplinkWanInterface[] = interfaces.map((iface: any) => {
      let signalData: PeplinkWanSignal | undefined = undefined;
      let bandName: string | undefined = undefined;

      if (iface.type === 'cellular' || iface.type === 'modem') {
        const rat = iface.rat?.[0];
        if (rat) {
          const band = rat.band?.[0];
          if (band) {
            bandName = band.name;
            if (band.signal) {
              signalData = {
                rssi: band.signal.rssi,
                rsrp: band.signal.rsrp,
                rsrq: band.signal.rsrq,
                sinr: band.signal.sinr
              };
            }
          }
        }
      }

      return {
        id: iface.id,
        type: iface.type,
        status: iface.status,
        name: iface.name,
        s2g3glte: iface.s2g3glte,
        signal: signalData,
        bandName
      };
    });

    return { interfaces: mappedInterfaces };
  } catch (err) {
    console.error('Peplink WAN API Error:', err);
    throw err;
  }
}
