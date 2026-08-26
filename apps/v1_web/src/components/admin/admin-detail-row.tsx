import type { ReactNode } from 'react';

/**
 * 어드민 상세 화면의 값 한 칸. 회원·팀·매치·팀매치 상세가 각자 복사해 갖고 있던 것을
 * 하나로 모았다 — 같은 결함(빈 값 판정)이 4벌로 복제돼 있었다.
 *
 * `value || '-'` 는 0 을 빈 값으로 삼키고, `value ?? '-'` 는 빈 문자열을 빈 칸으로 남긴다.
 * 둘 다 틀리므로 "값이 없다"를 명시적으로 판정한다: null·undefined·빈 문자열만 대시로
 * 바꾸고 0 은 0 그대로 보여준다.
 */
export function AdminDetailRow({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  const isEmpty = value === null || value === undefined || value === '';
  return (
    <div className="min-w-0 rounded-xl bg-[var(--surface-soft)] px-4 py-3">
      <dt className="text-xs font-semibold text-gray-400">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold text-[var(--text-strong)]">
        {isEmpty ? '-' : value}
      </dd>
    </div>
  );
}

/**
 * 상세 화면 우측 요약(aside)의 한 줄. 아이콘 + 라벨 + 값.
 * 빈 값 판정은 `AdminDetailRow`와 같은 계약이다 — 이 컴포넌트만 non-nullable로 남아
 * 호출부 3곳(teams·matches·team-matches 상세)이 각자 `?? '-'`를 재구현했었다.
 */
export function AdminSummaryItem({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string | number | null | undefined;
}) {
  const isEmpty = value === null || value === undefined || value === '';
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-[var(--surface-soft)] px-4 py-3">
      <dt className="flex min-w-0 items-center gap-2 text-sm font-semibold text-[var(--text-muted)]">
        <span className="shrink-0 text-gray-400" aria-hidden="true">{icon}</span>
        <span className="truncate">{label}</span>
      </dt>
      <dd className="shrink-0 text-sm font-bold tabular-nums text-[var(--text-strong)]">
        {isEmpty ? '-' : value}
      </dd>
    </div>
  );
}
