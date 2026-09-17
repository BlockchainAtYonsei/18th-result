import { NextRequest, NextResponse } from 'next/server';

import type { OfferingResponse } from '@/types/product';

const UINT256_MAX = BigInt(
  '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
);
const RESPONSE_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'X-Content-Type-Options': 'nosniff',
};

type OfferingLookupResult =
  | { kind: 'found'; offering: OfferingResponse }
  | { kind: 'not-found' }
  | { kind: 'unavailable' };

function parseTokenId(filename: string): bigint | null {
  if (!filename.endsWith('.json')) {
    return null;
  }

  const value = filename.slice(0, -'.json'.length);
  let tokenId: bigint;

  try {
    if (/^0x[0-9a-f]+$/i.test(value)) {
      tokenId = BigInt(value);
    } else if (/^[0-9a-f]{64}$/i.test(value)) {
      tokenId = BigInt(`0x${value}`);
    } else if (/^[0-9]+$/.test(value)) {
      tokenId = BigInt(value);
    } else {
      return null;
    }
  } catch {
    return null;
  }

  return tokenId > BigInt(0) && tokenId <= UINT256_MAX ? tokenId : null;
}

async function findOffering(offeringId: bigint): Promise<OfferingLookupResult> {
  const candidates = [
    `http://backend:8080/api/offerings/${offeringId}`,
    `http://localhost:8080/api/offerings/${offeringId}`,
  ];

  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        signal: AbortSignal.timeout(2000),
      });

      if (response.ok) {
        return {
          kind: 'found',
          offering: (await response.json()) as OfferingResponse,
        };
      }

      if (response.status === 400 || response.status === 404) {
        return { kind: 'not-found' };
      }
    } catch {
      // Docker 밖에서 실행할 때 localhost 후보를 이어서 확인한다.
    }
  }

  return { kind: 'unavailable' };
}

function toUnixSeconds(value: string): number | undefined {
  const milliseconds = Date.parse(value);
  return Number.isNaN(milliseconds) ? undefined : Math.floor(milliseconds / 1000);
}

function buildMetadata(
  request: NextRequest,
  tokenId: bigint,
  offering: OfferingResponse
) {
  const revenueStart = toUnixSeconds(offering.terms.revenueStart);
  const revenueEnd = toUnixSeconds(offering.terms.revenueEnd);
  const siteOrigin = request.nextUrl.origin;

  const attributes: Array<{
    trait_type: string;
    value: string | number;
    display_type?: 'date';
  }> = [
    { trait_type: 'Offering ID', value: tokenId.toString() },
    { trait_type: 'Status', value: offering.statusLabel },
    { trait_type: 'Creator', value: offering.creator.name },
    { trait_type: 'Platform', value: offering.creator.platform },
    {
      trait_type: 'Revenue Share',
      value: `${offering.terms.revenueSharePercent}%`,
    },
    {
      trait_type: 'Unit Price',
      value: `${offering.terms.unitPrice.display} ${offering.settlementCurrency.symbol}`,
    },
    {
      trait_type: 'Units For Sale',
      value: offering.terms.unitsForSale,
    },
  ];

  if (revenueStart !== undefined) {
    attributes.push({
      display_type: 'date',
      trait_type: 'Revenue Start',
      value: revenueStart,
    });
  }

  if (revenueEnd !== undefined) {
    attributes.push({
      display_type: 'date',
      trait_type: 'Revenue End',
      value: revenueEnd,
    });
  }

  return {
    name: offering.title,
    description: offering.description,
    image: offering.creator.imageUrl,
    external_url: `${siteOrigin}/marketplace?offering=${tokenId}`,
    attributes,
    properties: {
      offeringId: tokenId.toString(),
      assetKey: offering.assetKey,
      creator: offering.creator,
      settlementCurrency: offering.settlementCurrency,
      fundingDeadline: offering.terms.fundingDeadline,
      targetRaise: offering.terms.targetRaise,
    },
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tokenId: string }> }
) {
  const { tokenId: filename } = await params;
  const tokenId = parseTokenId(filename);

  if (tokenId === null) {
    return NextResponse.json(
      { error: 'Invalid ERC-1155 token ID' },
      { status: 400, headers: RESPONSE_HEADERS }
    );
  }

  const result = await findOffering(tokenId);

  if (result.kind === 'not-found') {
    return NextResponse.json(
      { error: 'Revenue right not found' },
      { status: 404, headers: RESPONSE_HEADERS }
    );
  }

  if (result.kind === 'unavailable') {
    return NextResponse.json(
      { error: 'Offering service unavailable' },
      { status: 503, headers: RESPONSE_HEADERS }
    );
  }

  return NextResponse.json(buildMetadata(request, tokenId, result.offering), {
    headers: {
      ...RESPONSE_HEADERS,
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  });
}
