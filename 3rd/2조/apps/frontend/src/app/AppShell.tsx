import { NavLink, Outlet } from 'react-router'
import { LanguageSelect } from '../i18n/LanguageSelect'
import { useCases } from '../cases/useCases'
import { useT } from '../i18n/hooks'
import { backendLabel, currentApiMode } from './apiMode'
import { getIdentity } from './identity'
import { SettingsMenu } from './SettingsMenu'
import { WordmarkGlyph } from './Wordmark'

export function AppShell() {
  const t = useT()
  const { storageError, saving, ready, retrySave, reload } = useCases()
  const identity = getIdentity()
  const mode = currentApiMode()
  return (
    <>
      <header className="topbar">
        <NavLink to="/" className="wordmark">
          <WordmarkGlyph />
          {t('ui.brand')}
        </NavLink>
        <nav className="topnav" aria-label={t('ui.nav.main')}>
          <NavLink to="/" end>
            {t('ui.nav.cases')}
          </NavLink>
        </nav>
        <div className="topbar-side">
          <span className={`mode mode-${mode}`} title={mode === 'backend' ? backendLabel() : undefined}>
            <i aria-hidden="true" />
            {mode === 'mock' ? t('ui.settings.modeMock') : `${t('ui.settings.modeBackend')} · ${backendLabel()}`}
          </span>
          <span className="t2 who">{identity?.name}</span>
          <LanguageSelect />
          <SettingsMenu />
        </div>
      </header>
      {storageError && <section className="notice notice-warn" role="alert">
        <p>{t(ready ? 'ui.storage.writeFailed' : 'ui.storage.loadFailed')}</p>
        <details className="caption"><summary>{t('ui.technicalDetails')}</summary>{storageError}</details>
        {ready && <button type="button" className="btn" disabled={saving} onClick={() => void retrySave().catch(() => {})}>{t('ui.storage.retry')}</button>}
        <button type="button" className="btn" disabled={saving} onClick={() => void reload()}>{t(ready ? 'ui.storage.discardReload' : 'ui.storage.reload')}</button>
      </section>}
      {!ready && !storageError && <p className="caption" role="status">{t('ui.storage.loading')}</p>}
      {saving && <p className="caption" role="status">{t('ui.storage.saving')}</p>}
      <Outlet />
    </>
  )
}
