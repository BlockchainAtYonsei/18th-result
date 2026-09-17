// The shared `.kv` two-column grid, plus the "이전 값 → 현재 값" diff rendering that
// both the ledger panel and the stage role cards use.
//
// A row that did not move is a plain `KVTuple` and renders exactly as before. A row
// that moved in the step that just validated carries `prev` + `delta`, and is drawn as
// a muted previous value, an arrow, and the new value coloured by direction: green up,
// red down, amber for anything with no order (flags, dates). A field whose object did
// not exist in the previous snapshot has no previous value to show, so it gets a small
// NEW pill instead of an arrow.
import { Fragment } from 'react';
import { deltaClass, normalizeRow, rowChanged, valueClass } from './kvRow';
import type { KVRow, KVRowVM } from './viewModel';

function Value({ row, changed }: { row: KVRowVM; changed: boolean }) {
  const flash = changed ? ' flash' : '';

  if (row.isNew) {
    return (
      <span
        className={`v diff-v${flash}`}
        data-testid="kv-value"
        data-delta="new"
      >
        <span className="diff-next up">{row.v}</span>
        <span className="pill p-good diff-new-pill">NEW</span>
      </span>
    );
  }

  if (row.prev === undefined || row.delta === undefined) {
    return (
      <span className={`v ${valueClass(row.tone)}`.trim()} data-testid="kv-value">
        {row.v}
      </span>
    );
  }

  return (
    <span
      className={`v diff-v${flash}`}
      data-testid="kv-value"
      data-delta={row.delta}
      data-prev={row.prev}
    >
      <span className="diff-prev">{row.prev}</span>
      <span className="diff-arrow" aria-hidden="true">
        →
      </span>
      <span className={`diff-next ${deltaClass(row.delta)}`}>{row.v}</span>
    </span>
  );
}

export function KVGrid({ rows }: { rows: KVRow[] }) {
  return (
    <div className="kv">
      {rows.map((raw, i) => {
        const row = normalizeRow(raw);
        const changed = rowChanged(row);
        // Keyed on the previous value as well as the index: when the diff pair moves to
        // the next step the spans remount, which is what restarts the flash animation.
        // Without it React would reuse the element and the highlight would never replay.
        const key = `${i}:${row.prev ?? ''}:${row.isNew ? 'new' : ''}`;
        return (
          <Fragment key={key}>
            <span
              className={`k${changed ? ' flash' : ''}`}
              data-testid="kv-key"
              data-k={row.k}
              // Stage cards are 190px wide and ellipsize long field names; the tooltip
              // is the only way back to the full one without leaving the card.
              title={row.k}
            >
              {row.k}
            </span>
            <Value row={row} changed={changed} />
          </Fragment>
        );
      })}
    </div>
  );
}
