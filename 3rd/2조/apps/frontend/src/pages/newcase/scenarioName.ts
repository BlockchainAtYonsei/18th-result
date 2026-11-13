import type { Messages } from '../../i18n/en'
import { en } from '../../i18n/en'
import { lookup } from '../../i18n/hooks'

export function scenarioName(id: string, messages: Messages = en): string {
  return lookup(messages, `ui.scenario.${id}`) ?? id
}
