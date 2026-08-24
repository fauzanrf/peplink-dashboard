import { NextResponse } from 'next/server';
import { fetchLiveDeviceStatus } from '@/lib/peplink';

export const revalidate = 0; // Disable static caching

export async function GET() {
  try {
    const data = await fetchLiveDeviceStatus();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('API /api/wan Error:', error);
    
    // Provide a detailed error message without exposing credentials
    let errorMsg = 'Failed to fetch WAN status';
    if (error.message) {
      errorMsg = error.message;
    }
    
    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}
