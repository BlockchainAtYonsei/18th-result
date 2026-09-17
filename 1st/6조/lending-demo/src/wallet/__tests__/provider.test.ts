/**
 * Unit tests for `createBrowserSignerProvider`.
 *
 * `localKeypair.ts` is mocked (a `vi.fn` factory returning tagged fake `Signer`
 * objects) so these tests exercise only the provider's own logic: which signer
 * `for()` returns, the freeze flag, and the fact that the downgrade path is gone
 * (`docs/decisions.md` D20 - the wallet path was removed, so there is nothing to
 * downgrade from).
 */
import { describe, expect, it, vi } from 'vitest';
import type { ScenarioCtx } from '../../scenario/types.ts';
import type { Signer } from '../types.ts';

vi.mock('../localKeypair.ts', () => ({
  makeLocalKeypairSignerFromSeed: vi.fn((seed: string) =>
    makeFakeSigner('localKeypair', `addr-for-${seed}`),
  ),
}));

function makeFakeSigner(kind: Signer['kind'], address: string): Signer {
  return {
    kind,
    address,
    sign: vi.fn(),
  };
}

// Imported after the mock above so the module under test picks it up.
const { createBrowserSignerProvider } = await import('../provider.ts');

const SEEDS = {
  depositorSeed: 'sDEPOSITOR',
  brokerSeed: 'sBROKER',
  borrowerSeed: 'sBORROWER',
};

function makeCtx(overrides: Partial<ScenarioCtx> = {}): ScenarioCtx {
  return {
    client: {} as ScenarioCtx['client'],
    signers: undefined as unknown as ScenarioCtx['signers'],
    accounts: { depositor: 'rDEPOSITOR', broker: 'rBROKER', borrower: 'rBORROWER' },
    params: {} as ScenarioCtx['params'],
    ids: {},
    fallbackDepositor: { address: 'rDEPOSITOR', seed: 'sDEPOSITOR' },
    snapshot: null,
    log: vi.fn(),
    ...overrides,
  };
}

describe('createBrowserSignerProvider', () => {
  it('signs every role with a local keypair derived from that role seed', () => {
    const provider = createBrowserSignerProvider(SEEDS);

    for (const [role, seed] of [
      ['depositor', 'sDEPOSITOR'],
      ['broker', 'sBROKER'],
      ['borrower', 'sBORROWER'],
    ] as const) {
      const signer = provider.for(role);
      expect(signer.kind).toBe('localKeypair');
      expect(signer.address).toBe(`addr-for-${seed}`);
    }
  });

  it('returns the same Signer instance on repeated lookups', () => {
    const provider = createBrowserSignerProvider(SEEDS);
    expect(provider.for('depositor')).toBe(provider.for('depositor'));
  });

  it('downgradeDepositorOnce throws: there is no wallet path to downgrade from', () => {
    const provider = createBrowserSignerProvider(SEEDS);
    const ctx = makeCtx();

    expect(() => provider.downgradeDepositorOnce(ctx)).toThrow(/no wallet path/);
    // The context is left untouched.
    expect(ctx.accounts.depositor).toBe('rDEPOSITOR');
    expect(provider.for('depositor').address).toBe('addr-for-sDEPOSITOR');
  });

  it('freeze() flips isFrozen() and leaves the signers in place', () => {
    const provider = createBrowserSignerProvider(SEEDS);

    expect(provider.isFrozen()).toBe(false);
    provider.freeze();
    expect(provider.isFrozen()).toBe(true);
    expect(provider.for('depositor').address).toBe('addr-for-sDEPOSITOR');
    expect(() => provider.downgradeDepositorOnce(makeCtx())).toThrow(/no wallet path/);
  });
});
