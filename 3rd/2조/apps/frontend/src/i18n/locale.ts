export type Locale = 'en' | 'ko'
export const LOCALE_KEY = 'scl.locale.v1'

export function resolveLocale(saved: string | null, languages: readonly string[]): Locale {
  if (saved === 'en' || saved === 'ko') return saved
  // Prefer the first supported browser language, including regional variants.
  for (const language of languages) {
    const code = language.toLowerCase().split('-')[0]
    if (code === 'ko' || code === 'en') return code
  }
  return 'en'
}

export function initialLocale(): Locale {
  let saved: string | null = null
  try { saved = localStorage.getItem(LOCALE_KEY) } catch { /* Browser storage can be unavailable. */ }
  return resolveLocale(saved, typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language])
}
