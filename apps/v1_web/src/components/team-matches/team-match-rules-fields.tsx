'use client';

import { CreateField, FieldErrorText } from '@/components/v1-ui/create-form-fields';
import { ErrorState, SectionTitle } from '@/components/v1-ui/primitives';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { SegmentedTabs } from '@/components/v1-ui/segmented-tabs';
import type { TeamMatchRulesControl } from './team-matches.types';

export function TeamMatchRulesFields({ rules }: { rules: TeamMatchRulesControl }) {
  const periods = rules.periods;
  if (rules.loading) return <PageSkeleton variant="form" />;
  return (
    <div data-team-match-field="rules" tabIndex={-1}>
      <h1 className="tm-text-heading">경기를 어떻게 진행하나요?</h1>
      <p className="tm-text-body" style={{ marginTop: 'var(--spacing-2)' }}>
        단판 또는 전후반을 선택하고 각 경기 시간을 입력해 주세요. 마지막 저장 버튼을 누르면 경기 정보와 함께 저장돼요.
      </p>
      {rules.lockedReason ? <div role="status" className="tm-text-body" style={{ marginTop: 'var(--spacing-4)' }}>{rules.lockedReason}</div> : null}
      {rules.error ? <ErrorState compact title="경기 규칙을 확인해 주세요" message={rules.error} onRetry={rules.onRetry} retryPending={rules.retryPending} /> : null}
      {rules.allowDefaultChoice ? (
        <button className="tm-btn tm-btn-md tm-btn-neutral" type="button" aria-pressed={rules.defaultSelected} onClick={rules.onKeepDefault}>
          기존 기본 규칙 사용
        </button>
      ) : null}
      {rules.defaultSelected ? <p className="tm-text-caption" style={{ marginTop: 'var(--spacing-3)' }}>현재 서버의 기본 규칙을 유지해요. 임의의 경기 시간으로 바꾸지 않아요.</p> : null}
      {periods ? (
        <fieldset className="tm-create-fieldset" disabled={Boolean(rules.lockedReason)} style={{ marginTop: 'var(--spacing-6)' }}>
          <SectionTitle title="경기 구성" />
          <SegmentedTabs role="radiogroup" ariaLabel="경기 구성" activeId={String(periods.length)}
            items={[{ id: '1', label: '단판' }, { id: '2', label: '전후반' }]}
            onSelect={(value) => {
              if (value === '1' && periods.length !== 1) {
                rules.onChange([{ durationMinutes: periods.reduce((total, period) => total + period.durationMinutes, 0) }]);
              } else if (value === '2' && periods.length !== 2 && rules.defaultPeriods?.length === 2) {
                rules.onChange(rules.defaultPeriods.map(({ durationMinutes }) => ({ durationMinutes })));
              }
            }} />
          <div className="tm-create-two-col" style={{ marginTop: 'var(--spacing-4)' }}>
            {periods.map((period, index) => (
              <CreateField key={index} label={periods.length === 1 ? '경기 시간' : index === 0 ? '전반 시간' : '후반 시간'}
                value={String(period.durationMinutes)} type="number" suffix="분"
                onChange={(value) => rules.onChange(periods.map((item, itemIndex) => itemIndex === index ? { durationMinutes: Number(value) } : item))} />
            ))}
          </div>
          <FieldErrorText message={rules.validationError} />
        </fieldset>
      ) : null}
    </div>
  );
}
