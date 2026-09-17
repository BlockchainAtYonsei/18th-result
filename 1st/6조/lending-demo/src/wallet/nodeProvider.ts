/**
 * `SignerProvider` for the Node runner: every role is a local keypair.
 *
 * The runner has no browser wallet and therefore no downgrade path, so
 * `downgradeDepositorOnce` throws. That is deliberate - a silent no-op would let a
 * browser-only bug pass the headless run.
 */
import { Wallet } from 'xrpl';

import type { Role, ScenarioCtx } from '../scenario/types.ts';

import { makeLocalKeypairSigner } from './localKeypair.ts';
import type { CounterpartyCapableSigner } from './localKeypair.ts';
import type { Signer, SignerProvider } from './types.ts';

export interface NodeSignerProviderOptions {
  seeds: Record<Role, string>;
}

export class NodeSignerProvider implements SignerProvider {
  private readonly signers: Record<Role, CounterpartyCapableSigner>;
  private frozen = false;

  constructor(options: NodeSignerProviderOptions) {
    this.signers = {
      depositor: makeLocalKeypairSigner(Wallet.fromSeed(options.seeds.depositor)),
      broker: makeLocalKeypairSigner(Wallet.fromSeed(options.seeds.broker)),
      borrower: makeLocalKeypairSigner(Wallet.fromSeed(options.seeds.borrower)),
    };
  }

  for(role: Role): Signer {
    return this.signers[role];
  }

  downgradeDepositorOnce(_ctx: ScenarioCtx): void {
    throw new Error(
      'the Node runner signs every role with a local keypair; there is nothing to downgrade to',
    );
  }

  freeze(): void {
    this.frozen = true;
  }

  isFrozen(): boolean {
    return this.frozen;
  }
}
