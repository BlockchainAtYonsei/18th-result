// Fixed 56px top bar: app title, devnet status dot + ledger index, active
// scenario label, and a "처음부터" (start over) ghost button.
import type { TopBarVM } from './viewModel';

export function TopBar({ vm, onReset }: { vm: TopBarVM; onReset?: () => void }) {
  return (
    <div className="topbar">
      <div className="topbar-left">
        <div className="topbar-title cond">XLS-66 Vault Demo</div>
        <div className="topbar-network">
          <span className="dot" />
          <span>{vm.network ?? 'devnet'}</span>
          <span className="mono">ledger {vm.ledgerIndex}</span>
        </div>
      </div>
      <div className="topbar-right">
        <span className="topbar-scenario-label">시나리오</span>
        <span className="topbar-scenario-value">{vm.scenarioLabel}</span>
        <button type="button" className="btn ghost" onClick={onReset}>
          처음부터
        </button>
      </div>
    </div>
  );
}
