// Settings: switch Mock/Backend (reloads), move cases between browsers, sign out (design doc §9).
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import type { ImportErrorCode } from '../cases/transfer'
import { useCases } from '../cases/useCases'
import { useT } from '../i18n/hooks'
import { currentApiMode, getModeOverride, setModeOverride, type ApiMode } from './apiMode'
import { getIdentity, signOut } from './identity'

function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result ?? ''))
    r.onerror = () => reject(r.error)
    r.readAsText(file)
  })
}

export function SettingsMenu({
  onReload = () => window.location.reload(),
  onDownload = downloadText,
}: {
  onReload?: () => void
  onDownload?: (name: string, text: string) => void
}) {
  const t = useT()
  const navigate = useNavigate()
  const { exportText, importText, ready, saving } = useCases()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState<{ added: number } | { error: string; code?: ImportErrorCode } | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  const mode = currentApiMode()
  const override = getModeOverride()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onClick = (e: MouseEvent) => panel.current && !panel.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  const switchTo = (m: ApiMode | null) => {
    setModeOverride(m)
    onReload()
  }

  return (
    <div className="settings" ref={panel}>
      <button type="button" className="btn btn-text settings-btn" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((v) => !v)}>
        {t('ui.settings.open')}
      </button>
      {open && (
        <div className="settings-panel" role="region" aria-label={t('ui.settings.open')}>
          <p className="caption t2">{t('ui.settings.signedInAs', { name: getIdentity()?.name ?? '' })}</p>
          <div className="settings-group">
            <span className="caption muted">{t('ui.settings.source')}</span>
            {mode === 'backend' ? (
              <button type="button" className="btn" onClick={() => switchTo('mock')}>
                {t('ui.settings.useMock')}
              </button>
            ) : (
              <button type="button" className="btn" onClick={() => switchTo('backend')}>
                {t('ui.settings.useBackend')}
              </button>
            )}
            {override && (
              <button type="button" className="btn btn-text" onClick={() => switchTo(null)}>
                {t('ui.settings.resetMode')}
              </button>
            )}
            <span className="caption muted">{t('ui.settings.reloadNote')}</span>
          </div>
          <div className="settings-group">
            <span className="caption muted">{t('ui.settings.cases')}</span>
            <button type="button" className="btn" onClick={() => onDownload(`scl-cases-${new Date().toISOString().slice(0, 10)}.json`, exportText())}>
              {t('ui.settings.export')}
            </button>
            <label className="btn file-btn">
              {t('ui.settings.import')}
              <input
                type="file"
                disabled={!ready || saving}
                accept="application/json,.json"
                aria-label={t('ui.settings.import')}
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (!file) return
                  try { setMessage(await importText(await readText(file))) }
                  catch (e) { setMessage({ error: String(e), code: 'READ_FAILED' }) }
                }}
              />
            </label>
            {message && (
              <div className="caption t2" role="status">
                {'error' in message ? t(`ui.importError.${message.code ?? 'SAVE_FAILED'}`) : t('ui.settings.imported', { n: message.added })}
                {'error' in message && message.error !== t(`ui.importError.${message.code ?? 'SAVE_FAILED'}`) && <details><summary>{t('ui.technicalDetails')}</summary>{message.error}</details>}
              </div>
            )}
          </div>
          <button
            type="button"
            className="btn btn-text"
            onClick={() => {
              signOut()
              navigate('/login', { replace: true })
            }}
          >
            {t('ui.settings.signOut')}
          </button>
        </div>
      )}
    </div>
  )
}
