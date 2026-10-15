'use client';

import { CreateField, FieldErrorText } from '@/components/v1-ui/create-form-fields';
import { ErrorState, SectionTitle } from '@/components/v1-ui/primitives';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { SegmentedTabs } from '@/components/v1-ui/segmented-tabs';
import { MAX_TEAM_MATCH_PERIOD_MINUTES, validTeamMatchPeriodMinutes } from '@/lib/team-match-periods';
import { validTeamMatchPeriods } from './team-match-rules-draft';
import type { TeamMatchRulesControl } from './team-matches.types';

export function TeamMatchRulesFields({ rules }: { rules: TeamMatchRulesControl }) {
  const periods = rules.periods;
  if (rules.loading) return <PageSkeleton variant="form" />;
  const halfDefaults = rules.twoPeriodDefaults;
  const hasHalfDefaults = halfDefaults?.length === 2 && validTeamMatchPeriods(halfDefaults);
  const missingHalfDefaults = periods?.length === 1 && !hasHalfDefaults;
  const combinedMinutes = periods?.reduce((total, period) => total + period.durationMinutes, 0) ?? 0;
  const invalidSingleConversion = periods?.length === 2
    && (!validTeamMatchPeriods(periods) || !validTeamMatchPeriodMinutes(combinedMinutes));
  const singleConversionReason = invalidSingleConversion
    ? validTeamMatchPeriods(periods)
      ? `전후반 시간의 합계가 ${MAX_TEAM_MATCH_PERIOD_MINUTES}분을 초과해 단판으로 바꿀 수 없어요.`
      : '각 경기 시간을 먼저 유효하게 입력한 뒤 단판으로 바꿔 주세요.'
    : null;
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
            items={[{ id: '1', label: '단판', disabled: invalidSingleConversion },
              { id: '2', label: '전후반', disabled: missingHalfDefaults }]}
            onSelect={(value) => {
              if (value === '1' && periods.length !== 1 && !invalidSingleConversion) {
                rules.onChange([{ durationMinutes: combinedMinutes }]);
              } else if (value === '2' && periods.length !== 2 && halfDefaults?.length === 2 && hasHalfDefaults) {
                rules.onChange(halfDefaults.map(({ durationMinutes }) => ({ durationMinutes })));
              }
            }} />
          {missingHalfDefaults && !rules.lockedReason && !rules.error ? (
            <p role="status" className="tm-text-caption" style={{ marginTop: 'var(--spacing-3)' }}>
              확인된 전후반 기본 규칙이 없어 단판으로 진행해 주세요.
            </p>
          ) : null}
          {singleConversionReason && !rules.lockedReason && !rules.error ? (
            <p role="status" className="tm-text-caption" style={{ marginTop: 'var(--spacing-3)' }}>{singleConversionReason}</p>
          ) : null}
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
