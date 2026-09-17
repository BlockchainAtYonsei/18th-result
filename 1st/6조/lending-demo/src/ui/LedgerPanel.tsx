// Right 320px "원장 상태" (ledger state) panel: one section per on-ledger
// object (Vault / LoanBroker / Loan) plus the three role XRP balances, showing
// raw fields as read from `ledger_entry` / `account_info`. Faithful port of
// gen.mjs's `ledgerPanel()` + `section()`, with the value-diff rendering added
// by `KVGrid`.
import { KVGrid } from './KVGrid';
import type { LedgerSectionVM } from './viewModel';

function Section({ section }: { section: LedgerSectionVM }) {
  return (
    <div data-testid="ledger-section" data-title={section.title}>
      <div className={`ledger-section-title ${section.dim ? 'dim' : ''}`.trim()}>
        {section.title}
      </div>
      <KVGrid rows={section.rows} />
    </div>
  );
}

export function LedgerPanel({ sections }: { sections: LedgerSectionVM[] }) {
  return (
    <div className="ledger-panel">
      <div className="ledger-panel-head">
        <div className="lab">원장 상태</div>
        <span className="ledger-panel-subtitle">devnet에서 읽은 값</span>
      </div>
      {sections.map((s, i) => (
        <Section key={i} section={s} />
      ))}
    </div>
  );
}
