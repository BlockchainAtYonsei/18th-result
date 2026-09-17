import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'frontend',
      revision: process.env.APP_REVISION ?? 'development',
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  );
}
