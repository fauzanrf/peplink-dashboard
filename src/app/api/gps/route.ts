import { NextResponse } from 'next/server';
import { fetchLiveGpsData } from '@/lib/peplink';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const data = await fetchLiveGpsData();
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, max-age=0'
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'SERVER_ERROR',
        message: error?.message || 'Failed to retrieve GPS location from Peplink IC2',
        timestamp: Date.now()
      },
      { status: 500 }
    );
  }
}
