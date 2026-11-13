// Turns the stored transfer lists of both wallets into a small 1-hop graph. Only rearranges data;
// evidence marks come from the KYT evidence ids, nothing is judged here.
import type { Asset, NormalizedTransfer } from '../api/types'
import type { CaseRun } from '../cases/model'

export interface FlowNode {
  id: string
  kind: 'sender' | 'recipient' | 'counterparty' | 'account'
  address: string
  ownerUnknown: boolean
  firstSeen: string | null
}

export interface FlowEdge {
  id: string
  from: string
  to: string
  kind: 'recorded' | 'requested'
  evidence: boolean
  amountRaw: string
  asset: Asset
  timestamp: string | null
  signature: string | null
  transfer: NormalizedTransfer | null
}

export interface Flow {
  nodes: FlowNode[]
  edges: FlowEdge[]
  hiddenCount: number
}

const MAX_COUNTERPARTIES = 12

export function transferKey(t: NormalizedTransfer): string {
  return `${t.signature}:${t.instructionIndex}:${t.innerInstructionIndex ?? '-'}:${t.transferOrdinal}`
}

export function evidenceTransferIds(run: CaseRun): { sender: Set<string>; recipient: Set<string> } {
  const out = { sender: new Set<string>(), recipient: new Set<string>() }
  for (const side of ['sender', 'recipient'] as const) {
    const evaluation = run.compliance?.assessments[side] ?? run[side]?.result.evaluation
    for (const e of evaluation?.evidences ?? []) for (const id of e.transferIds) out[side].add(id)
  }
  return out
}

export function buildFlow(args: {
  sender: string
  recipient: string
  requested: { amountRaw: string; asset: Asset }
  senderTransfers: NormalizedTransfer[]
  recipientTransfers: NormalizedTransfer[]
  evidenceTransferIds: { sender: Set<string>; recipient: Set<string> }
}): Flow {
  const merged = new Map<string, { t: NormalizedTransfer; evidence: boolean }>()
  for (const [side, list] of [
    ['sender', args.senderTransfers],
    ['recipient', args.recipientTransfers],
  ] as const) {
    for (const t of list) {
      const k = transferKey(t)
      const ev = args.evidenceTransferIds[side].has(t.id)
      const prev = merged.get(k)
      if (prev) prev.evidence ||= ev
      else merged.set(k, { t, evidence: ev })
    }
  }

  const nodes = new Map<string, FlowNode>()
  nodes.set(args.sender, { id: args.sender, kind: 'sender', address: args.sender, ownerUnknown: false, firstSeen: null })
  if (args.recipient !== args.sender) {
    nodes.set(args.recipient, { id: args.recipient, kind: 'recipient', address: args.recipient, ownerUnknown: false, firstSeen: null })
  }
  const endpoint = (owner: string | null, account: string, ts: string | null) => {
    const id = owner ?? account
    const node = nodes.get(id)
    if (!node) nodes.set(id, { id, kind: owner ? 'counterparty' : 'account', address: id, ownerUnknown: owner === null, firstSeen: ts })
    else if (ts && (!node.firstSeen || ts < node.firstSeen)) node.firstSeen = ts
    return id
  }

  const edges: FlowEdge[] = []
  for (const [k, { t, evidence }] of merged) {
    const from = endpoint(t.fromAddress, t.sourceAccount, t.timestamp)
    const to = endpoint(t.toAddress, t.destinationAccount, t.timestamp)
    edges.push({ id: k, from, to, kind: 'recorded', evidence, amountRaw: t.amountRaw, asset: t.asset, timestamp: t.timestamp, signature: t.signature, transfer: t })
  }

  const others = [...nodes.values()].filter((n) => n.kind === 'counterparty' || n.kind === 'account')
  others.sort((a, b) => (a.firstSeen ?? '~').localeCompare(b.firstSeen ?? '~') || a.id.localeCompare(b.id))
  const hidden = new Set(others.slice(MAX_COUNTERPARTIES).map((n) => n.id))
  const visibleNodes = [...nodes.values()].filter((n) => !hidden.has(n.id))
  const visibleEdges = edges.filter((e) => !hidden.has(e.from) && !hidden.has(e.to))

  visibleEdges.push({
    id: 'requested',
    from: args.sender,
    to: args.recipient,
    kind: 'requested',
    evidence: false,
    amountRaw: args.requested.amountRaw,
    asset: args.requested.asset,
    timestamp: null,
    signature: null,
    transfer: null,
  })
  return { nodes: visibleNodes, edges: visibleEdges, hiddenCount: hidden.size }
}
