// Bottom transaction log: one row per submitted tx (index, type, truncated hash,
// result pill, explorer link, raw-payload disclosure) plus note rows for engine
// diagnostics and `expect` violations. Extends gen.mjs's `log()` with the parts
// only real data needs: a working explorer href and the raw rippled payload.
import { useState } from 'react';
import type { PillTone, TxRowVM } from './viewModel';

function LinkIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <path d="M6 10l4-4M9 3h4v4M7 3H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9" />
    </svg>
  );
}

const LEVEL_TONE: Record<'info' | 'warn' | 'error', PillTone> = {
  info: 'none',
  warn: 'warn',
  error: 'crit',
};

const LEVEL_TEXT: Record<'info' | 'warn' | 'error', string> = {
  info: 'note',
  warn: 'warn',
  error: 'error',
};

function RawBlock({ raw }: { raw: unknown }) {
  const [open, setOpen] = useState(false);
  let text: string;
  try {
    text = JSON.stringify(raw, null, 2) ?? String(raw);
  } catch {
    text = String(raw);
  }
  return (
    <>
      <button type="button" className="txlog-raw-toggle" onClick={() => setOpen(!open)}>
        {open ? 'raw ▾' : 'raw ▸'}
      </button>
      {open && <pre className="txlog-raw mono">{text}</pre>}
    </>
  );
}

/** A submitted transaction: numbered, hashed, with a result pill. */
function TxRow({ row }: { row: TxRowVM }) {
  return (
    <div className="log-entry">
      <div className="log-row" data-testid="txlog-row" data-result={row.result}>
        <span className="mono txlog-n">{row.n}</span>
        <span>{row.txType}</span>
        <span className="mono txlog-hash" title={row.hash}>
          {row.hash}
        </span>
        <span className={`pill p-${row.resultTone}`}>{row.result}</span>
        <span className="txlog-actions">
          {row.explorerUrl ? (
            <a className="txlog-explorer" href={row.explorerUrl} target="_blank" rel="noreferrer">
              explorer <LinkIcon />
            </a>
          ) : (
            <span className={`txlog-explorer ${row.explorerAvailable ? '' : 'dim'}`.trim()}>
              explorer <LinkIcon />
            </span>
          )}
          {row.raw !== undefined && row.raw !== null && <RawBlock raw={row.raw} />}
        </span>
      </div>
    </div>
  );
}

/** An engine note, an `expect` violation, or a failure - no transaction of its own. */
function NoteRow({ row }: { row: TxRowVM }) {
  const level = row.level ?? 'info';
  return (
    <div className={`log-note ${level}`} data-testid="txlog-note" data-level={level}>
      <span className={`pill p-${LEVEL_TONE[level]}`}>{LEVEL_TEXT[level]}</span>
      <span className="log-note-type">{row.txType}</span>
      <span className="log-note-message">{row.message ?? row.result}</span>
    </div>
  );
}

export function TxLog({ rows }: { rows: TxRowVM[] }) {
  return (
    <div className="txlog">
      <div className="lab txlog-lab">트랜잭션 로그</div>
      {rows.length === 0 ? (
        <div className="txlog-empty">아직 제출한 트랜잭션이 없습니다.</div>
      ) : (
        rows.map((row, i) =>
          row.n === '·' ? (
            <NoteRow key={row.key ?? i} row={row} />
          ) : (
            <TxRow key={row.key ?? i} row={row} />
          ),
        )
      )}
    </div>
  );
}
