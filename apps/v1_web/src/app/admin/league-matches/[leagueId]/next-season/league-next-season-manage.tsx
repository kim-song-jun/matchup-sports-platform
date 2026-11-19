'use client';

import { useState } from 'react';
import { AdminPageSkeleton, AdminToasts, useAdminToast } from '@/components/admin';
import { AlertBanner, ErrorState } from '@/components/v1-ui/primitives';
import { useAdminCanWrite } from '@/hooks/use-admin-can-write';
import { useV1AdminLeagueMatch } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1AdminLeagueDetail } from '@/types/league-match';
import { LeagueNextSeasonCreate } from './league-next-season-create';
import { LeagueNextSeasonLink, LeagueNextSeasonLinked } from './league-next-season-link';

type Mode = 'create' | 'link';

const MODES: ReadonlyArray<{ mode: Mode; label: string }> = [
  { mode: 'create', label: '새로 만들기' },
  { mode: 'link', label: '기존 리그 잇기' },
];

/** 이 리그에서 다음 시즌을 만들거나 이을 수 없는 이유. 막히지 않으면 null. */
export function nextSeasonBlockedReason(league: V1AdminLeagueDetail, canWrite: boolean): string | null {
  if (!canWrite) return '조회 권한으로는 다음 시즌을 만들거나 이을 수 없어요.';
  if (league.seriesId != null) return '리그 체계에 속한 리그는 승강 확정으로 다음 시즌을 이어요.';
  if (league.convertedToSeries === true) return '리그 체계로 전환한 리그는 다음 시즌을 따로 이을 수 없어요.';
  if (league.state !== 'active' && league.state !== 'completed') return '시즌을 시작했거나 끝낸 리그에서 다음 시즌을 만들거나 이을 수 있어요.';
  return null;
}

/**
 * 어드민 리그의 「다음 시즌」 화면(2026-11-19). 다음 시즌을 **새로 만들거나**, 이미 따로 만든 리그를 **이을** 수 있고,
 * 이미 이어졌으면 이어진 리그로 가는 길과 연결 해제를 보인다. 둘 중 어느 쪽이든 같은 `previousLeagueId` 로 이어진다.
 */
export function LeagueNextSeasonManage({ leagueId }: { leagueId: string }) {
  const canWrite = useAdminCanWrite();
  const league = useV1AdminLeagueMatch(leagueId);
  const { toasts, showToast } = useAdminToast();
  const [mode, setMode] = useState<Mode>('create');

  if (league.isPending) return <AdminPageSkeleton />;
  if (!league.data) {
    return (
      <ErrorState
        message={extractErrorMessage(league.error, '리그 정보를 불러오지 못했어요.')}
        onRetry={() => void league.refetch()}
      />
    );
  }
  const data = league.data;

  if (data.nextSeason) {
    return (
      <>
        <LeagueNextSeasonLinked league={data} canWrite={canWrite} showToast={showToast} />
        <AdminToasts toasts={toasts} />
      </>
    );
  }
  const blocked = nextSeasonBlockedReason(data, canWrite);
  if (blocked !== null) return <AlertBanner tone="info" message={blocked} />;

  return (
    <>
      <div role="group" aria-label="다음 시즌 방식" className="mx-auto mb-4 flex max-w-2xl gap-2">
        {MODES.map((option) => (
          <button
            key={option.mode}
            type="button"
            aria-pressed={mode === option.mode}
            onClick={() => setMode(option.mode)}
            className="min-h-[44px] rounded-xl border border-[var(--border-strong)] px-4 text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-strong)] transition-colors aria-pressed:border-blue-500 aria-pressed:bg-[var(--blue50)] aria-pressed:text-[var(--blue700)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            {option.label}
          </button>
        ))}
      </div>
      {mode === 'create' ? (
        <LeagueNextSeasonCreate key={leagueId} league={data} />
      ) : (
        <LeagueNextSeasonLink key={leagueId} league={data} showToast={showToast} />
      )}
      <AdminToasts toasts={toasts} />
    </>
  );
}
