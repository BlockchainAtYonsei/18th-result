import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { LocaleContext, MessagesContext } from './context'
import { en, type Messages } from './en'
import { ko } from './ko'
import { initialLocale, LOCALE_KEY, type Locale } from './locale'

export function I18nProvider({ messages, locale: startingLocale, children }: { messages?: Messages; locale?: Locale; children: ReactNode }) {
  const [locale, updateLocale] = useState<Locale>(() => startingLocale ?? initialLocale())
  const setLocale = useCallback((next: Locale) => {
    updateLocale(next)
    try { localStorage.setItem(LOCALE_KEY, next) } catch { /* Switching still works without persistence. */ }
  }, [])
  useEffect(() => {
    const previous = document.documentElement.lang
    document.documentElement.lang = locale
    return () => { document.documentElement.lang = previous }
  }, [locale])
  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale])
  return (
    <LocaleContext.Provider value={value}>
      <MessagesContext.Provider value={messages ?? (locale === 'ko' ? ko : en)}>{children}</MessagesContext.Provider>
    </LocaleContext.Provider>
  )
}
