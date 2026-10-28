'use client';

import Link from 'next/link';
import { Card, ErrorState, InfoRow } from '@/components/v1-ui/primitives';
import { useV1TeamMatch } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1TeamMatch } from '@/types/api';
import { TeamMatchOperateConsole } from '@/components/tournament-live/operate/operate-console';

export function TeamMatchOperateEntry({ teamMatchId }: { teamMatchId: string }) {
  const query = useV1TeamMatch(teamMatchId, {
    refetchInterval: 15_000,
    refetchOnWindowFocus: 'always',
  });
  const detailHref = `/team-matches/${encodeURIComponent(teamMatchId)}`;

  if (query.isLoading || query.isPlaceholderData) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <p role="status" className="tm-text-body">불러오는 중이에요.</p>
      </main>
    );
  }

  if (query.isError) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <ErrorState
          title="팀매치 정보를 불러오지 못했어요"
          message={extractErrorMessage(query.error, '팀매치 정보를 불러오지 못했어요. 다시 시도해 주세요.')}
          onRetry={() => void query.refetch()}
          back={{ href: detailHref, label: '팀매치 상세로' }}
        />
      </main>
    );
  }

  const match = query.data;
  if (!match || match.id !== teamMatchId) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <ErrorState
          title="팀매치를 확인할 수 없어요"
          message="요청한 팀매치와 조회된 정보가 일치하지 않아요."
          back={{ href: '/team-matches', label: '팀매치 목록으로' }}
        />
      </main>
    );
  }

  if (match.league !== null) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <ErrorState
          title="리그 경기는 여기서 운영할 수 없어요"
          message="리그 운영 화면에서 경기를 열어 주세요."
          back={{ href: detailHref, label: '팀매치 상세로' }}
        />
      </main>
    );
  }

  const canManageHost = match.viewer?.manageableHostTeam === true;
  if (!canManageHost) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <ErrorState
          title="경기 운영 권한이 없어요"
          message="호스트 팀장이나 매니저만 볼 수 있어요."
          back={{ href: detailHref, label: '팀매치 상세로' }}
        />
      </main>
    );
  }

  if (match.status === 'recruiting') {
    return <TeamMatchRulePreview match={match} teamMatchId={teamMatchId} />;
  }

  if (match.status === 'completed') {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <ErrorState
          title="경기가 종료됐어요"
          message="경기 기록은 기존 결과 화면에서 확인해 주세요."
          back={{ href: `/team-matches/${encodeURIComponent(teamMatchId)}/result`, label: '경기 결과 보기' }}
        />
      </main>
    );
  }

  if (match.status !== 'matched' || !match.gameId) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <ErrorState
          title="경기 운영 화면을 열 수 없어요"
          message="상대팀이 확정된 뒤에 경기 운영을 시작할 수 있어요."
          back={{ href: detailHref, label: '팀매치 상세로' }}
        />
      </main>
    );
  }

  return (
    <TeamMatchOperateConsole
      gameId={match.gameId}
      teamMatchContext={{
        teamMatchId: match.id,
        gameId: match.gameId,
        status: match.status,
        isStandalone: match.league === null,
        viewerCanManageHost: canManageHost,
      }}
      resultHref={`/team-matches/${encodeURIComponent(match.id)}/result`}
    />
  );
}

function TeamMatchRulePreview({ match, teamMatchId }: { match: V1TeamMatch; teamMatchId: string }) {
  const periods = match.periods ?? [];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4 sm:px-6">
      <div className="flex flex-col gap-4">
        <Link className="tm-btn tm-btn-md tm-btn-ghost w-fit" href={`/team-matches/${encodeURIComponent(teamMatchId)}`}>
          팀매치 상세로
        </Link>
        <section aria-labelledby="team-match-rule-preview-title">
          <Card pad={16} className="flex flex-col gap-4">
            <header>
              <h1 id="team-match-rule-preview-title" className="tm-text-heading">경기 규칙 미리보기</h1>
              <p className="tm-text-caption mt-2 text-[var(--text-muted)]">상대팀 모집 중이에요. 저장된 경기 시간만 확인할 수 있어요.</p>
            </header>
            {periods.length > 0 ? (
              <ol className="flex flex-col gap-3" aria-label="저장된 경기 시간">
                {periods.map((period, index) => (
                  <li key={`${period.code}-${index}`}>
                    <InfoRow label={period.label} value={`${period.durationMinutes}분${period.extraTime ? ' · 연장 포함' : ''}`} />
                  </li>
                ))}
              </ol>
            ) : (
              <p className="tm-text-body" role="status">저장된 경기 시간 정보가 없어요.</p>
            )}
          </Card>
        </section>
      </div>
    </main>
  );
}
