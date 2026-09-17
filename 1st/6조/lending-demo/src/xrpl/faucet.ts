/**
 * Account provisioning.
 *
 * Devnet faucet calls are rate limited and slow (about 5s each in the P0 probe), so
 * accounts are cached on disk and reused. A cached account is only re-funded when its
 * validated balance is below what the next run needs.
 */
import { Wallet } from 'xrpl';
import type { Client } from 'xrpl';

import { readAccount } from './read/account.ts';

export interface FundedAccount {
  address: string;
  seed: string;
  /** Validated balance in drops at the time of provisioning. */
  balanceDrops: string;
  /** True when this run called the faucet for this account. */
  funded: boolean;
}

export interface AccountCacheEntry {
  address: string;
  seed: string;
}

export interface AccountCache {
  network: string;
  createdAt: string;
  accounts: Record<string, AccountCacheEntry>;
}

export interface EnsureAccountsOptions {
  /** Logical names to provision, e.g. `['depositor', 'broker', 'borrower']`. */
  names: readonly string[];
  /** Minimum validated balance per name, in drops. Below this the faucet is called. */
  minBalanceDrops: Record<string, string>;
  /** Cache to reuse. Pass `null` to always create fresh accounts. */
  cache: AccountCache | null;
  onProgress?: (message: string) => void;
}

export interface EnsureAccountsResult {
  accounts: Record<string, FundedAccount>;
  cache: AccountCache;
  faucetCalls: number;
}

function bigintDrops(value: string): bigint {
  return BigInt(value);
}

async function fundOnce(
  client: Client,
  wallet: Wallet | null,
): Promise<{ wallet: Wallet; balanceDrops: string }> {
  const result = await client.fundWallet(wallet);
  // `balance` comes back as XRP; re-read the ledger so the number we keep is the raw
  // drops the ledger actually holds rather than a rounded convenience value.
  const account = await readAccount(client, result.wallet.classicAddress);
  return { wallet: result.wallet, balanceDrops: account.balanceDrops };
}

/**
 * Return one funded account per name, reusing the cache where the balance already
 * suffices. Throws if the faucet cannot reach the required balance - a half-funded
 * run would fail later with a confusing `tecUNFUNDED` instead.
 */
export async function ensureAccounts(
  client: Client,
  options: EnsureAccountsOptions,
): Promise<EnsureAccountsResult> {
  const report = options.onProgress ?? (() => undefined);
  const accounts: Record<string, FundedAccount> = {};
  const cacheEntries: Record<string, AccountCacheEntry> = {};
  let faucetCalls = 0;

  for (const name of options.names) {
    const required = bigintDrops(options.minBalanceDrops[name] ?? '0');
    const cached = options.cache?.accounts[name];

    if (cached) {
      const wallet = Wallet.fromSeed(cached.seed);
      const existing = await readAccount(client, wallet.classicAddress);
      if (existing.exists && bigintDrops(existing.balanceDrops) >= required) {
        report(`${name}: reusing ${wallet.classicAddress} (${existing.balanceDrops} drops)`);
        accounts[name] = {
          address: wallet.classicAddress,
          seed: cached.seed,
          balanceDrops: existing.balanceDrops,
          funded: false,
        };
        cacheEntries[name] = cached;
        continue;
      }
      report(
        `${name}: ${wallet.classicAddress} has ${existing.balanceDrops} drops, ` +
          `below the ${required.toString()} required; topping up from the faucet`,
      );
      const topped = await fundOnce(client, wallet);
      faucetCalls += 1;
      if (bigintDrops(topped.balanceDrops) < required) {
        throw new Error(
          `faucet top-up left ${name} (${wallet.classicAddress}) at ${topped.balanceDrops} ` +
            `drops, still below the required ${required.toString()}`,
        );
      }
      accounts[name] = {
        address: wallet.classicAddress,
        seed: cached.seed,
        balanceDrops: topped.balanceDrops,
        funded: true,
      };
      cacheEntries[name] = cached;
      continue;
    }

    report(`${name}: requesting a new faucet account`);
    const created = await fundOnce(client, null);
    faucetCalls += 1;
    const seed = created.wallet.seed;
    if (!seed) {
      throw new Error(`faucet returned a wallet without a seed for ${name}`);
    }
    if (bigintDrops(created.balanceDrops) < required) {
      throw new Error(
        `faucet funded ${name} (${created.wallet.classicAddress}) with ` +
          `${created.balanceDrops} drops, below the required ${required.toString()}`,
      );
    }
    report(`${name}: ${created.wallet.classicAddress} funded (${created.balanceDrops} drops)`);
    accounts[name] = {
      address: created.wallet.classicAddress,
      seed,
      balanceDrops: created.balanceDrops,
      funded: true,
    };
    cacheEntries[name] = { address: created.wallet.classicAddress, seed };
  }

  return {
    accounts,
    cache: {
      network: options.cache?.network ?? 'devnet',
      createdAt: options.cache?.createdAt ?? new Date().toISOString(),
      accounts: cacheEntries,
    },
    faucetCalls,
  };
}
