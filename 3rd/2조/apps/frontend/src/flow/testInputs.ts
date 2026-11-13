// Test helper: a case input built from contracts/fixtures scenarios.
import type { CaseInput } from '../cases/model'
import { findScenario } from '../contracts/catalog'

export function fixtureInput(senderFx: string, recipientFx: string, policyVersion = '1.0.0'): CaseInput {
  return {
    mode: 'FIXTURE',
    sender: { address: findScenario(senderFx)!.request.address, fixtureId: senderFx },
    recipient: { address: findScenario(recipientFx)!.request.address, fixtureId: recipientFx },
    asset: { type: 'SOL', mint: null, decimals: 9 },
    amountRaw: '1000000000',
    scope: null,
    policyVersion,
    rulesetVersion: null,
  }
}
