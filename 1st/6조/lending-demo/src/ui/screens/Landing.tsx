// Screen 0 · Landing: hero + two scenario cards (A 정상 렌딩 / B 부실 후
// default). Faithful port of gen.mjs's `Landing.dc.html`.
import { Fragment } from 'react';
import type { LandingVM, ScenarioCardVM } from '../viewModel';
import { TopBar } from '../TopBar';

function ScenarioCard({
  card,
  onStart,
  testId,
}: {
  card: ScenarioCardVM;
  onStart?: () => void;
  testId: string;
}) {
  return (
    <div className={`landing-card ${card.highlighted ? 'highlighted' : ''}`.trim()}>
      <div className="landing-card-head">
        <div className="landing-card-title cond">{card.title}</div>
        <span className={`pill p-${card.badge.tone}`}>{card.badge.text}</span>
      </div>
      <div className="landing-card-desc">{card.description}</div>
      <div className="kv">
        {card.rows.map(([k, v, tone], i) => (
          <Fragment key={i}>
            <span className="k">{k}</span>
            <span className={`v ${tone && tone !== 'default' ? tone : ''}`.trim()}>{v}</span>
          </Fragment>
        ))}
      </div>
      <div className="landing-card-spacer" />
      <button
        type="button"
        className={`btn landing-card-btn ${card.highlighted ? '' : 'ghost'}`.trim()}
        onClick={onStart}
        data-testid={testId}
      >
        {card.buttonLabel}
      </button>
    </div>
  );
}

export function Landing({
  vm,
  onStart,
  children,
}: {
  vm: LandingVM;
  onStart?: (index: 0 | 1) => void;
  /** Slot under the cards. The live app puts the `ParamEditor` here. */
  children?: React.ReactNode;
}) {
  return (
    <div className="app-frame" data-testid="screen-landing">
      <TopBar vm={{ scenarioLabel: '선택 전', ledgerIndex: vm.ledgerIndex }} />
      <div className="landing-body">
        <div className="landing-hero">
          <div className="lab">{vm.kicker}</div>
          <div className="landing-heading cond">{vm.heading}</div>
          <div className="landing-sub">{vm.subheading}</div>
        </div>
        <div className="landing-cards">
          <ScenarioCard card={vm.cards[0]} onStart={() => onStart?.(0)} testId="start-scenario-a" />
          <ScenarioCard card={vm.cards[1]} onStart={() => onStart?.(1)} testId="start-scenario-b" />
        </div>
        {children}
        <div className="landing-footnote">{vm.footnote}</div>
      </div>
    </div>
  );
}
