// Left 300px step rail: numbered step list (done/current/locked/failed),
// a one-line description, and a single footer slot for the primary action
// (a plain button, a "waiting on wallet signature" panel, or a result
// banner). Port of gen.mjs's `rail()`, plus the live-run additions: an error
// banner, an account/meta line, and a clickable result action.
import type { RailFooterVM, RailTimerVM, StepVM } from './viewModel';

function CheckIcon() {
  return (
    <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round">
      <path d="M2.5 6.5l2.5 2.5 4.5-5" />
    </svg>
  );
}

const STATE_CLASS: Record<StepVM['state'], string> = {
  done: 'done',
  current: 'cur',
  locked: 'lock',
  failed: 'failed',
};

function RailStep({ step, index }: { step: StepVM; index: number }) {
  return (
    <div
      className={`rail-step ${STATE_CLASS[step.state]}`}
      data-testid="rail-step"
      data-step-id={step.id}
      data-state={step.state}
    >
      <span className="idx">{step.state === 'done' ? <CheckIcon /> : index}</span>
      <span>{step.label}</span>
      {step.badge && <span className={`pill p-${step.badge.tone} rail-step-badge`}>{step.badge.text}</span>}
    </div>
  );
}

/**
 * The ledger-time moments the run is waiting on. Roughly 80% of a run is spent in these
 * waits (`docs/decisions.md` D9), so the rail keeps them all on screen rather than
 * showing only the one countdown attached to the button.
 */
function RailTimers({ timers }: { timers: RailTimerVM[] }) {
  return (
    <div className="rail-timers" data-testid="rail-timers">
      <div className="lab">원장 시각</div>
      {timers.map((timer) => (
        <div
          key={timer.id}
          className={`rail-timer ${timer.state}`}
          data-testid="rail-timer"
          data-timer-id={timer.id}
          data-state={timer.state}
        >
          <span className="rail-timer-label">{timer.label}</span>
          <span className="mono rail-timer-value">
            {timer.remaining ?? '지남'}
          </span>
          <span className="mono rail-timer-at">{timer.at}</span>
        </div>
      ))}
    </div>
  );
}

function RailFooter({
  footer,
  onAction,
  onSecondary,
  onRecover,
}: {
  footer: RailFooterVM;
  onAction?: () => void;
  onSecondary?: () => void;
  onRecover?: () => void;
}) {
  if (footer.kind === 'action') {
    const className = ['btn', footer.state === 'disabled' ? 'off' : '', footer.state === 'busy' ? 'busy' : '']
      .filter(Boolean)
      .join(' ');
    return (
      <>
      <button
        type="button"
        className={className}
        disabled={footer.state !== 'enabled'}
        onClick={onAction}
        data-testid="action-button"
        data-state={footer.state}
      >
        {footer.state === 'busy' && <span className="spin" style={{ marginRight: 10 }} />}
        {footer.label}
        {footer.countdown && (
          <span
            className="mono"
            style={{ marginLeft: 8, ...(footer.urgent ? { color: '#FFD9D6', fontWeight: 700 } : {}) }}
            data-testid="countdown"
          >
            {footer.countdown}
          </span>
        )}
      </button>
        {footer.recover && (
          <>
            <div className="rail-desc" style={{ marginTop: 10 }}>{footer.recover.hint}</div>
            <button
              type="button"
              className="btn"
              style={{ marginTop: 8, background: '#9A6A12' }}
              onClick={onRecover}
              data-testid="recover-button"
            >
              {footer.recover.label}
            </button>
          </>
        )}
      </>
    );
  }
  if (footer.kind === 'signing') {
    return (
      <>
        <div className="signing-panel" data-testid="signing-panel">
          <span className="spin signing-spin" />
          <div className="signing-text">
            <b>{footer.title}</b>
            <br />
            {footer.message}
          </div>
        </div>
        <span className="btn busy">
          <span className="spin" style={{ marginRight: 10 }} />
          서명 대기 중…
        </span>
      </>
    );
  }
  return (
    <>
      <div className={`result-banner ${footer.tone}`} data-testid="result-banner" data-tone={footer.tone}>
        <div className="lab result-banner-lab">결과</div>
        <div className="result-banner-headline cond">{footer.headline}</div>
        <div className="result-banner-detail">{footer.detail}</div>
      </div>
      <button
        type="button"
        className="btn ghost result-secondary"
        onClick={onSecondary}
        data-testid="result-secondary"
      >
        {footer.secondaryLabel}
      </button>
    </>
  );
}

export interface StepRailProps {
  steps: StepVM[];
  description?: string;
  timers?: RailTimerVM[];
  footer: RailFooterVM;
  onAction?: () => void;
  onSecondary?: () => void;
  /** Alternative path for a failed step (e.g. re-create the vault after tecEXPIRED). */
  onRecover?: () => void;
  /** Last failure message, shown above the action so a retry has context. */
  error?: string | null;
  /** One-line account/signer summary. */
  meta?: string | null;
  label?: string;
}

export function StepRail({
  steps,
  description,
  timers,
  footer,
  onAction,
  onSecondary,
  onRecover,
  error,
  meta,
  label = '단계',
}: StepRailProps) {
  return (
    <div className="rail">
      <div className="lab rail-lab">{label}</div>
      {steps.map((s, i) => (
        <RailStep key={s.id} step={s} index={i + 1} />
      ))}
      {timers && timers.length > 0 && <RailTimers timers={timers} />}
      <div className="rail-spacer" />
      {meta && <div className="rail-meta">{meta}</div>}
      {error && (
        <div className="rail-error" data-testid="rail-error">
          {error}
        </div>
      )}
      {description && <div className="rail-desc">{description}</div>}
      <RailFooter footer={footer} onAction={onAction} onSecondary={onSecondary} onRecover={onRecover} />
    </div>
  );
}
