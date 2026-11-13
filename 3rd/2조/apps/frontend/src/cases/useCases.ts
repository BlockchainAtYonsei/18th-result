import { useContext } from 'react'
import { CasesContext, type CasesValue } from './context'

export function useCases(): CasesValue {
  const v = useContext(CasesContext)
  if (!v) throw new Error('CasesProvider is missing')
  return v
}
