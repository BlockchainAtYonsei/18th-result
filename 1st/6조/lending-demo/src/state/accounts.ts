/**
 * Browser-side account provisioning.
 *
 * `src/xrpl/faucet.ts` owns the faucet policy (reuse a cached account, top it up only
 * when its validated balance is short). This module adds the one thing only a browser
 * needs: persisting the cache across reloads in `localStorage`.
 *
 * Exactly three accounts are provisioned per run, one per role. Since the wallet path
 * was removed (`docs/decisions.md` D20) every one of them is a local keypair, so there
 * is no address the app holds no seed for and no separate downgrade fallback account.
 */
import type { Client } from 'xrpl';

import { ensureAccounts } from '../xrpl/faucet.ts';
import type { AccountCache, FundedAccount } from '../xrpl/faucet.ts';

import { MIN_BALANCE_DROPS, SETUP_ACCOUNT_NAMES } from './scenarioConfig.ts';
import type { SetupAccountName } from './scenarioConfig.ts';

const CACHE_KEY = 'xls6566.accounts.v1';

export function loadAccountCache(): AccountCache | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as AccountCache;
    return parsed.accounts ? parsed : null;
  } catch {
    // A corrupt or unavailable cache is not fatal: provision fresh accounts instead.
    return null;
  }
}

export function saveAccountCache(cache: AccountCache): void {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Private browsing or a full quota. The run still works, it just re-faucets later.
  }
}

export function clearAccountCache(): void {
  try {
    window.localStorage.removeItem(CACHE_KEY);
  } catch {
    /* nothing to clear */
  }
}

export interface ProvisionResult {
  accounts: Record<SetupAccountName, FundedAccount>;
  faucetCalls: number;
}

/**
 * Ensure the three faucet accounts exist with enough balance, persisting the cache so
 * a reset reuses them. `onProgress` messages are surfaced verbatim in the tx log.
 */
export async function provisionAccounts(
  client: Client,
  onProgress: (message: string) => void,
): Promise<ProvisionResult> {
  const result = await ensureAccounts(client, {
    names: SETUP_ACCOUNT_NAMES,
    minBalanceDrops: MIN_BALANCE_DROPS,
    cache: loadAccountCache(),
    onProgress,
  });
  saveAccountCache(result.cache);

  const accounts = {} as Record<SetupAccountName, FundedAccount>;
  for (const name of SETUP_ACCOUNT_NAMES) {
    const account = result.accounts[name];
    if (!account) {
      throw new Error(`faucet provisioning returned no account for ${name}`);
    }
    accounts[name] = account;
  }
  return { accounts, faucetCalls: result.faucetCalls };
}
