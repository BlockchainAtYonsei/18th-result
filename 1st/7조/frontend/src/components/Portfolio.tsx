'use client';

import { useAccount, useReadContracts } from 'wagmi';
import type { Abi } from 'viem';
import { useProducts } from '../hooks/useProduct';
import { useActiveContracts } from '../hooks/useActiveContracts';
import RevenueBridgeABI from '../generated/contracts/RevenueBridge.abi.json';
import { PortfolioCard } from './PortfolioCard';
import { Wallet } from 'lucide-react';

export function Portfolio() {
  const { address, isConnected } = useAccount();
  const { products, isLoading: productsLoading } = useProducts();
  const { addresses } = useActiveContracts();

  const { data: investedData, isLoading: isContractLoading } = useReadContracts({
    contracts: address
      ? products.map((product) => ({
          address: addresses.REVENUE_BRIDGE,
          abi: RevenueBridgeABI as Abi,
          functionName: 'investedUnits',
          args: [BigInt(product.offeringId), address],
        }))
      : [],
    query: {
      enabled: isConnected && !!address && products.length > 0,
    }
  });

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <Wallet className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-2">지갑 연결이 필요합니다</h3>
        <p className="text-gray-500 text-center max-w-sm">
          내 투자 내역을 확인하고 정산금을 수령하려면 먼저 우측 상단의 버튼을 눌러 지갑을 연결해주세요.
        </p>
      </div>
    );
  }

  if (productsLoading || isContractLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <span className="text-gray-400 font-medium animate-pulse">투자 내역을 불러오는 중...</span>
      </div>
    );
  }

  // Filter products where user has invested units > 0
  const investedProducts = products.filter((product, index) => {
    if (!investedData || !investedData[index]) return false;
    const result = investedData[index].result;
    return result !== undefined && (result as bigint) > BigInt(0);
  });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2 tracking-tight">내 포트폴리오</h1>
        <p className="text-gray-500 text-sm">
          현재 투자 중인 수익권 상품과 수령 가능한 정산금을 확인하세요.
        </p>
      </div>

      {investedProducts.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-gray-500 font-medium">아직 투자한 상품이 없습니다.</p>
          <p className="text-gray-400 text-sm mt-1">마켓플레이스에서 새로운 수익권에 투자해보세요!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {investedProducts.map((product) => {
            const index = products.indexOf(product);
            const units = investedData![index].result as bigint;
            return (
              <PortfolioCard 
                key={product.offeringId} 
                product={product} 
                investedUnits={units}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
