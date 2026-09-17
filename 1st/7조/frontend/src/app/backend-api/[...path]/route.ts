import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params;
  const targetPath = resolvedParams.path.join('/');

  // 1. Docker 내부망(http://backend:8080) 먼저 시도, 실패 시 호스트(http://localhost:8080) 시도
  const candidates = [
    `http://backend:8080/api/${targetPath}`,
    `http://localhost:8080/api/${targetPath}`,
  ];

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data);
      }
    } catch {}
  }

  return NextResponse.json(
    { error: 'Backend service unavailable on both internal and host networks' },
    { status: 502 }
  );
}
