/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n/I18nProvider'
import { DemoWorkbench } from './DemoWorkbench'
import type { OfflineRecords } from './records'
const records = JSON.parse(readFileSync('../../presentation/data/demo.json', 'utf8')) as OfflineRecords
const open = (stage: 'analysis' | 'gateway' | 'network' = 'analysis') => render(<I18nProvider locale="ko"><DemoWorkbench records={records} stage={stage} /></I18nProvider>)
afterEach(() => { cleanup(); vi.restoreAllMocks() })
describe('Presentation workbench', () => {
  it('opens the pattern result and expands only its recorded evidence without network access', () => {
    const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No network'))
    open()
    expect(screen.queryByRole('textbox')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '분석 결과 열기' }))
    expect(screen.getByText('35')).toBeTruthy()
    expect(screen.getByText('MEDIUM · 규칙 기반 점수')).toBeTruthy()
    expect(screen.queryByText('WARN')).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Constellation' })).toBeNull()
    expect(screen.queryByRole('button', { name: '제재 주소 일치' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '판단 근거 확인' }))
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(5)
    fireEvent.click(screen.getByRole('button', { name: '전체 근거 12건 펼치기' }))
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(13)
    expect(network).not.toHaveBeenCalled()
  })
  it('compares the same BLOCK request only in the gateway stage', () => {
    open('gateway')
    expect(screen.queryByRole('tab', { name: 'Constellation' })).toBeNull()
    expect(screen.getByText('제출 중단')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '정책 미적용 경로' }))
    expect(screen.getByText('제출됨')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
  it('selects exact recorded boundary conditions for both models', () => {
    open('network')
    expect(screen.getByText('리더는 거래를 포함해야 합니다.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '39.99% · 포함 기준 미달' }))
    expect(screen.queryByText('리더는 거래를 포함해야 합니다.')).toBeNull()
    expect(screen.getAllByText('리더에게 거래 포함을 강제할 수 없습니다.')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: '59.99% · 전체 참여 미달' }))
    expect(screen.getByText('블록 전체를 건너뜁니다. 특정 거래만 차단한 결과가 아닙니다.')).toBeTruthy()
  })
  it('switches cases and resets the presentation to an unopened pattern case', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: '정상 기준' }))
    fireEvent.click(screen.getByRole('button', { name: '분석 결과 열기' }))
    expect(screen.getByText('0')).toBeTruthy()
    expect(screen.queryByText('ALLOW')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '시연 처음으로' }))
    expect(screen.getByRole('button', { name: '분석 결과 열기' })).toBeTruthy()
    expect(screen.queryByText('ALLOW')).toBeNull()
  })
})
