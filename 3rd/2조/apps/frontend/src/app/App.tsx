import { HashRouter, Navigate, Route, Routes } from 'react-router'
import { CasesProvider } from '../cases/CasesProvider'
import { CasePage } from '../pages/CasePage'
import { DashboardPage } from '../pages/DashboardPage'
import { LoginPage } from '../pages/LoginPage'
import { NewCasePage } from '../pages/NewCasePage'
import { AppShell } from './AppShell'
import { ErrorBoundary } from './ErrorBoundary'
import { RequireIdentity } from './RequireIdentity'

export function App() {
  return (
    <CasesProvider>
      <ErrorBoundary>
        <HashRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <RequireIdentity>
                  <AppShell />
                </RequireIdentity>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="cases/new" element={<NewCasePage />} />
              <Route path="cases/:caseId" element={<CasePage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      </ErrorBoundary>
    </CasesProvider>
  )
}
