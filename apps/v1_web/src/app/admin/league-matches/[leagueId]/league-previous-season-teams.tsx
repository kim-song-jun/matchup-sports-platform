'use client';

import { useId, useState } from 'react';
import { useV1AddPreviousSeasonTeams, useV1AdminLeagueTeams } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1LeagueSeasonLink } from '@/types/league-match';

/**
 * 참가팀 관리의 '지난 시즌 팀'(독립 리그의 다음 시즌, 2026-11-03 사용자 선택 — 어드민이 한 번에 넣기).
 * 지난 시즌 확정 팀 중 아직 이 리그에 없는 팀을 골라 바로 참가 확정으로 넣는다. 서버가 지난 시즌 명단도 이어받는다.
 * 한 번에 보내고, 한 팀이라도 막히면 아무 팀도 들어가지 않는다(서버가 이유를 돌려준다).
 */
export function LeaguePreviousSeasonTeams({
  leagueId,
  previousSeason,
  currentTeamIds,
  disabled,
  showToast,
}: {
  leagueId: string;
  previousSeason: V1LeagueSeasonLink;
  /** 이미 이 리그에 확정된 팀 — 목록에서 뺀다. */
  currentTeamIds: ReadonlySet<string>;
  /** 쓰기 권한이 없거나 끝난 리그. */
  disabled: boolean;
  showToast: (message: string, variant?: 'success' | 'error') => void;
}) {
  const id = useId();
  const previousTeams = useV1AdminLeagueTeams(previousSeason.leagueId);
  const addTeams = useV1AddPreviousSeasonTeams(leagueId);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const candidates = (previousTeams.data?.teams ?? []).filter((team) => !currentTeamIds.has(team.teamId));
  // 이미 넣었거나 사라진 팀은 고른 목록에서도 뺀다 — 화면에 없는 팀을 보내지 않는다.
  const pickedIds = candidates.filter((team) => picked.has(team.teamId)).map((team) => team.teamId);

  const toggle = (teamId: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });

  const submit = () => {
    if (pickedIds.length === 0 || addTeams.isPending) return;
    addTeams.mutate(pickedIds, {
      onSuccess: (result) => {
        setPicked(new Set());
        const carried = result.carriedPlayerCount > 0 ? ` 지난 시즌 명단 ${result.carriedPlayerCount}명을 옮겨 왔어요.` : '';
        const fixtures = result.hasExistingFixtures ? ' 대진에 반영하려면 표 아래 "대진 관리"에서 "대진 재생성"을 눌러 주세요.' : '';
        showToast(`${result.teamIds.length}팀을 넣었어요.${carried}${fixtures}`, 'success');
      },
      onError: (error) => showToast(extractErrorMessage(error, '지난 시즌 팀을 넣지 못했어요.'), 'error'),
    });
  };

  return (
    <fieldset className="mt-4 min-w-0 border-0 p-0" disabled={disabled || addTeams.isPending}>
      <legend className="mb-1 text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)]">{`지난 시즌 팀 · ${previousSeason.title}`}</legend>
      <p id={`${id}-hint`} className="mb-2 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
        골라서 넣으면 바로 참가 확정되고 지난 시즌 명단을 이어받아요. 입금 단계는 없어요.
      </p>
      {previousTeams.isPending ? (
        <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">지난 시즌 팀을 불러오는 중이에요.</p>
      ) : previousTeams.isError ? (
        <p role="alert" className="text-[length:var(--font-size-caption)] text-[var(--red700)]">
          {extractErrorMessage(previousTeams.error, '지난 시즌 팀을 불러오지 못했어요.')}
        </p>
      ) : candidates.length === 0 ? (
        <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">지난 시즌 팀이 모두 이 리그에 있어요.</p>
      ) : (
        <>
          <ul className="mb-2 flex flex-col gap-1">
            {candidates.map((team) => {
              const inactive = team.status !== 'active';
              return (
                <li key={team.teamId}>
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-[var(--border)] px-3 text-[length:var(--font-size-body-sm)] text-[var(--text-body)] has-[:checked]:border-[var(--blue500)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
                    <input
                      type="checkbox"
                      checked={picked.has(team.teamId)}
                      onChange={() => toggle(team.teamId)}
                      disabled={inactive}
                      aria-describedby={`${id}-hint`}
                      className="h-5 w-5 accent-[var(--blue500)]"
                    />
                    <span className="min-w-0 flex-1 truncate">{team.name}</span>
                    {inactive ? <span className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">활동하지 않는 팀</span> : null}
                  </label>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={submit}
            disabled={pickedIds.length === 0}
            className="min-h-[44px] rounded-xl border border-[var(--border)] px-4 text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-strong)] disabled:opacity-50"
          >
            {addTeams.isPending ? '넣는 중…' : `선택한 팀 넣기${pickedIds.length > 0 ? ` (${pickedIds.length})` : ''}`}
          </button>
        </>
      )}
    </fieldset>
  );
}
