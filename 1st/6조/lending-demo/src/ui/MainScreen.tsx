// The shared 4-region app shell used by the 11 non-Landing mockup screens
// (계정 준비 ... A-8 결과): TopBar + StepRail + FlowStage +
// LedgerPanel in a row, with TxLog fixed to the bottom. Mirrors gen.mjs's
// `screen()` assembly helper.
import type { MainScreenVM } from './viewModel';
import { TopBar } from './TopBar';
import { StepRail } from './StepRail';
import { LedgerPanel } from './LedgerPanel';
import { TxLog } from './TxLog';
import { FlowStage } from './stage/FlowStage';

export interface MainScreenProps {
  vm: MainScreenVM;
  onReset?: () => void;
  onAction?: () => void;
  /** Result-banner secondary action. Defaults to the same handler as reset. */
  onSecondary?: () => void;
  onRecover?: () => void;
  error?: string | null;
  meta?: string | null;
}

export function MainScreen({ vm, onReset, onAction, onSecondary, onRecover, error, meta }: MainScreenProps) {
  return (
    <div className="app-frame" data-testid="screen-main">
      <TopBar vm={vm.topBar} onReset={onReset} />
      <div className="app-body">
        <StepRail
          steps={vm.steps}
          description={vm.railDescription}
          timers={vm.railTimers}
          footer={vm.railFooter}
          onAction={onAction}
          onSecondary={onSecondary ?? onReset}
          onRecover={onRecover}
          error={error}
          meta={meta}
        />
        <FlowStage vm={vm.stage} />
        <LedgerPanel sections={vm.ledgerSections} />
      </div>
      <TxLog rows={vm.txRows} />
    </div>
  );
}
