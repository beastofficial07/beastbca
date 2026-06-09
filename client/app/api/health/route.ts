import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ 
    ok: true, 
    timestamp: new Date().toISOString(),
    status: 'healthy'
  });
}

export const dynamic = 'force-dynamic';
