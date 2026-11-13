// A term stays as written, with a dotted underline; hover or keyboard focus explains it (design doc §7).
import * as Tooltip from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'
import type { GlossaryId } from '../i18n/copy'
import { useCopy } from '../i18n/hooks'

export function Term({ id, children }: { id: GlossaryId; children?: ReactNode }) {
  const copy = useCopy()
  const entry = copy.glossary(id)
  return (
    <Tooltip.Provider delayDuration={120}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button type="button" className="term">
            {children ?? entry.term}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="tip" side="top" sideOffset={6} collisionPadding={12}>
            <strong className="tip-term">{entry.term}</strong>
            <span>{entry.definition}</span>
            <Tooltip.Arrow className="tip-arrow" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}
