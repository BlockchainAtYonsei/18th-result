// A screen that throws (for example on data it cannot draw) shows a message instead of unmounting the whole app.
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useT } from '../i18n/hooks'

function CrashScreen({ error }: { error: Error }) {
  const t = useT()
  return (
    <main className="page">
      <div className="notice notice-error" role="alert">
        <strong>{t('ui.crash.title')}</strong>
        <span className="t2">{t('ui.crash.detail')}</span>
        <details className="caption muted"><summary>{t('ui.technicalDetails')}</summary>{error.message}</details>
        <div>
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            {t('ui.crash.reload')}
          </button>{' '}
          {/* a plain link out of the screen that failed; the reload on arrival clears this boundary */}
          <a href="#/" onClick={() => setTimeout(() => window.location.reload())}>
            {t('ui.crash.back')}
          </a>
        </div>
      </div>
    </main>
  )
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  render() {
    return this.state.error ? <CrashScreen error={this.state.error} /> : this.props.children
  }
}
