'use client';

import { useId } from 'react';

const fieldClass =
  'h-[44px] w-full rounded-xl border border-[var(--border-strong)] bg-[var(--card-surface)] px-3 text-[length:var(--font-size-body-sm)] text-[var(--text-strong)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50';

export type RosterLimitValue = { unlimited: boolean; minPlayers: string; maxPlayers: string };

export function leagueTeamCapacityError(value: string): string | null {
  if (value.trim() === '') return null;
  return /^\d+$/.test(value.trim()) && Number(value) >= 1 && Number(value) <= 2147483647
    ? null
    : '참가팀 정원은 1~2,147,483,647팀 사이의 정수로 입력해 주세요.';
}

export function LeagueTeamCapacityField({ value, onChange, disabled }: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const error = leagueTeamCapacityError(value);
  return (
    <div>
      <label htmlFor={id} className="mb-1 block tm-text-body-sm font-medium text-[var(--text-strong)]">참가팀 정원 (선택)</label>
      <input id={id} type="number" inputMode="numeric" min={1} max={2147483647} step={1}
        value={value} disabled={disabled} aria-invalid={error !== null} aria-describedby={`${id}-hint`}
        onChange={event => onChange(event.target.value)} className={fieldClass} />
      <p id={`${id}-hint`} className="mt-1 tm-text-caption text-[var(--text-muted)]">
        {error ?? '비워 두면 참가팀 수에 제한이 없어요. 팀당 선수 인원과는 별개예요.'}
      </p>
    </div>
  );
}

const isPlayerCount = (value: string) => /^\d+$/.test(value.trim()) && Number(value) >= 1 && Number(value) <= 50;

/** 팀 명단 인원 입력의 오류 문구. 제한 없음이면 칸을 보지 않는다. */
export function rosterLimitError(value: RosterLimitValue): string | null {
  if (value.unlimited) return null;
  if (!isPlayerCount(value.minPlayers) || !isPlayerCount(value.maxPlayers)) return '팀 명단 인원은 1~50명 사이로 입력해 주세요.';
  if (Number(value.minPlayers) > Number(value.maxPlayers)) return '최소 인원이 최대 인원보다 많아요.';
  return null;
}

/**
 * 팀 명단 인원 — 최소~최대와 그 옆 '제한 없음'. 제한 없음이면 팀 전원이 명단(=라인업)에 오른다.
 * 리그 만들기 화면이 쓴다.
 */
export function LeagueRosterLimitField({
  value,
  onChange,
  disabled,
}: {
  value: RosterLimitValue;
  onChange: (next: Partial<RosterLimitValue>) => void;
  disabled?: boolean;
}) {
  const minId = useId();
  const maxId = useId();
  const unlimitedId = useId();
  const inputsDisabled = disabled || value.unlimited;
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 block text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)]">팀 명단 인원</legend>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-24">
          <label htmlFor={minId} className="mb-1 block text-[length:var(--font-size-caption)] text-[var(--text-muted)]">최소 (명)</label>
          <input id={minId} type="number" inputMode="numeric" min={1} max={50} value={value.unlimited ? '' : value.minPlayers} disabled={inputsDisabled} onChange={(e) => onChange({ minPlayers: e.target.value })} className={fieldClass} />
        </div>
        <span className="pb-3 text-[var(--text-muted)]" aria-hidden="true">~</span>
        <div className="w-24">
          <label htmlFor={maxId} className="mb-1 block text-[length:var(--font-size-caption)] text-[var(--text-muted)]">최대 (명)</label>
          <input id={maxId} type="number" inputMode="numeric" min={1} max={50} value={value.unlimited ? '' : value.maxPlayers} disabled={inputsDisabled} onChange={(e) => onChange({ maxPlayers: e.target.value })} className={fieldClass} />
        </div>
        <label htmlFor={unlimitedId} className="flex min-h-[44px] cursor-pointer items-center gap-2 text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)]">
          <input
            id={unlimitedId}
            type="checkbox"
            checked={value.unlimited}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked ? { unlimited: true } : { unlimited: false, minPlayers: value.minPlayers || '1', maxPlayers: value.maxPlayers || '20' })}
            className="h-4 w-4 accent-blue-600"
          />
          제한 없음
        </label>
      </div>
      <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
        {value.unlimited ? '팀원 전원이 명단에 올라가요. 실명·생년월일·휴대폰이 없는 팀원은 빠져요.' : '이 인원을 넘는 팀원은 명단에 올릴 수 없어요.'}
      </p>
    </fieldset>
  );
}

/** 팀 수 N 으로 한 번씩·두 번씩 만날 때의 총 경기 수 — 총 경기 수 칸의 힌트. */
export function roundRobinFixtureCounts(teamCount: number): { single: number; double: number } {
  const single = (teamCount * (teamCount - 1)) / 2;
  return { single, double: single * 2 };
}

/** 리그 총 경기 수(계획). 비워 두면 대진을 만들 때 정한다. 대진 생성 폼이 이 값을 기본값으로 쓴다. */
export function LeaguePlannedFixtureField({
  value,
  teamCount = 0,
  onChange,
  disabled,
}: {
  value: string;
  teamCount?: number;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const counts = roundRobinFixtureCounts(teamCount);
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)]">총 경기 수 (선택)</label>
      <div className="flex items-center gap-2">
        <input id={id} type="number" inputMode="numeric" min={1} max={500} value={value} placeholder="예: 10" disabled={disabled} onChange={(e) => onChange(e.target.value)} className={`${fieldClass} w-32`} />
        <span className="shrink-0 whitespace-nowrap text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">경기</span>
      </div>
      <p className="mt-1 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
        {teamCount >= 2
          ? `${teamCount}팀이 한 번씩 만나면 ${counts.single}경기, 두 번씩이면 ${counts.double}경기예요. 대진을 만들 때 이 수만큼 만들고, 나중에 경기를 더 추가할 수 있어요. 이 수만큼 결과가 확정되면 리그가 자동으로 끝나요.`
          : '대진을 만들 때 이 수만큼 만들고, 나중에 경기를 더 추가할 수 있어요. 이 수만큼 결과가 확정되면 리그가 자동으로 끝나요.'}
      </p>
    </div>
  );
}
