// A small XRP chip that travels along one of the fund-flow paths using the
// CSS `offset-path` motion-path feature. Rendering is entirely optional —
// screens with no active transfer simply omit the `chip` prop.
import type { ChipVM } from '../viewModel';
import { FLOW_PATHS } from './flowPaths';

function IcoXrp() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M3 3l3.2 3.2a2.5 2.5 0 0 0 3.6 0L13 3M3 13l3.2-3.2a2.5 2.5 0 0 1 3.6 0L13 13" />
    </svg>
  );
}

const TONE_CLASS: Record<ChipVM['tone'], string> = {
  default: '',
  crit: 'crit',
  good: 'good',
  wallet: 'wallet',
};

export function Chip({ chip }: { chip?: ChipVM }) {
  if (!chip) return null;
  const d = FLOW_PATHS[chip.pathId];
  const className = ['chip', TONE_CLASS[chip.tone]].filter(Boolean).join(' ');
  return (
    <div
      className={className}
      style={{
        offsetPath: `path('${d}')`,
        animationDuration: chip.durationMs ? `${chip.durationMs}ms` : undefined,
      }}
    >
      <IcoXrp />
      {chip.text}
    </div>
  );
}
