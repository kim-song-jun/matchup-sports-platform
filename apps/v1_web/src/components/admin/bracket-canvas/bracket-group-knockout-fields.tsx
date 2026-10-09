// apps/v1_web/src/components/admin/bracket-canvas/bracket-group-knockout-fields.tsx
'use client';

import { useId, type ChangeEvent } from 'react';

export type GroupKnockoutTemplateValue = {
  groupCount: number;
  teamsPerGroup: number;
  advancePerGroup: 1 | 2;
  legs: 1 | 2;
  thirdPlace: boolean;
};

export const DEFAULT_GROUP_KNOCKOUT_VALUE: GroupKnockoutTemplateValue = {
  groupCount: 2,
  teamsPerGroup: 4,
  advancePerGroup: 2,
  legs: 1,
  thirdPlace: false,
};

const SUPPORTED_KNOCKOUT_SIZES = [2, 4, 8, 16];

const knockoutSize = (value: GroupKnockoutTemplateValue) => value.groupCount * value.advancePerGroup;

/**
 * 서버가 422 `BRACKET_TEMPLATE_UNSUPPORTED` 로 거절할 조합을 보내기 전에 알린다.
 * 경기 수 상한(240)은 대화상자가 `planBracketTemplateCounts` 로 따로 막는다.
 */
export function groupKnockoutShapeIssue(value: GroupKnockoutTemplateValue): string | null {
  const size = knockoutSize(value);
  if (!SUPPORTED_KNOCKOUT_SIZES.includes(size)) {
    return `결선에 올라가는 팀은 2·4·8·16팀이어야 해요. 지금은 ${size}팀이에요.`;
  }
  if (size === 2 && value.thirdPlace) return '결선이 결승 한 경기뿐이면 3·4위전을 만들 수 없어요.';
  return null;
}

/** 결선이 결승 한 경기뿐이 되면 3·4위전을 끈다 — 4강이 있어야 패자 둘이 생긴다. */
export function applyGroupKnockoutChange(
  value: GroupKnockoutTemplateValue,
  patch: Partial<GroupKnockoutTemplateValue>,
): GroupKnockoutTemplateValue {
  const next = { ...value, ...patch };
  return knockoutSize(next) === 2 ? { ...next, thirdPlace: false } : next;
}

const SELECT_CLASS =
  'h-[44px] w-full rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 text-[length:var(--font-size-body)] ' +
  'text-[var(--text-strong)] transition-colors focus:outline-none focus:border-[var(--blue500)] disabled:opacity-50';
const LABEL_CLASS = 'tm-text-label font-semibold';

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

export function GroupKnockoutFields({
  value,
  onChange,
  disabled = false,
}: {
  value: GroupKnockoutTemplateValue;
  onChange: (next: GroupKnockoutTemplateValue) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const issue = groupKnockoutShapeIssue(value);
  const finalOnly = knockoutSize(value) === 2;
  const numberField = (key: 'groupCount' | 'teamsPerGroup', event: ChangeEvent<HTMLSelectElement>) =>
    onChange(applyGroupKnockoutChange(value, { [key]: Number(event.target.value) }));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-groups`} className={LABEL_CLASS} style={{ color: 'var(--text-strong)' }}>조 수</label>
          <select id={`${id}-groups`} className={SELECT_CLASS} value={value.groupCount} disabled={disabled} onChange={(e) => numberField('groupCount', e)}>
            {range(2, 8).map((n) => <option key={n} value={n}>{n}개 조</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-teams`} className={LABEL_CLASS} style={{ color: 'var(--text-strong)' }}>조당 팀 수</label>
          <select id={`${id}-teams`} className={SELECT_CLASS} value={value.teamsPerGroup} disabled={disabled} onChange={(e) => numberField('teamsPerGroup', e)}>
            {range(3, 6).map((n) => <option key={n} value={n}>{n}팀</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-advance`} className={LABEL_CLASS} style={{ color: 'var(--text-strong)' }}>조별 진출 팀 수</label>
          <select
            id={`${id}-advance`}
            className={SELECT_CLASS}
            value={value.advancePerGroup}
            disabled={disabled}
            onChange={(e) => onChange(applyGroupKnockoutChange(value, { advancePerGroup: Number(e.target.value) as 1 | 2 }))}
          >
            <option value={1}>조 1위만</option>
            <option value={2}>조 1·2위</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-legs`} className={LABEL_CLASS} style={{ color: 'var(--text-strong)' }}>조별 회전</label>
          <select
            id={`${id}-legs`}
            className={SELECT_CLASS}
            value={value.legs}
            disabled={disabled}
            onChange={(e) => onChange(applyGroupKnockoutChange(value, { legs: Number(e.target.value) as 1 | 2 }))}
          >
            <option value={1}>한 번씩</option>
            <option value={2}>홈·어웨이 두 번씩</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col">
        <label htmlFor={`${id}-third`} className="tm-text-label flex min-h-[44px] items-center gap-2" style={{ color: 'var(--text-strong)' }}>
          <input
            id={`${id}-third`}
            type="checkbox"
            className="size-5"
            checked={value.thirdPlace}
            disabled={disabled || finalOnly}
            onChange={(e) => onChange(applyGroupKnockoutChange(value, { thirdPlace: e.target.checked }))}
          />
          3·4위전도 만들기
        </label>
        {finalOnly ? (
          <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>결선이 결승 한 경기뿐이면 3·4위전을 만들 수 없어요.</p>
        ) : null}
      </div>

      {issue !== null ? (
        <p role="alert" className="tm-text-caption" style={{ color: 'var(--red700)' }}>{issue}</p>
      ) : null}
    </div>
  );
}
