import { NextResponse } from 'next/server';
import { getPeplinkAccessToken } from '@/lib/peplink';

export async function GET() {
  try {
    const orgId = process.env.PEPLINK_ORG_ID || 'gdyv8w';
    const groupId = process.env.PEPLINK_GROUP_ID || '3';
    const deviceId = '54';
    const baseUrl = process.env.PEPLINK_BASE_URL || 'https://api.ic.peplink.com';

    const token = await getPeplinkAccessToken();
    
    const locUrl = `${baseUrl.replace(/\/$/, '')}/rest/o/${orgId}/g/${groupId}/d/${deviceId}/loc`;
    const response = await fetch(locUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      },
      cache: 'no-store'
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
