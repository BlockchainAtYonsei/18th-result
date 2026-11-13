// Every chart answers one question in words first and can be read as a table instead (design doc §10).
import { useState, type ReactNode } from 'react'
import { useT } from '../i18n/hooks'

export function ChartFrame({
  question,
  answer,
  table,
  aside,
  children,
}: {
  question: string
  answer: ReactNode
  table: ReactNode
  aside?: ReactNode
  children: ReactNode
}) {
  const t = useT()
  const [asTable, setAsTable] = useState(false)
  return (
    <section className="chart-frame">
      <header className="chart-head">
        <div>
          <h3>{question}</h3>
          <p className="t2">{answer}</p>
        </div>
        <div className="chart-tools">
          {aside}
          <button type="button" className="btn btn-text" onClick={() => setAsTable((v) => !v)}>
            {asTable ? t('ui.chart.showChart') : t('ui.chart.showTable')}
          </button>
        </div>
      </header>
      <div className="chart-body">{asTable ? <div className="table-wrap">{table}</div> : children}</div>
    </section>
  )
}
