// The run animation plays once, for results that were just produced. Results that were already saved
// (reopening the dialog, switching tabs) are shown at once, as the design asks.
import { useEffect, useState } from 'react'

const fresh = new Set<string>()

/** Call when a simulation has just returned; `key` is the record (or first record) it produced. */
export function markFresh(key: string): void {
  fresh.add(key)
}

/** True on the first mount after `markFresh(key)`, false ever after. */
export function useFresh(key: string | undefined): boolean {
  const [was] = useState(() => key !== undefined && fresh.has(key))
  useEffect(() => {
    if (key !== undefined) fresh.delete(key)
  }, [key])
  return was
}
