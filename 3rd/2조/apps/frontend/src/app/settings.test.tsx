import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fixtureCase } from '../cases/testCases'
import { parseCaseExport } from '../cases/transfer'
import { renderPage } from '../test/render'
import { getModeOverride, setModeOverride } from './apiMode'
import { SettingsMenu } from './SettingsMenu'

beforeEach(() => localStorage.clear())
afterEach(cleanup)

const seed = [fixtureCase('CL-0001', 'sanctioned')]

function open(props: Partial<Parameters<typeof SettingsMenu>[0]> = {}) {
  const result = renderPage(<SettingsMenu onReload={() => {}} onDownload={() => {}} {...props} />, { seed })
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
  return result
}

describe('SettingsMenu', () => {
  it('switches a Backend build to Mock data and reloads', () => {
    setModeOverride('backend')
    let reloaded = false
    open({ onReload: () => (reloaded = true) })
    fireEvent.click(screen.getByRole('button', { name: 'Use Mock data' }))
    expect(getModeOverride()).toBe('mock')
    expect(reloaded).toBe(true)
  })

  it('refuses a file that is not a case export and keeps the cases', async () => {
    const { store } = open()
    const file = new File([JSON.stringify({ format: 'other' })], 'x.json', { type: 'application/json' })
    fireEvent.change(screen.getByLabelText('Import cases'), { target: { files: [file] } })
    expect(await screen.findByText('The file is not a Compliance Lab case export.')).toBeTruthy()
    expect(await store.list()).toHaveLength(1)
  })

  it('exports every case as a file that imports cleanly', async () => {
    let saved: { name: string; text: string } | null = null
    open({ onDownload: (name, text) => (saved = { name, text }) })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export cases' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Export cases' }))
    expect(saved).not.toBeNull()
    expect(saved!.name).toMatch(/^scl-cases-\d{4}-\d{2}-\d{2}\.json$/)
    const parsed = parseCaseExport(saved!.text)
    expect(parsed.ok && parsed.cases.map((c) => c.id)).toEqual(['CL-0001'])
  })
})
