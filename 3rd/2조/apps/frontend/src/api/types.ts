// contracts/schemas/*.schema.json (schemaVersion 0.1.0)을 그대로 옮긴 타입.
// 런타임에는 api/contract.ts가 같은 스키마로 응답을 검증하므로, 이 파일은 편집기 보조용이다.
// 계약이 바뀌면 스키마가 기준이며 이 파일을 함께 고친다.

export type Id = string
export type Version = string
export type UtcTimestamp = string
export type Address = string
export type Signature = string
/** 최소 단위의 십진 정수 문자열. Number로 바꾸지 않는다. */
export type RawAmount = string

export type Network = 'mainnet-beta'
export type Mode = 'LIVE' | 'FIXTURE'
export type JobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED'
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH'
export type Action = 'ALLOW' | 'WARN' | 'REVIEW' | 'BLOCK'

export type ErrorCode =
  | 'INVALID_REQUEST'
  | 'CONTRACT_VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'ANALYSIS_NOT_READY'
  | 'ASSESSMENT_MISMATCH'
  | 'UNSUPPORTED_VERSION'
  | 'UPSTREAM_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'

export interface ApiErrorBody {
  code: ErrorCode
  message: string
  retryable: boolean
}

export interface ErrorResponse {
  error: ApiErrorBody
  requestId: Id
}

export interface Scope {
  fromTime: UtcTimestamp
  toTime: UtcTimestamp
  maxTransactions: number
}

export interface Asset {
  type: 'SOL' | 'SPL' | 'TOKEN_2022'
  mint: Address | null
  decimals: number
}

export interface DataProvenance {
  dataType: 'ON_CHAIN' | 'SYNTHETIC'
  source: string
  reference: string | null
}

export type CoverageReason =
  | 'TRANSACTION_LIMIT_REACHED'
  | 'TIME_BOUNDARY_NOT_REACHED'
  | 'TRANSACTION_FETCH_FAILED'
  | 'UNSUPPORTED_INSTRUCTION'
  | 'PARSE_FAILED'
  | 'OWNER_UNRESOLVED'
  | 'TIMESTAMP_UNAVAILABLE'
  | 'LABEL_DATASET_UNAVAILABLE'

export interface Coverage {
  status: 'COMPLETE' | 'PARTIAL'
  reasons: CoverageReason[]
  fromTime: UtcTimestamp
  toTime: UtcTimestamp
  snapshotSlot: number | null
  transactionCount: number
  transferCount: number
  reachedTimeBoundary: boolean
}

export interface NormalizedTransfer {
  id: Id
  signature: Signature
  slot: number
  timestamp: UtcTimestamp | null
  instructionIndex: number
  innerInstructionIndex: number | null
  transferOrdinal: number
  fromAddress: Address | null
  toAddress: Address | null
  sourceAccount: Address
  destinationAccount: Address
  asset: Asset
  amountRaw: RawAmount
  ownerResolved: boolean
}

export interface LabelDataset {
  source: 'OFAC_SDN' | 'TEST_FIXTURE'
  version: string
  fetchedAt: UtcTimestamp
}

export type RuleId = 'SANCTION_EXACT' | 'SANCTION_DIRECT_FLOW' | 'RAPID_FAN_OUT' | 'RAPID_REPEAT'

export interface DetectedRule {
  ruleId: RuleId
  ruleVersion: Version
  riskLevel: RiskLevel
  scoreContribution: number
  evidenceIds: Id[]
}

export interface EvidenceSource {
  snapshotId: Id
  network: Network
  mode: Mode
  dataProvenance: DataProvenance
  labelDataset: LabelDataset
}

export interface Evidence {
  evidenceId: Id
  type: 'ADDRESS_LABEL' | 'DIRECT_FLOW' | 'TEMPORAL_PATTERN'
  transactionSignatures: Signature[]
  transferIds: Id[]
  relatedAddresses: Address[]
  labelReferenceIds: Id[]
  source: EvidenceSource
}

export interface KYTEvaluation {
  schemaVersion: '0.1.0'
  subjectAddress: Address
  snapshotId: Id
  rulesetVersion: Version
  /** null은 0점이 아니다. 부분 분석이라 종합 점수를 내지 않은 상태. */
  riskScore: number | null
  riskLevel: RiskLevel | null
  detectedRules: DetectedRule[]
  evidences: Evidence[]
}

// ---- Public API ----

export interface AnalysisRequest {
  address: Address
  network: Network
  mode: Mode
  fixtureId?: Id
  scope: Scope
  rulesetVersion?: Version
}

export interface AnalysisAccepted {
  schemaVersion: '0.1.0'
  analysisId: Id
  requestId: Id
  status: 'QUEUED'
}

export interface KYTAnalysisResult {
  schemaVersion: '0.1.0'
  analysisId: Id
  requestId: Id
  status: JobStatus
  address: Address
  network: Network
  mode: Mode
  createdAt: UtcTimestamp
  updatedAt: UtcTimestamp
  snapshotId: Id | null
  coverage: Coverage | null
  dataProvenance: DataProvenance | null
  evaluation: KYTEvaluation | null
  error: ApiErrorBody | null
}

export interface TransferPage {
  schemaVersion: '0.1.0'
  analysisId: Id
  snapshotId: Id
  items: NormalizedTransfer[]
  pagination: { limit: number; nextCursor: Id | null }
}

export interface TransactionIntent {
  intentId: Id
  network: Network
  sender: Address
  recipient: Address
  asset: Asset
  /** 양의 십진 정수 문자열 */
  amountRaw: RawAmount
  requestedAt: UtcTimestamp
}

export type PolicyReasonCode =
  | 'NO_RISK_SIGNALS'
  | 'SANCTION_EXACT_MATCH'
  | 'SANCTION_DIRECT_FLOW_REVIEW'
  | 'SANCTION_DIRECT_FLOW_BLOCK'
  | 'INSUFFICIENT_ASSESSMENT'
  | 'RISK_SIGNALS_DETECTED'
  | 'HIGH_RISK_REVIEW'
  | 'HIGH_RISK_BLOCK'
  | 'HIGH_RISK_WARN'

export interface ComplianceDecision {
  schemaVersion: '0.1.0'
  decisionId: Id
  intentId: Id
  action: Action
  riskScore: number | null
  riskLevel: RiskLevel | null
  reasonCodes: PolicyReasonCode[]
  referencedEvidenceIds: Id[]
  policyVersion: Version
  evaluatedAt: UtcTimestamp
}

export interface ComplianceRequest {
  intent: TransactionIntent
  senderAnalysisId: Id
  recipientAnalysisId: Id
  policyVersion: Version
}

export interface ComplianceResponse {
  schemaVersion: '0.1.0'
  requestId: Id
  intent: TransactionIntent
  assessments: { sender: KYTEvaluation; recipient: KYTEvaluation }
  decision: ComplianceDecision
}

export interface GatewayRoute {
  routeId: Id
  policyEnforced: boolean
  warningAcknowledged: boolean
}

export interface GatewayRequest {
  intentId: Id
  decisionId: Id
  route: GatewayRoute
}

export type GatewayOutcome = 'SUBMISSION_ALLOWED' | 'SUBMISSION_REJECTED' | 'REVIEW_REQUIRED'

export type GatewayReason =
  | 'POLICY_NOT_ENFORCED'
  | 'POLICY_ALLOW'
  | 'POLICY_BLOCK'
  | 'POLICY_REVIEW'
  | 'WARNING_NOT_ACKNOWLEDGED'
  | 'WARNING_ACKNOWLEDGED'

export interface GatewayExperimentResult {
  schemaVersion: '0.1.0'
  experimentId: Id
  intentId: Id
  routeId: Id
  outcome: GatewayOutcome
  policyApplied: boolean
  reasonCodes: GatewayReason[]
  actualBroadcast: false
}

export interface ConstellationScenario {
  proposerCount: number
  rejectingProposerCount: number
  submittedToAcceptingProposer: boolean
  psliceAvailable: boolean
  /** Target pslice witnesses. Aggregate participation is separate; optional only for historical records. */
  attestationPercent: number
  attesterParticipationPercent?: number
  leaderAttemptsExclusion: boolean
}

export interface ConstellationRequest {
  intentId: Id
  decisionId: Id
  protocolModelVersion: Version
  scenario: ConstellationScenario
}

export type ConstellationOutcome =
  | 'NO_SUBMISSION_PATH'
  | 'INCLUSION_NOT_ENFORCED'
  | 'INCLUSION_ENFORCED'
  | 'INVALID_SCENARIO'
  | 'BLOCK_SKIPPED'

export type SimulationExplanation =
  | 'NO_ACCEPTING_PROPOSER'
  | 'NOT_SUBMITTED_TO_ACCEPTING_PROPOSER'
  | 'PSLICE_UNAVAILABLE'
  | 'ATTESTATION_CONDITION_NOT_MET'
  | 'ATTESTATION_CONDITION_MET'
  | 'LEADER_EXCLUSION_VALID'
  | 'LEADER_EXCLUSION_INVALID'
  | 'NO_EXCLUSION_ATTEMPT'
  | 'REJECTING_COUNT_EXCEEDS_TOTAL'
  | 'CONTRADICTORY_SUBMISSION_PATH'
  | 'MOCK_RESULT_NOT_PROTOCOL_VALIDATED'
  | 'BLOCK_PARTICIPATION_BELOW_THRESHOLD'
  | 'BLOCK_PARTICIPATION_THRESHOLD_MET'
  | 'PSLICE_ATTESTATION_EXCEEDS_PARTICIPATION'
  | 'REQUIRED_PSLICE_UNAVAILABLE'

export interface ConstellationSimulationResult {
  schemaVersion: '0.1.0'
  simulationId: Id
  intentId: Id
  protocolModelVersion: Version
  proposerPathAvailable: boolean
  psliceInclusionEnforced: boolean
  leaderExclusionValid: boolean | null
  outcome: ConstellationOutcome
  explanationCodes: SimulationExplanation[]
  blockStatus?: 'VALID' | 'SKIPPED' | 'INVALID_LEADER_EXCLUSION' | 'NOT_EVALUATED'
  modelParameters?: { sourceId: 'team-research-40-60-v1'; psliceInclusionThresholdPercent: 40; blockParticipationThresholdPercent: 60 }
  simulationOnly: true
}

/** A server-side immutable execution record; its review remains available after Backend restart. */
interface ExperimentRecordBase {
  schemaVersion: '0.1.0'
  recordId: Id
  requestId: Id
  createdAt: UtcTimestamp
  intentId: Id
  decisionId: Id
  review: ComplianceResponse
}

export type ExperimentRecord = ExperimentRecordBase & (
  | { type: 'GATEWAY'; request: GatewayRequest; result: GatewayExperimentResult }
  | { type: 'CONSTELLATION'; request: ConstellationRequest; result: ConstellationSimulationResult }
)

export interface ExperimentPage {
  schemaVersion: '0.1.0'
  items: ExperimentRecord[]
  pagination: { limit: number; nextCursor: string | null }
}
