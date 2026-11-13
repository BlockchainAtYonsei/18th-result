import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { getIdentity } from './identity'

export function RequireIdentity({ children }: { children: ReactNode }) {
  if (!getIdentity()) return <Navigate to="/login" replace />
  return <>{children}</>
}
