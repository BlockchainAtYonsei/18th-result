import { useContext, useMemo } from 'react'
import { LocaleContext, MessagesContext } from './context'
import { createCopy, fill, type Copy } from './copy'
import type { Messages } from './en'

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>
}[keyof T & string]
export type MessageKey = Leaves<Messages>
export type TFunction = (key: MessageKey, params?: Record<string, string | number>) => string

export function lookup(messages: Messages, key: string): string | undefined {
  let node: unknown = messages
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object' || !Object.hasOwn(node, part)) return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string' ? node : undefined
}

export function useT(): TFunction {
  const messages = useContext(MessagesContext)
  return useMemo<TFunction>(() => (key, params) => fill(lookup(messages, key) ?? key, params ?? {}), [messages])
}

export function useCopy(): Copy {
  const messages = useContext(MessagesContext)
  return useMemo(() => createCopy(messages), [messages])
}

export function useLocale() { return useContext(LocaleContext) }
