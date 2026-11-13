import { createContext } from 'react'
import type { Locale } from './locale'
import { en, type Messages } from './en'

// English is the default, so components work without a provider (tests, isolated renders).
export const MessagesContext = createContext<Messages>(en)

export const LocaleContext = createContext<{ locale: Locale; setLocale(locale: Locale): void }>({ locale: 'en', setLocale: () => {} })
