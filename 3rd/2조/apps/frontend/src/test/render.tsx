// Test helper: render a page with the case store and a router, the way the app wires them.
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import type { ApiClient } from '../api/client'
import { ApiContext } from '../app/apiContext'
import { CasesProvider } from '../cases/CasesProvider'
import type { CaseRecord } from '../cases/model'
import { createMemoryCaseStore, type CaseStore } from '../cases/store'

function LocationProbe() {
  const loc = useLocation()
  return <span data-testid="location">{loc.pathname}</span>
}

export function renderPage(
  element: ReactElement,
  { path = '/', at = '/', seed = [], store, api }: { path?: string; at?: string; seed?: CaseRecord[]; store?: CaseStore; api?: ApiClient } = {},
) {
  const caseStore = store ?? createMemoryCaseStore(seed)
  const tree = (
    <CasesProvider store={caseStore}>
      <MemoryRouter initialEntries={[at]}>
        <Routes>
          <Route path={path} element={element} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </CasesProvider>
  )
  const utils = render(api ? <ApiContext.Provider value={api}>{tree}</ApiContext.Provider> : tree)
  return { ...utils, store: caseStore }
}
