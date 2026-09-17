// Row helpers shared by `KVGrid` and `RoleCards`. They live outside the component
// files so those stay component-only (React Fast Refresh requirement).
import type { DeltaDirection, KVRow, KVRowVM, ValueTone } from './viewModel';

export function valueClass(tone?: ValueTone): string {
  return tone && tone !== 'default' ? tone : '';
}

/** Accept either row form so existing `KVTuple` data keeps working untouched. */
export function normalizeRow(row: KVRow): KVRowVM {
  return Array.isArray(row) ? { k: row[0], v: row[1], tone: row[2] } : row;
}

/** `up` / `down` / `changed` double as the CSS class names. */
export function deltaClass(delta: DeltaDirection): string {
  return delta;
}

/** True once the row carries a diff worth flashing. */
export function rowChanged(row: KVRowVM): boolean {
  return row.isNew === true || (row.prev !== undefined && row.delta !== undefined);
}
