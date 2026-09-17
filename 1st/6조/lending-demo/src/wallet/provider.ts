/**
 * Browser `SignerProvider` (frozen contract, `docs/interfaces-frozen.md` §1).
 *
 * Every role signs with a local keypair derived from a faucet seed. The browser
 * extension path was removed in `docs/decisions.md` D20: neither Crossmark nor
 * GemWallet can encode an XLS-65/66 transaction type, so a wallet could never sign
 * the demo's `VaultDeposit` at all.
 *
 * The `SignerProvider` interface itself is frozen and keeps all four methods.
 * `downgradeDepositorOnce` has nothing to downgrade to now, so it throws - the same
 * shape `nodeProvider.ts` has always used, because a silent no-op would hide a caller
 * that still believes a wallet path exists.
 */
import type { Role, ScenarioCtx } from '../scenario/types.ts';
import type { Signer, SignerProvider } from './types.ts';
import { makeLocalKeypairSignerFromSeed } from './localKeypair.ts';

export interface BrowserSignerProviderAccounts {
  depositorSeed: string;
  brokerSeed: string;
  borrowerSeed: string;
}

class BrowserSignerProvider implements SignerProvider {
  private readonly depositorSigner: Signer;
  private readonly brokerSigner: Signer;
  private readonly borrowerSigner: Signer;
  private frozen = false;

  constructor(accounts: BrowserSignerProviderAccounts) {
    this.depositorSigner = makeLocalKeypairSignerFromSeed(accounts.depositorSeed);
    this.brokerSigner = makeLocalKeypairSignerFromSeed(accounts.brokerSeed);
    this.borrowerSigner = makeLocalKeypairSignerFromSeed(accounts.borrowerSeed);
  }

  for(role: Role): Signer {
    switch (role) {
      case 'depositor':
        return this.depositorSigner;
      case 'broker':
        return this.brokerSigner;
      case 'borrower':
        return this.borrowerSigner;
    }
  }

  downgradeDepositorOnce(_ctx: ScenarioCtx): void {
    throw new Error(
      'no wallet path: every role signs with a local keypair (docs/decisions.md D20)',
    );
  }

  freeze(): void {
    this.frozen = true;
  }

  isFrozen(): boolean {
    return this.frozen;
  }
}

export function createBrowserSignerProvider(
  accounts: BrowserSignerProviderAccounts,
): SignerProvider {
  return new BrowserSignerProvider(accounts);
}
