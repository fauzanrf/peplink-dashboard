import { NextRequest, NextResponse } from 'next/server';
import { fetchHistoricalGpsData } from '@/lib/peplink';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const dateParam = searchParams.get('date');
    
    if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return NextResponse.json(
        { error: 'INVALID_INPUT', message: 'A valid date parameter (YYYY-MM-DD) is required.' },
        { status: 400 }
      );
    }
    
    // Construct the specific string formats expected by Peplink IC2
    const startTimeStr = `${dateParam} 00:00:00`;
    const endTimeStr = `${dateParam} 23:59:59`;

    const data = await fetchHistoricalGpsData(startTimeStr, endTimeStr);

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, max-age=0'
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'SERVER_ERROR',
        message: error?.message || 'Failed to retrieve historical GPS telemetry from Peplink IC2',
        debug: error?.debug || null,
        timestamp: Date.now()
      },
      { status: 500 }
    );
  }
}
