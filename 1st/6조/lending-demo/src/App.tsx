// App entry point.
//
// Two modes share one bundle:
//
//  - live (no query param): the real thing. `src/state/store.ts` drives the same
//    scenario engine the Node runner uses, against devnet, and `src/ui/mapping.ts`
//    turns its state into the view models the components already speak.
//  - `?screen=<key>`: the P1b dummy-data switch, unchanged, so every one of the 14
//    mockup screens can still be eyeballed without a devnet connection. See
//    `src/ui/dummy.ts` and `docs/screens.md`. The wallet-probe interstitial is gone
//    with the wallet path itself (`docs/decisions.md` D20).
import { useEffect, useMemo, type ReactNode } from 'react';
import {
  DUMMY_A6,
  DUMMY_A7,
  DUMMY_A8,
  DUMMY_B7,
  DUMMY_B8,
  DUMMY_B9,
  DUMMY_LANDING,
  DUMMY_STEP1,
  DUMMY_STEP2,
  DUMMY_STEP3_DEPOSIT,
  DUMMY_STEP3_SIGNING,
  DUMMY_STEP4,
  DUMMY_STEP5,
  DUMMY_STEP6,
} from './ui/dummy';
import { MainScreen } from './ui/MainScreen';
import { ParamEditor } from './ui/ParamEditor';
import { Landing } from './ui/screens/Landing';
import { toLandingVM, toMainScreenVM } from './ui/mapping';
import { shortAddress } from './ui/format';
import type { MainScreenVM } from './ui/viewModel';
import {
  connect,
  restartFromVaultCreate,
  resetAll,
  retrySetup,
  runCurrentStep,
  setParams,
  startScenario,
  useAppState,
} from './state/store';
import type { AppState } from './state/store';

// ---------------------------------------------------------------------------
// dummy-data screen switcher (P1b, unchanged behaviour)
// ---------------------------------------------------------------------------

const MAIN_SCREENS: Record<string, MainScreenVM> = {
  step1: DUMMY_STEP1,
  step2: DUMMY_STEP2,
  step3signing: DUMMY_STEP3_SIGNING,
  step3deposit: DUMMY_STEP3_DEPOSIT,
  step4: DUMMY_STEP4,
  step5: DUMMY_STEP5,
  step6: DUMMY_STEP6,
  b7: DUMMY_B7,
  b8: DUMMY_B8,
  b9: DUMMY_B9,
  a6: DUMMY_A6,
  a7: DUMMY_A7,
  a8: DUMMY_A8,
};

// Order matches docs/screens.md (0 → 6 → B-7..B-9 → A-6..A-8), with `live` first
// so the dummy switcher can hand control back to the real app.
const SCREEN_ORDER = [
  'live',
  'landing',
  'step1',
  'step2',
  'step3signing',
  'step3deposit',
  'step4',
  'step5',
  'step6',
  'b7',
  'b8',
  'b9',
  'a6',
  'a7',
  'a8',
];

function readScreenParam(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return new URLSearchParams(window.location.search).get('screen');
}

function ScreenSwitcher({ current }: { current: string }) {
  return (
    <div className="dev-switcher">
      {SCREEN_ORDER.map((screen) => (
        <a
          key={screen}
          href={screen === 'live' ? '?' : `?screen=${screen}`}
          className={screen === current ? 'active' : ''}
        >
          {screen}
        </a>
      ))}
    </div>
  );
}

function DummyApp({ screen }: { screen: string }) {
  let body: ReactNode;
  if (screen in MAIN_SCREENS) {
    body = <MainScreen vm={MAIN_SCREENS[screen]} />;
  } else {
    body = <Landing vm={DUMMY_LANDING} />;
  }
  return (
    <>
      <ScreenSwitcher current={screen} />
      {body}
    </>
  );
}

// ---------------------------------------------------------------------------
// live app
// ---------------------------------------------------------------------------

/** One line naming the three faucet accounts. All of them sign with a local keypair. */
function metaLine(state: AppState): string | null {
  if (!state.accounts) {
    return null;
  }
  const signer = state.depositor.kind ?? '미정';
  return (
    `예금자 ${shortAddress(state.accounts.depositor)} · ${signer}` +
    `${state.depositor.frozen ? ' · 동결' : ''} | ` +
    `Broker ${shortAddress(state.accounts.broker)} · ` +
    `Borrower ${shortAddress(state.accounts.borrower)} · ` +
    `faucet ${state.faucetCalls}회`
  );
}

function LiveApp() {
  const state = useAppState();

  // Connect up front so the landing screen shows a live ledger index, and so an
  // unreachable devnet is visible before the presenter clicks anything.
  useEffect(() => {
    connect();
  }, []);

  if (state.screen === 'landing') {
    return (
      <Landing
        vm={toLandingVM(state)}
        onStart={(index) => void startScenario(index === 0 ? 'A' : 'B')}
      >
        <ParamEditor params={state.params} onChange={setParams} />
      </Landing>
    );
  }

  return (
    <MainScreen
      vm={toMainScreenVM(state)}
      onReset={resetAll}
      onSecondary={resetAll}
      onRecover={() => restartFromVaultCreate()}
      error={state.error}
      meta={metaLine(state)}
      onAction={() => {
        if (state.setupState === 'failed') {
          void retrySetup();
          return;
        }
        void runCurrentStep();
      }}
    />
  );
}

function App() {
  const screen = useMemo(() => readScreenParam(), []);
  return screen === null ? <LiveApp /> : <DummyApp screen={screen} />;
}

export default App;
