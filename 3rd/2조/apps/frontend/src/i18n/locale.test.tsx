import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginPage } from '../pages/LoginPage'
import { CasePage } from '../pages/CasePage'
import { fixtureCase } from '../cases/testCases'
import { renderPage } from '../test/render'
import { createCopy, fill } from './copy'
import { en } from './en'
import { ko } from './ko'
import { useCopy, useT } from './hooks'
import { I18nProvider } from './I18nProvider'
import { LanguageSelect } from './LanguageSelect'
import { initialLocale, LOCALE_KEY, resolveLocale } from './locale'
import { scenarioName } from '../pages/newcase/scenarioName'

beforeEach(() => localStorage.clear())
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('locale selection', () => {
  it('prioritizes a saved choice, then the first supported browser language', () => {
    expect(resolveLocale('en', ['ko-KR'])).toBe('en')
    expect(resolveLocale('ko', ['en-US'])).toBe('ko')
    expect(resolveLocale('broken', ['fr-FR', 'ko-KR', 'en-US'])).toBe('ko')
    expect(resolveLocale(null, ['en-GB', 'ko'])).toBe('en')
    expect(resolveLocale(null, ['ja-JP'])).toBe('en')
    expect(resolveLocale(null, [])).toBe('en')
  })
  it('still detects Korean when browser storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['ko-KR'])
    expect(initialLocale()).toBe('ko')
  })
  it('switches immediately, preserves input and translates an existing validation error', () => {
    render(<I18nProvider locale="en"><MemoryRouter><LoginPage /></MemoryRouter></I18nProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByText(en.ui.login.nameMissing)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Name or e-mail'), { target: { value: '발표자' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Language' }), { target: { value: 'ko' } })
    expect(screen.getByRole('heading', { name: '접속하기' })).toBeTruthy()
    expect((screen.getByLabelText('이름 또는 이메일') as HTMLInputElement).value).toBe('발표자')
    expect(screen.getByText(ko.ui.login.nameMissing)).toBeTruthy()
    expect(localStorage.getItem(LOCALE_KEY)).toBe('ko')
    expect(document.documentElement.lang).toBe('ko')
  })
  it('restores the saved language on a fresh mount and allows switching without storage', () => {
    localStorage.setItem(LOCALE_KEY, 'ko')
    render(<I18nProvider><MemoryRouter><LoginPage /></MemoryRouter></I18nProvider>)
    expect(screen.getByRole('heading', { name: '접속하기' })).toBeTruthy()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    fireEvent.change(screen.getByRole('combobox', { name: '언어' }), { target: { value: 'en' } })
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy()
    expect(document.documentElement.lang).toBe('en')
  })
})

function ResultProbe() {
  const t = useT(), copy = useCopy()
  return <><LanguageSelect /><p>{copy.error('NETWORK_ERROR').title}</p><p>{copy.decision('BLOCK').headline}</p><p>{t('ui.storage.server')}</p></>
}
it('translates policy, error and storage copy without changing the stored result', () => {
  render(<I18nProvider locale="ko"><ResultProbe /></I18nProvider>)
  expect(screen.getByText('백엔드에 연결할 수 없습니다.')).toBeTruthy()
  expect(screen.getByText('이 송금은 차단됩니다.')).toBeTruthy()
  expect(screen.getByText('기록은 서버에 저장됩니다.')).toBeTruthy()
  fireEvent.change(screen.getByRole('combobox', { name: '언어' }), { target: { value: 'en' } })
  expect(screen.getByText('This transfer is blocked.')).toBeTruthy()
})
it('reopens a saved English-created case with Korean evidence and simulations', async () => {
  const record = fixtureCase('CL-0001', 'sanctioned')
  const { store } = renderPage(<I18nProvider locale="ko"><CasePage /></I18nProvider>, { path: '/cases/:caseId', at: '/cases/CL-0001', seed: [record] })
  expect(await screen.findByRole('heading', { name: '이 송금은 차단됩니다.' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: '판단 근거' })).toBeTruthy()
  expect(screen.getByRole('button', { name: '다른 경로로 제출하면?' })).toBeTruthy()
  expect(await store.get(record.id)).toEqual(record)
})
it('uses Korean scenario names and rule parameters', () => {
  expect(scenarioName('mainnet-ofac-sdn-exact', ko)).toBe('메인넷: OFAC SDN 주소 일치')
  const copy = createCopy(ko)
  expect(copy.rule('RAPID_FAN_OUT', { windowSeconds: 300, minRecipients: 3 }).detail).toBe('300초 안에 서로 다른 지갑 3개 이상으로 송금했습니다.')
  expect(fill(ko.ui.dashboard.answerMany, { n: 3 })).toBe('송금 3건을 확인했습니다.')
})
