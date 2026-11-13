import type { AnalysisRequest, KYTAnalysisResult, NormalizedTransfer, ComplianceRequest, ComplianceResponse, GatewayRequest, GatewayExperimentResult, ConstellationRequest, ConstellationSimulationResult } from '../api/types'

export interface OfflineRecords {
  analyses: Record<string, { request: AnalysisRequest; result: KYTAnalysisResult; transfers: NormalizedTransfer[] }>
  comparisonReviews: Record<string, { request: ComplianceRequest; result: ComplianceResponse }>
  compliance: { request: ComplianceRequest; result: ComplianceResponse }
  gateway: Record<string, { request: GatewayRequest; result: GatewayExperimentResult }>
  scenarios: { key: string; scenario: ConstellationRequest['scenario']; research: { result: ConstellationSimulationResult }; baseline: { result: ConstellationSimulationResult } }[]
}
export function readOfflineRecords(): OfflineRecords {
  const el = document.getElementById('offline-demo-data')
  if (!el) throw new Error('내장 JSON을 찾을 수 없습니다.')
  return JSON.parse(el.textContent ?? '') as OfflineRecords
}
