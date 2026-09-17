// Parameter editor shown under the two scenario cards on the landing screen.
//
// The engine stores amounts as drops strings and rates as 1/10th basis points; a
// presenter thinks in XRP and percent. This component is the only place that
// translates between the two, and it never commits a value it could not parse - a
// half-typed field leaves the committed params untouched.
import { useState } from 'react';
import { xrpToDrops } from 'xrpl';

import type { ScenarioParams } from '../scenario/types';
import { DEFAULT_PARAMS } from '../state/scenarioConfig';
import { RATE_SCALE_100_PERCENT } from '../xrpl/tx/loanBroker';
import { dropsToXrpDecimal } from './format';

/** One editable field, with the unit conversion in both directions. */
interface FieldSpec {
  key: string;
  label: string;
  hint: string;
  read(params: ScenarioParams): string;
  write(params: ScenarioParams, raw: string): ScenarioParams | null;
}

function xrpField(
  key: 'depositDrops' | 'principalDrops' | 'coverDrops',
  label: string,
  hint: string,
): FieldSpec {
  return {
    key,
    label,
    hint,
    read: (params) => dropsToXrpDecimal(params[key]) ?? '0',
    write: (params, raw) => {
      const value = Number(raw);
      if (!Number.isFinite(value) || value <= 0) {
        return null;
      }
      try {
        return { ...params, [key]: xrpToDrops(raw.trim()) };
      } catch {
        return null;
      }
    },
  };
}

function percentField(
  key: 'coverRateMinimum' | 'coverRateLiquidation' | 'interestRate',
  label: string,
  hint: string,
): FieldSpec {
  return {
    key,
    label,
    hint,
    read: (params) => String((params[key] / RATE_SCALE_100_PERCENT) * 100),
    write: (params, raw) => {
      const percent = Number(raw);
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        return null;
      }
      return { ...params, [key]: Math.round((percent / 100) * RATE_SCALE_100_PERCENT) };
    },
  };
}

function secondsField(
  key: 'paymentInterval' | 'gracePeriod' | 'subscriptionLeadSeconds' | 'investmentPeriodSeconds',
  label: string,
  hint: string,
  minimum: number,
): FieldSpec {
  return {
    key,
    label,
    hint,
    read: (params) => String(params[key]),
    write: (params, raw) => {
      const seconds = Number(raw);
      if (!Number.isInteger(seconds) || seconds < minimum) {
        return null;
      }
      return { ...params, [key]: seconds };
    },
  };
}

const FIELDS: FieldSpec[] = [
  xrpField('depositDrops', '예치 (XRP)', 'VaultDeposit Amount'),
  xrpField('principalDrops', '대출 원금 (XRP)', 'LoanSet PrincipalRequested'),
  xrpField('coverDrops', 'Cover (XRP)', 'LoanBrokerCoverDeposit Amount'),
  percentField('coverRateMinimum', 'CoverRateMinimum (%)', '대출 잔액 대비 최소 cover'),
  percentField('coverRateLiquidation', 'CoverRateLiquidation (%)', 'default 시 cover 사용 비율'),
  percentField('interestRate', 'InterestRate (%)', 'LoanSet InterestRate'),
  secondsField('paymentInterval', 'PaymentInterval (초)', '납부 주기, 최소 60', 60),
  secondsField('gracePeriod', 'GracePeriod (초)', '유예 기간, 최소 60', 60),
  secondsField(
    'subscriptionLeadSeconds',
    'Subscription 리드 (초)',
    '예치 가능 구간 길이, 최소 30',
    30,
  ),
  secondsField(
    'investmentPeriodSeconds',
    'Investment 기간 (초)',
    '인출 대기, 프로토콜 하한 180',
    180,
  ),
];

export interface ParamEditorProps {
  params: ScenarioParams;
  onChange(params: ScenarioParams): void;
  /** Locked once a scenario has started: params are frozen into the ScenarioCtx. */
  disabled?: boolean;
}

export function ParamEditor({ params, onChange, disabled = false }: ParamEditorProps) {
  const [open, setOpen] = useState(false);
  // Text the user is typing, kept apart so a half-typed value is never committed.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const valueOf = (field: FieldSpec): string => drafts[field.key] ?? field.read(params);

  const handleChange = (field: FieldSpec, raw: string): void => {
    setDrafts({ ...drafts, [field.key]: raw });
    const next = field.write(params, raw);
    if (next) {
      onChange(next);
    }
  };

  const restoreDefaults = (): void => {
    setDrafts({});
    onChange(DEFAULT_PARAMS);
  };

  return (
    <div className="param-editor" data-testid="param-editor">
      <div className="param-editor-head">
        <div>
          <div className="lab">파라미터</div>
          <div className="landing-card-desc">
            P0 실측 재스케일 기본값입니다. devnet faucet 지급액과 reserve를 감당하는 값으로 맞춰져
            있습니다.
          </div>
        </div>
        <button
          type="button"
          className="param-editor-toggle"
          onClick={() => setOpen(!open)}
          data-testid="param-editor-toggle"
        >
          {open ? '접기' : '펼쳐서 수정'}
        </button>
      </div>

      {open && (
        <>
          <div className="param-grid">
            {FIELDS.map((field) => (
              <div className="param-field" key={field.key}>
                <label htmlFor={`param-${field.key}`}>{field.label}</label>
                <input
                  id={`param-${field.key}`}
                  name={field.key}
                  type="text"
                  inputMode="decimal"
                  value={valueOf(field)}
                  disabled={disabled}
                  onChange={(event) => handleChange(field, event.target.value)}
                />
                <span className="param-hint">{field.hint}</span>
              </div>
            ))}
          </div>
          <div className="param-editor-actions">
            <button
              type="button"
              className="btn ghost"
              onClick={restoreDefaults}
              disabled={disabled}
            >
              기본값으로 되돌리기
            </button>
          </div>
        </>
      )}
    </div>
  );
}
