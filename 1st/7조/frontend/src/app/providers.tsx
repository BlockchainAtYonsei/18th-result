'use client';

import { WagmiProvider, createConfig, http } from 'wagmi';
import { baseSepolia, foundry } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { CHAIN_ID } from '../constants/contracts';

const createWagmiConfig = () => {
  if (CHAIN_ID === baseSepolia.id) {
    return createConfig({
      chains: [baseSepolia],
      connectors: [injected()],
      transports: {
        [baseSepolia.id]: http(),
      },
      ssr: true,
    });
  }

  if (CHAIN_ID === foundry.id) {
    return createConfig({
      chains: [foundry],
      connectors: [injected()],
      transports: {
        [foundry.id]: http('http://127.0.0.1:8545'),
      },
      ssr: true,
    });
  }

  throw new Error(`지원하지 않는 배포 체인입니다: ${CHAIN_ID}`);
};

export const config = createWagmiConfig();

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
