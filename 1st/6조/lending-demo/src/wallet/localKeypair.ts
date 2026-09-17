/**
 * `Signer` over a local xrpl `Wallet`.
 *
 * This is the fallback signer for the browser and the only signer the Node runner
 * uses. It always returns `mode: 'blob'`: the app submits, so both runtimes take the
 * identical path through `submit.ts`.
 */
import { Wallet, decode, encode, encodeForSigning, hashes } from 'xrpl';
import { sign as signWithPrivateKey } from 'ripple-keypairs';

import type { SignOutcome, Signer } from './types.ts';
import { SignRejectedError } from './types.ts';

/**
 * A signer that can also add a `CounterpartySignature` to an already-signed
 * `LoanSet`. Only a local keypair can do this - it needs the private key, and no
 * browser wallet exposes a counterparty-signing entry point.
 */
export interface CounterpartyCapableSigner extends Signer {
  kind: 'localKeypair';
  signAsCounterparty(signedTxBlob: string): { txBlob: string; hash: string };
}

export function isCounterpartyCapable(signer: Signer): signer is CounterpartyCapableSigner {
  return (
    signer.kind === 'localKeypair' &&
    typeof (signer as CounterpartyCapableSigner).signAsCounterparty === 'function'
  );
}

/**
 * `HashPrefix::TxSign` - the four bytes `ripple-binary-codec` prepends in
 * `encodeForSigning`.
 */
const TX_SIGN_PREFIX = '53545800';

/**
 * `HashPrefix::CounterpartyTxSign` ("CPT\0"). rippled verifies a
 * `CounterpartySignature` against this prefix, not the ordinary transaction one.
 */
const COUNTERPARTY_TX_SIGN_PREFIX = '43505400';

/**
 * Signing payload for a `CounterpartySignature`.
 *
 * xrpl.js ships `signLoanSetByCounterparty`, but through 5.2.0-beta.0 it signs the
 * ordinary `HashPrefix::TxSign` payload, which devnet rejects at submission with
 * "Counterparty: Invalid signature." The signed field set is identical, so the fix is
 * to swap the four prefix bytes. See `docs/decisions.md` D10.
 */
function counterpartySigningData(tx: Record<string, unknown>): string {
  const data = encodeForSigning(tx as Parameters<typeof encodeForSigning>[0]);
  if (!data.startsWith(TX_SIGN_PREFIX)) {
    throw new Error(
      `encodeForSigning no longer emits the ${TX_SIGN_PREFIX} prefix (got ${data.slice(0, 8)}); ` +
        'the counterparty prefix swap is unsafe until this is re-checked',
    );
  }
  return COUNTERPARTY_TX_SIGN_PREFIX + data.slice(TX_SIGN_PREFIX.length);
}

/**
 * Add a single-key `CounterpartySignature` to a `LoanSet` blob the first party has
 * already signed. The multi-signature form (`CounterpartySignature.Signers`, which
 * `combineLoanSetCounterpartySigners` merges) is not used: the demo's counterparty is
 * always one local keypair.
 */
function signLoanSetAsCounterparty(
  wallet: Wallet,
  signedTxBlob: string,
): { txBlob: string; hash: string } {
  const tx = decode(signedTxBlob) as Record<string, unknown>;
  if (tx.TransactionType !== 'LoanSet') {
    throw new Error(`counterparty signing is only defined for LoanSet, got ${String(tx.TransactionType)}`);
  }
  if (tx.CounterpartySignature !== undefined) {
    throw new Error('transaction already carries a CounterpartySignature');
  }
  if (typeof tx.TxnSignature !== 'string' || typeof tx.SigningPubKey !== 'string') {
    throw new Error('the first party must sign before the counterparty can');
  }

  const signature = signWithPrivateKey(counterpartySigningData(tx), wallet.privateKey);
  const combined = {
    ...tx,
    CounterpartySignature: {
      SigningPubKey: wallet.publicKey,
      TxnSignature: signature,
    },
  };
  const txBlob = encode(combined as Parameters<typeof encode>[0]);
  return { txBlob, hash: hashes.hashSignedTx(txBlob) };
}

export function makeLocalKeypairSigner(wallet: Wallet): CounterpartyCapableSigner {
  return {
    kind: 'localKeypair',
    address: wallet.classicAddress,

    async sign(tx: Record<string, unknown>): Promise<SignOutcome> {
      if (tx.Account !== wallet.classicAddress) {
        throw new SignRejectedError(
          'localKeypair',
          'unsupported',
          `tx Account ${String(tx.Account)} does not match signer ${wallet.classicAddress}`,
        );
      }
      const signed = wallet.sign(tx as unknown as Parameters<Wallet['sign']>[0]);
      return { mode: 'blob', txBlob: signed.tx_blob, hash: signed.hash };
    },

    signAsCounterparty(signedTxBlob: string): { txBlob: string; hash: string } {
      return signLoanSetAsCounterparty(wallet, signedTxBlob);
    },
  };
}

/** Derive a signer from a seed. Used by the Node runner and the fallback depositor. */
export function makeLocalKeypairSignerFromSeed(seed: string): CounterpartyCapableSigner {
  return makeLocalKeypairSigner(Wallet.fromSeed(seed));
}

/**
 * A composite signer for `LoanSet`: `primary` signs as `Account`, then `counterparty`
 * appends the `CounterpartySignature`. To `submit.ts` this is an ordinary signer that
 * happens to return a blob carrying two signatures, so the transaction still travels
 * the single submission gate.
 */
export function makeCounterpartySignedSigner(primary: Signer, counterparty: Signer): Signer {
  if (!isCounterpartyCapable(counterparty)) {
    throw new Error(
      `counterparty signer ${counterparty.address} (${counterparty.kind}) cannot produce a ` +
        'CounterpartySignature; LoanSet needs a local keypair on that side',
    );
  }
  // Capture the narrowed signer in a const: TypeScript does not carry a parameter's
  // narrowing into the closure below.
  const co: CounterpartyCapableSigner = counterparty;
  return {
    kind: primary.kind,
    address: primary.address,
    async sign(tx: Record<string, unknown>): Promise<SignOutcome> {
      if (tx.TransactionType !== 'LoanSet') {
        throw new Error(
          `counterparty co-signing is only defined for LoanSet, got ${String(tx.TransactionType)}`,
        );
      }
      const first = await primary.sign(tx);
      if (first.mode !== 'blob') {
        // A wallet that submits on its own cannot be co-signed: the ledger would have
        // already rejected the half-signed transaction with temBAD_SIGNER.
        throw new SignRejectedError(
          primary.kind,
          'unsupported',
          'LoanSet needs the signed blob back for counterparty signing, but the wallet ' +
            'submitted the transaction itself',
        );
      }
      const combined = co.signAsCounterparty(first.txBlob);
      return { mode: 'blob', txBlob: combined.txBlob, hash: combined.hash };
    },
  };
}
