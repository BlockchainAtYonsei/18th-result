import { useLayoutEffect, useState } from 'react'
import { TransferRows } from '../pages/case/WhyChain'
import { ResultCard } from '../pages/case/simulation/NetworkResult'
import { useCopy } from '../i18n/hooks'
import { formatUtc } from '../lib/format'
import type { OfflineRecords } from './records'

type CaseKey = 'sender' | 'pattern' | 'recipient'
export type DemoStage = 'analysis' | 'gateway' | 'network'
type View = 'result' | 'evidence' | 'gateway' | 'network'
const CASES: { key: CaseKey; name: string; description: string }[] = [
  { key: 'sender', name: '정상 기준', description: '위험 신호 없는 비교 지갑' },
  { key: 'pattern', name: '분산 송금', description: '짧은 시간에 여러 수신자로 전송' },
  { key: 'recipient', name: '제재 주소 일치', description: '제재 목록과 주소 직접 일치' },
]
const VIEWS: { key: View; name: string }[] = [{ key: 'result', name: '탐지 결과' }, { key: 'evidence', name: '거래 근거' }, { key: 'gateway', name: '제출 경로' }, { key: 'network', name: 'Constellation' }]
const SCENARIOS: Record<string, string> = { no_path: '전원 거절', below: '39.99% · 포함 기준 미달', boundary: '40% · 포함 의무', fifty: '50% · 포함 의무', skipped: '59.99% · 전체 참여 미달' }

/** Presentation controls select recorded results; the display never runs risk or protocol rules. */
export function DemoWorkbench({ records, stage = 'analysis' }: { records: OfflineRecords; stage?: DemoStage }) {
  const copy = useCopy()
  const [selected, setSelected] = useState<CaseKey>(stage === 'analysis' ? 'pattern' : 'recipient')
  const [view, setView] = useState<View>(stage === 'analysis' ? 'result' : stage)
  const [opened, setOpened] = useState(stage !== 'analysis')
  const [scenarioKey, setScenarioKey] = useState('boundary')
  const [routeKey, setRouteKey] = useState('enforced')
  const [allEvidence, setAllEvidence] = useState(false)
  const analysis = records.analyses[selected]
  const review = selected === 'recipient' ? records.compliance : records.comparisonReviews[selected]
  const result = analysis.result
  const decision = review.result.decision
  const evaluation = result.evaluation!
  const coverage = result.coverage!
  const evidences = evaluation.evidences
  const ids = new Set(evidences.flatMap(e => e.transferIds))
  const transfers = analysis.transfers.filter(t => ids.has(t.id)).sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? '') || a.id.localeCompare(b.id))
  const scenario = records.scenarios.find(s => s.key === scenarioKey)!
  const route = records.gateway[routeKey]
  useLayoutEffect(() => { document.documentElement.scrollTop = 0; document.body.scrollTop = 0 }, [selected, view, opened])
  const views = VIEWS.filter(v => stage === 'analysis' ? ['result','evidence'].includes(v.key) : v.key === stage)
  const reset = () => { setSelected(stage === 'analysis' ? 'pattern' : 'recipient'); setView(stage === 'analysis' ? 'result' : stage); setOpened(stage !== 'analysis'); setAllEvidence(false); setRouteKey('enforced'); setScenarioKey('boundary') }
  const choose = (key: CaseKey) => { setSelected(key); setView('result'); setOpened(false); setAllEvidence(false); setRouteKey('enforced'); setScenarioKey('boundary') }
  const tab = (key: View) => { setOpened(true); setView(key) }

  return <main className="demo-workbench">
    <div className="demo-chrome"><header className="demo-header"><strong>{stage === 'analysis' ? 'KYT 분석실' : stage === 'gateway' ? '제출 경로 비교' : '거래 포함 조건 비교'}</strong><span>{stage === 'analysis' ? '메인넷 저장 기록' : '동일 BLOCK 요청 · 저장된 실험 결과'} · 오프라인 시연</span><button className="btn" onClick={reset}>시연 처음으로</button></header>
    {stage === 'analysis' && <div className="demo-cases demo-analysis-cases" role="group" aria-label="시연 사례">
      {CASES.filter(c => c.key !== 'recipient').map(c => <button key={c.key} aria-pressed={selected === c.key} onClick={() => choose(c.key)}><strong>{c.name}</strong></button>)}
    </div>}
    <div className="demo-fixed">{stage !== 'analysis' && <><span>동일 BLOCK 요청 <strong>1 SOL</strong></span><span>정책 <strong>{decision.policyVersion}</strong></span></>}{stage === 'analysis' && <span>데이터 <strong>{coverage.transactionCount}거래 · {coverage.transferCount}전송</strong></span>}</div>
    {stage === 'analysis' && <nav className="demo-tabs" role="tablist" aria-label="데모 보기" onKeyDown={event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return
      event.preventDefault()
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? views.length - 1 : (views.findIndex(v => v.key === view) + (event.key === 'ArrowRight' ? 1 : -1) + views.length) % views.length
      tab(views[index].key)
      event.currentTarget.querySelectorAll('button')[index].focus()
    }}>{views.map(v => <button key={v.key} role="tab" tabIndex={view === v.key ? 0 : -1} id={'tab-'+v.key} aria-selected={view === v.key} aria-controls="demo-panel" onClick={() => tab(v.key)}>{v.name}</button>)}</nav>}</div>
    <section id="demo-panel" role="tabpanel" aria-labelledby={'tab-'+view} key={selected+view}>
      {view === 'result' && !opened && <div className="demo-launch">
        <div><p>선택한 사례</p><h1>{CASES.find(c => c.key === selected)!.name}</h1><p>저장된 온체인 기록에서 위험 신호와 근거를 확인합니다.</p></div>
        <button className="btn btn-primary" onClick={() => setOpened(true)}>분석 결과 열기</button>
        <p className="demo-disclosure">HTML에 저장된 KYT 분석 결과를 불러옵니다. 새 수집이나 재계산은 하지 않습니다.</p>
      </div>}
      {view === 'result' && opened && <div className={'demo-verdict tone-'+(evaluation.riskLevel === 'MEDIUM' ? 'warn' : 'allow')}>
        <div className="demo-score"><span>위험도</span><strong>{evaluation.riskScore}</strong><span>{evaluation.riskLevel} · 규칙 기반 점수</span></div>
        <div className="demo-verdict-copy"><span className="demo-action">KYT 탐지 결과</span><h1>{selected === 'pattern' ? '단시간 분산 송금 신호' : '정의된 위험 신호 없음'}</h1><p>{evaluation.detectedRules.length ? evaluation.detectedRules.map(r => copy.rule(r.ruleId).title).join(' · ') : '이번 조회 범위에서 정의된 위험 신호가 탐지되지 않았습니다.'}</p>
          <div className="demo-actions"><button className="btn btn-primary" onClick={() => tab('evidence')}>판단 근거 확인</button></div>
        </div>
      </div>}
      {view === 'evidence' && <div className="demo-evidence">
        <h2>판단에 사용한 근거</h2>
        {selected === 'sender' && <p className="demo-reading">탐지된 규칙이 없습니다. 정상 확정이나 불법성 판단을 뜻하지 않습니다.</p>}
        {selected === 'recipient' && <><p className="demo-reading">분석 주소 자체가 OFAC SDN 레이블과 일치합니다.</p><p>조회 범위의 자금 전송은 0건입니다. 실제 불법 송금을 탐지한 사례가 아닙니다.</p></>}
        {selected === 'pattern' && <><p className="demo-reading">앞선 네 전송은 111초 안에 서로 다른 수신자에게 이어집니다.</p><p>전체 근거 {transfers.length}건은 여러 유효 시간 창의 합집합입니다.</p><TransferRows transfers={allEvidence ? transfers : transfers.slice(0, 4)} provenance={result.dataProvenance} /><button className="btn" onClick={() => setAllEvidence(v => !v)}>{allEvidence ? '앞선 4건만 보기' : `전체 근거 ${transfers.length}건 펼치기`}</button></>}
        <details className="demo-source"><summary>수집 범위와 원본 근거</summary><p>{formatUtc(coverage.fromTime)} ~ {formatUtc(coverage.toTime)} 직전 · {coverage.status}</p><p className="demo-address">{result.address}</p>{evidences.map(e => <div key={e.evidenceId}><strong>{e.type}</strong><pre>{JSON.stringify(e, null, 2)}</pre></div>)}</details>
      </div>}
      {view === 'gateway' && selected === 'recipient' && <div className="demo-control">
        <h2>같은 BLOCK 요청의 두 제출 경로</h2><div className="demo-options" role="group" aria-label="제출 경로">{Object.entries(records.gateway).map(([key, g]) => <button key={key} aria-pressed={routeKey === key} onClick={() => setRouteKey(key)}>{g.request.route.policyEnforced ? '정책 적용 경로' : '정책 미적용 경로'}</button>)}</div>
        <div className={'demo-route '+(route.result.policyApplied ? 'route-blocked' : 'route-open')} key={routeKey}><span>가상 송금</span><i/><span>{route.result.policyApplied ? '정책 적용 · BLOCK' : '다른 제출 경로'}</span><i/><strong>{copy.gatewayOutcomeShort(route.result.outcome)}</strong></div>
        <p className="demo-reading">{route.result.reasonCodes.map(c => copy.gatewayReason(c)).join(' ')}</p><p>저장된 Gateway 결과입니다. 실제 거래는 전송하지 않습니다.</p><p className="demo-next-question">다른 경로로 들어온 요청은 블록 구성 단계에서도 제외할 수 있을까?</p>
      </div>}
      {view === 'network' && selected === 'recipient' && <div className="demo-network"><div className="demo-options" role="group" aria-label="저장된 실험 조건">{records.scenarios.map(s => <button key={s.key} aria-pressed={scenarioKey === s.key} onClick={() => setScenarioKey(s.key)}>{SCENARIOS[s.key]}</button>)}</div><p>묶음 증명률 {scenario.scenario.attestationPercent}% · 전체 참여율 {scenario.scenario.attesterParticipationPercent}% · 제안자 {scenario.scenario.proposerCount}명 중 {scenario.scenario.rejectingProposerCount}명 거절</p><div className="demo-models" key={scenarioKey}>{[scenario.research.result, scenario.baseline.result].map(r => <ResultCard key={r.protocolModelVersion} animated={false} rec={{ key: scenarioKey+r.protocolModelVersion, at: records.compliance.result.intent.requestedAt, batch: scenarioKey, purpose: 'compare', version: r.protocolModelVersion, scenario: scenario.scenario, result: r, error: null }} />)}</div></div>}
    </section>
    <footer className="demo-foot">{stage === 'analysis' ? '위험 신호를 확인했습니다. 다음은 이 신호에 어떤 조치를 취할지 결정하는 단계입니다.' : stage === 'gateway' ? '서비스의 제출 중단과 네트워크 전체의 거래 차단은 다릅니다.' : '서비스 대응과 네트워크 포함 조건의 경계를 비교한 오프체인 기록입니다.'}</footer>
  </main>
}
