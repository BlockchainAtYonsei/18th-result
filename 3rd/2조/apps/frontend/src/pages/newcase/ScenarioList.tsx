import { useContext } from 'react'
import { MessagesContext } from '../../i18n/context'
import type { Action } from '../../api/types'
import { DecisionTag } from '../../components/StatusTag'
import { currentApiMode, scenariosFor } from '../../app/apiMode'
import { expectedDecision } from '../../contracts/catalog'
import { useT } from '../../i18n/hooks'
import { scenarioName } from './scenarioName'

/** Quick picks use a matching real or synthetic sender. Expected decisions exist only for synthetic fixtures. */
export function ScenarioList({ current, onPick }: { current: string | null; onPick: (fixtureId: string) => void }) {
  const t = useT()
  const messages = useContext(MessagesContext)
  return (
    <section className="scenarios" aria-labelledby="nc-scenarios">
      <h2 id="nc-scenarios">{t('ui.newcase.scenarios')}</h2>
      <p className="hint">{t('ui.newcase.expected')}</p>
      <div className="scenario-grid">
        {scenariosFor(currentApiMode())
          .filter((s) => s.fixtureId !== 'sender')
          .map((s) => {
            const expected = expectedDecision(s.fixtureId) as Action | undefined
            return (
              <button
                key={s.fixtureId}
                type="button"
                className={`scenario ${current === s.fixtureId ? 'on' : ''}`}
                aria-pressed={current === s.fixtureId}
                onClick={() => onPick(s.fixtureId)}
              >
                <span className="scenario-copy">
                  <span className="scenario-name">{scenarioName(s.fixtureId, messages)}</span>
                  <span className="caption t2">{t(s.provenance.dataType === 'ON_CHAIN' ? 'ui.newcase.recordedMainnet' : 'ui.data.SYNTHETIC')}</span>
                </span>
                {expected && <DecisionTag action={expected} />}
              </button>
            )
          })}
      </div>
    </section>
  )
}
