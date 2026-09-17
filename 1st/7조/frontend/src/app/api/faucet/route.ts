import { NextResponse } from 'next/server';
import { createWalletClient, http, parseEther, parseUnits, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';
import { IS_LOCAL_CHAIN } from '@/constants/contracts';
import { resolveActiveContracts } from '@/lib/active-contracts';

const getRpcUrl = async () => {
  if (process.env.WEB3_RPC_URL) return process.env.WEB3_RPC_URL;
  try {
    const res = await fetch('http://anvil:8545', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
      signal: AbortSignal.timeout(1000)
    });
    if (res.ok) return 'http://anvil:8545';
  } catch {}
  return 'http://localhost:8545';
};

export async function POST(request: Request) {
  if (!IS_LOCAL_CHAIN) {
    return NextResponse.json({ error: '로컬 Anvil 환경에서만 사용할 수 있습니다.' }, { status: 404 });
  }

  try {
    // Anvil 기본 제공 0번 계정 (10,000 ETH 보유)
    const account = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
    const { address } = await request.json();
    if (!address) return NextResponse.json({ error: 'No address' }, { status: 400 });

    const rpcUrl = await getRpcUrl();
    const addresses = await resolveActiveContracts(rpcUrl);
    const client = createWalletClient({
      account,
      chain: foundry,
      transport: http(rpcUrl)
    });

    // 1. 가스비용 10 ETH 전송
    await client.sendTransaction({
      to: address,
      value: parseEther('10')
    });

    // 2. 투자용 100,000 mUSD 발행 (MockSettlementToken.mint)
    const data = encodeFunctionData({
      abi: [{
        type: 'function',
        name: 'mint',
        inputs: [{ type: 'address' }, { type: 'uint256' }],
        outputs: [],
        stateMutability: 'nonpayable'
      }],
      functionName: 'mint',
      args: [address as `0x${string}`, parseUnits('100000', 6)],
    });

    await client.sendTransaction({
      to: addresses.MUSD,
      data,
    });

    // 3. 투자자 화이트리스트 자동 승인 (RevenueBridge.setInvestorAllowed)
    const whitelistData = encodeFunctionData({
      abi: [{
        type: 'function',
        name: 'setInvestorAllowed',
        inputs: [{ type: 'address' }, { type: 'bool' }],
        outputs: [],
        stateMutability: 'nonpayable'
      }],
      functionName: 'setInvestorAllowed',
      args: [address as `0x${string}`, true],
    });

    await client.sendTransaction({
      to: addresses.REVENUE_BRIDGE,
      data: whitelistData,
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
