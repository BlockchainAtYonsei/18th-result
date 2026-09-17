export interface ProductOffchainData {
  id: string;
  creatorName: string;
  title: string;
  description: string;
  imageUrl: string;
  expectedApy: number;
  maturityDate: string;
}

export interface ProductOnchainData {
  targetAmount: number; // mUSD
  currentAmount: number; // mUSD
  status: 'funding' | 'active' | 'completed';
}

export type Product = ProductOffchainData & ProductOnchainData;

// Backend API Types
export interface OfferingResponse {
  offeringId: number;
  status: string;
  statusLabel: string;
  assetKey: string;
  creator: {
    name: string;
    platform: string;
    handle: string;
    imageUrl: string;
  };
  title: string;
  description: string;
  settlementCurrency: {
    symbol: string;
    decimals: number;
  };
  terms: {
    unitsForSale: number;
    unitPrice: {
      raw: string;
      decimals: number;
      display: string;
    };
    targetRaise: {
      raw: string;
      decimals: number;
      display: string;
    };
    revenueShareBps: number;
    revenueSharePercent: number;
    fundingDeadline: string;
    revenueStart: string;
    revenueEnd: string;
  };
}
