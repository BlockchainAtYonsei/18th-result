import { useLocale, useT } from './hooks'
import type { Locale } from './locale'

/** Available before sign-in as well as in the app. Switching does not reload or stop a run. */
export function LanguageSelect() {
  const t = useT()
  const { locale, setLocale } = useLocale()
  return (
    <select className="input language-select" aria-label={t('ui.language')} value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
      <option value="ko" lang="ko">한국어</option>
      <option value="en" lang="en">English</option>
    </select>
  )
}
