import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nProvider } from './i18n/I18nProvider'
import { App } from './app/App'
import { currentApiMode } from './app/apiMode'
import './styles/tokens.css'
import './styles/base.css'
import './components/components.css'
import './pages/pages.css'

async function enableMocking() {
  if (currentApiMode() !== 'mock') return
  const { worker } = await import('./mocks/browser')
  // Intercept /api only; everything else (static files, fonts) passes through.
  // The worker file sits under the app's base path (VITE_BASE_PATH), not always at the site root.
  await worker.start({ serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` }, onUnhandledFrame: 'bypass', quiet: true })
}

// Render even if the Mock worker fails: the screens then show the request errors instead of a blank page.
void enableMocking()
  .catch((e: unknown) => console.error(e))
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <I18nProvider><App /></I18nProvider>
      </StrictMode>,
    )
  })
