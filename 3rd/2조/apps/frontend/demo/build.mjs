// Demo scenarios for the frontend (Henry, 2026-11-11): wallets that did something, so a decision can be traced to behaviour.
// The shared contract fixtures (contracts/fixtures) isolate one rule each with 0–3 transfers; these are fuller days of activity.
//
//   node demo/build.mjs snapshots   write demo/fixtures/<id>/{snapshot,analysis-request}.json (transfers only, no results)
//   node demo/build.mjs merge       copy every snapshot (contracts + demo) into demo/.backend-fixtures for the local Backend
//   node demo/build.mjs record      ask a running Backend (real KYT and Policy engines) and save what it answers
//
// Nothing here scores or decides. `record` stores the engines' answers so the Mock can replay them.
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, 'fixtures')
const contracts = join(here, '../../../contracts/fixtures')
const merged = join(here, '.backend-fixtures')

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
function base58(bytes) {
  let n = BigInt('0x' + bytes.toString('hex'))
  let s = ''
  while (n > 0n) {
    s = ALPHABET[Number(n % 58n)] + s
    n /= 58n
  }
  for (const b of bytes) {
    if (b !== 0) break
    s = '1' + s
  }
  return s
}
// Synthetic, deterministic identifiers: valid Base58 shapes, not real accounts or transactions.
const address = (name) => base58(createHash('sha256').update(`scl-demo-address:${name}`).digest())
const signature = (name) => base58(createHash('sha512').update(`scl-demo-signature:${name}`).digest())
const lamports = (sol) => {
  const [whole, frac = ''] = String(sol).split('.')
  return (BigInt(whole) * 1_000_000_000n + BigInt((frac + '000000000').slice(0, 9))).toString()
}

const DAY = '2026-11-01'
const SENDER = JSON.parse(readFileSync(join(contracts, 'sender/analysis-request.json'), 'utf8')).address
const SOL = { type: 'SOL', mint: null, decimals: 9 }

/** rows: [time, from, to, SOL amount]; "me" is the analysed wallet, "sender" the common demo sender, other names become addresses. */
function scenario(id, { listed = [], rows }) {
  const me = address(`${id}:wallet`)
  const who = (name) => (name === 'me' ? me : name === 'sender' ? SENDER : address(`${id}:${name}`))
  const transfers = rows.map(([time, from, to, sol], i) => ({
    id: `transfer-${i + 1}`,
    signature: signature(`${id}:${i + 1}`),
    slot: 300_000 + i * 40,
    timestamp: `${DAY}T${time}Z`,
    instructionIndex: 0,
    innerInstructionIndex: null,
    transferOrdinal: 0,
    fromAddress: who(from),
    toAddress: who(to),
    sourceAccount: who(from),
    destinationAccount: who(to),
    asset: SOL,
    amountRaw: lamports(sol),
    ownerResolved: true,
  }))
  const scope = { fromTime: `${DAY}T00:00:00Z`, toTime: '2026-11-02T00:00:00Z', maxTransactions: 100 }
  const request = { address: me, network: 'mainnet-beta', mode: 'FIXTURE', fixtureId: id, scope }
  const snapshot = {
    schemaVersion: '0.1.0',
    snapshotId: `${id}-snapshot`,
    requestId: `${id}-request`,
    address: me,
    network: 'mainnet-beta',
    mode: 'FIXTURE',
    transfers,
    labels: listed.map((name, i) => ({
      address: who(name),
      network: 'mainnet-beta',
      type: 'SANCTIONED',
      source: 'TEST_FIXTURE',
      referenceId: `demo-sanction-${String(i + 1).padStart(3, '0')}`,
    })),
    labelDataset: { source: 'TEST_FIXTURE', version: '1.0.0', fetchedAt: scope.toTime },
    coverage: {
      status: 'COMPLETE',
      reasons: [],
      fromTime: scope.fromTime,
      toTime: scope.toTime,
      snapshotSlot: 400_000,
      transactionCount: transfers.length,
      transferCount: transfers.length,
      reachedTimeBoundary: true,
    },
    collectedAt: scope.toTime,
    dataProvenance: { dataType: 'SYNTHETIC', source: 'TEST_FIXTURE', reference: 'https://example.invalid/frontend-demo-scenarios' },
  }
  return { id, request, snapshot }
}

const SCENARIOS = [
  // Funds arrive from a listed address, are split across fresh wallets within minutes, and a little goes on to a second listed address.
  scenario('demo-layering', {
    listed: ['listed-a', 'listed-b'],
    rows: [
      ['08:12:00', 'exchange', 'me', '4.2'],
      ['09:03:10', 'me', 'merchant', '0.35'],
      ['09:40:25', 'sender', 'me', '1'],
      ['10:15:00', 'me', 'friend', '0.8'],
      ['11:22:40', 'friend', 'me', '0.2'],
      ['12:05:05', 'me', 'merchant', '0.12'],
      ['13:02:00', 'listed-a', 'me', '40'],
      ['13:05:30', 'listed-a', 'me', '25'],
      ['13:10:00', 'me', 'split-1', '10.5'],
      ['13:10:40', 'me', 'split-2', '10.5'],
      ['13:11:20', 'me', 'split-3', '10.5'],
      ['13:12:00', 'me', 'split-4', '10.5'],
      ['13:12:45', 'me', 'split-5', '10.5'],
      ['13:13:30', 'me', 'split-6', '9.5'],
      ['15:00:00', 'me', 'listed-b', '3'],
      ['16:30:00', 'me', 'exchange', '1.5'],
      ['18:45:10', 'merchant', 'me', '0.05'],
      ['20:10:00', 'me', 'friend', '0.4'],
      ['21:55:30', 'exchange', 'me', '2'],
      ['23:20:00', 'me', 'merchant', '0.3'],
    ],
  }),
  // No listed address anywhere: a burst of identical payments to one wallet, then a quick spread to four others.
  scenario('demo-burst', {
    rows: [
      ['07:30:00', 'exchange', 'me', '12'],
      ['08:05:00', 'me', 'merchant', '0.4'],
      ['09:15:00', 'sender', 'me', '1'],
      ['10:00:00', 'me', 'payee', '0.5'],
      ['10:00:12', 'me', 'payee', '0.5'],
      ['10:00:24', 'me', 'payee', '0.5'],
      ['10:00:36', 'me', 'payee', '0.5'],
      ['10:00:48', 'me', 'payee', '0.5'],
      ['12:30:00', 'friend', 'me', '0.7'],
      ['14:00:00', 'me', 'out-1', '1.2'],
      ['14:01:10', 'me', 'out-2', '1.2'],
      ['14:02:20', 'me', 'out-3', '1.2'],
      ['14:03:30', 'me', 'out-4', '1.2'],
      ['17:45:00', 'me', 'merchant', '0.25'],
      ['19:10:00', 'exchange', 'me', '3'],
      ['22:05:00', 'me', 'friend', '0.6'],
    ],
  }),
  // A busy but unremarkable day: many counterparties, payments spread out, no listed address.
  scenario('demo-busy-clean', {
    rows: [
      ['06:50:00', 'exchange', 'me', '8'],
      ['07:40:00', 'me', 'merchant-1', '0.2'],
      ['08:30:00', 'sender', 'me', '1'],
      ['09:20:00', 'me', 'friend-1', '0.5'],
      ['10:10:00', 'friend-2', 'me', '0.3'],
      ['11:00:00', 'me', 'merchant-2', '0.15'],
      ['11:50:00', 'me', 'merchant-1', '0.2'],
      ['12:40:00', 'employer', 'me', '6'],
      ['13:30:00', 'me', 'landlord', '4'],
      ['14:20:00', 'me', 'friend-2', '0.3'],
      ['15:10:00', 'merchant-3', 'me', '0.08'],
      ['16:00:00', 'me', 'merchant-3', '0.4'],
      ['16:50:00', 'me', 'exchange', '2'],
      ['17:40:00', 'friend-1', 'me', '0.25'],
      ['18:30:00', 'me', 'merchant-2', '0.18'],
      ['19:20:00', 'me', 'friend-1', '0.1'],
      ['20:10:00', 'exchange', 'me', '1.5'],
      ['21:00:00', 'me', 'merchant-1', '0.22'],
    ],
  }),
]

const write = (file, value) => {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
}

function snapshots() {
  for (const s of SCENARIOS) {
    write(join(out, s.id, 'snapshot.json'), s.snapshot)
    write(join(out, s.id, 'analysis-request.json'), s.request)
    console.log(`${s.id}: ${s.snapshot.transfers.length} transfers, ${new Set(s.snapshot.transfers.flatMap((t) => [t.fromAddress, t.toAddress])).size - 1} counterparties`)
  }
}

function merge() {
  rmSync(merged, { recursive: true, force: true })
  for (const root of [contracts, out]) {
    for (const id of readdirSync(root)) {
      const file = join(root, id, 'snapshot.json')
      if (existsSync(file)) cpSync(file, join(merged, id, 'snapshot.json'))
    }
  }
  console.log(`merged ${readdirSync(merged).length} snapshots into ${merged}`)
}

async function record() {
  const base = process.env.BACKEND_URL ?? 'http://127.0.0.1:8080'
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const json = await res.json()
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`)
    return json
  }
  const analyse = async (request) => {
    const { analysisId } = await call('POST', '/api/v1/analyses', request)
    for (let tries = 0; tries < 150; tries++) {
      const result = await call('GET', `/api/v1/analyses/${analysisId}`)
      if (['COMPLETED', 'PARTIAL', 'FAILED'].includes(result.status)) return result
      await new Promise((r) => setTimeout(r, 200))
    }
    throw new Error(`analysis ${analysisId} did not finish within 30 s`)
  }
  const senderRequest = JSON.parse(readFileSync(join(contracts, 'sender/analysis-request.json'), 'utf8'))
  const policies = readdirSync(join(here, '../../../contracts/config/policies')).map((f) => f.replace(/\.json$/, '')).sort()
  for (const s of SCENARIOS) {
    const sender = await analyse(senderRequest)
    const recipient = await analyse(s.request)
    if (recipient.status === 'FAILED') throw new Error(`${s.id}: ${JSON.stringify(recipient.error)}`)
    // Stored under the Mock's ID convention (<fixtureId>-analysis); the Mock swaps in its own IDs when replaying.
    write(join(out, s.id, 'analysis.json'), { ...recipient, analysisId: `${s.id}-analysis`, requestId: `${s.id}-request` })
    for (const policyVersion of policies) {
      const intent = { intentId: `${s.id}-intent`, network: 'mainnet-beta', sender: sender.address, recipient: recipient.address, asset: SOL, amountRaw: lamports('1'), requestedAt: '2026-11-02T00:00:00Z' }
      const response = await call('POST', '/api/v1/compliance/evaluate', { intent, senderAnalysisId: sender.analysisId, recipientAnalysisId: recipient.analysisId, policyVersion })
      const dir = policyVersion === policies[0] ? join(out, s.id) : join(out, s.id, `policy-${policyVersion}`)
      write(join(dir, 'public-policy-request.json'), { intent, senderAnalysisId: 'sender-analysis', recipientAnalysisId: `${s.id}-analysis`, policyVersion })
      write(join(dir, 'public-policy-response.json'), { ...response, requestId: `${s.id}-policy-request` })
      console.log(`${s.id} policy ${policyVersion}: ${response.decision.action} ${response.decision.reasonCodes.join(', ')} (risk ${response.decision.riskScore})`)
    }
  }
}

const command = process.argv[2]
if (command === 'snapshots') snapshots()
else if (command === 'merge') merge()
else if (command === 'record') await record()
else {
  console.error('usage: node demo/build.mjs snapshots | merge | record')
  process.exit(1)
}
