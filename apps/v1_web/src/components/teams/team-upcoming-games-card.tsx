'use client';

import Link from 'next/link';
import { Card, SectionTitle } from '@/components/v1-ui/primitives';
import { useV1TeamUpcomingGames, type V1GameRosterSummary, type V1TeamUpcomingGame } from '@/hooks/use-v1-api';
import { formatTournamentDateTimeShort } from '@/lib/date-utils';
import { teamGameDetailHref, teamGameRosterHref } from '@/lib/team-game-links';
import { MyParticipationChip } from './my-participation-chip';
import { TeamGameKindBadge } from './team-game-kind-badge';

/**
 * 팀 상세의 "다가오는 경기" — 경기마다 명단 상태와 경기 상세·명단·전술 입구(Task 179 팀 A, Task 180 G7).
 * 대회·리그는 계산된 경기 명단 요약 → 경기 명단 화면, 친선은 참석명단 제출 여부 → 참석명단(팀장·매니저만).
 * 팀원도 경기 상세와 대회·리그 명단을 보기 전용으로 연다. 출전하는 경기에만 "내 출전" 칩(서버 판정).
 *
 * 이 목록이 따로 있는 이유: `팀 일정`(V1TeamSchedule)은 팀이 직접 만드는 캘린더라 대회
 * 경기가 들어오지 않는다. 알려진 한계: 서버가 **앞으로의 경기만** 모은다.
 */
/** 경기 명단 화면의 "우리 팀 다른 경기" 링크가 여기로 온다(`/teams/:id#…`). */
export const TEAM_UPCOMING_GAMES_ANCHOR = 'team-upcoming-games';

export function TeamUpcomingGamesCard({ teamId, canManageRosters }: { teamId: string; canManageRosters: boolean }) {
  const query = useV1TeamUpcomingGames(teamId);
  const items = query.data?.items ?? [];

  // 아직 잡힌 경기가 없으면 섹션 자체를 띄우지 않는다 — 팀 상세는 이미 길고, 빈 카드가
  // 하나 더 늘어나는 것보다 조용한 편이 낫다. 조회 실패도 마찬가지다(이 목록은 지름길이라
  // 실패했다고 팀 상세에 에러를 띄울 이유가 없다).
  if (query.isLoading || query.isError || items.length === 0) return null;

  return (
    <>
      <SectionTitle id={TEAM_UPCOMING_GAMES_ANCHOR} title="다가오는 경기" sub="팀장·매니저만 명단을 바꿀 수 있어요." />
      <Card pad={16} style={{ paddingTop: 4, paddingBottom: 4 }}>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {items.map((game, index) => (
            <li
              key={game.gameId}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: '12px 0',
                borderBottom: index === items.length - 1 ? 'none' : '1px solid var(--border)',
              }}
            >
              <UpcomingGameRow teamId={teamId} game={game} canManageRosters={canManageRosters} />
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function UpcomingGameRow({
  teamId,
  game,
  canManageRosters,
}: {
  teamId: string;
  game: V1TeamUpcomingGame;
  canManageRosters: boolean;
}) {
  const title = game.opponentName !== null ? `vs ${game.opponentName}` : game.title;
  const status = rosterStatus(game);
  const links = rowLinks(teamId, game, canManageRosters);

  return (
    <>
      <div style={rowLineStyle}>
        <span className="tm-text-label" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
          {title}
        </span>
        <TeamGameKindBadge kind={game.competitionKind} />
      </div>
      <span className="tm-text-caption">
        {formatTournamentDateTimeShort(game.scheduledAt) ?? '시간 미정'}
        {game.opponentName !== null ? ` · ${game.title}` : ''}
      </span>
      <div style={{ ...rowLineStyle, flexWrap: 'wrap' }}>
        {/* 출전하는 경기에만 칩을 단다. 빠진 경기에는 아무 표시도 두지 않는다(행을 열면 명단에서 확인). */}
        {game.viewerParticipating ? <MyParticipationChip /> : null}
        <span className="tm-text-caption" style={{ fontWeight: 700, color: STATUS_COLOR[status.tone] }}>
          {status.text}
        </span>
      </div>
      {/* 행마다 보조 버튼 — 미제출은 주황 상태 글자로 알린다(화면의 주 CTA 는 하나). */}
      <div style={{ display: 'grid', gridTemplateColumns: `${'1fr '.repeat(links.length)}auto`, gap: 6 }}>
        {links.map((link) => (
          <Link key={link.label} className="tm-btn tm-btn-sm tm-btn-outline" href={link.href} aria-label={`${title} ${link.label}`}>
            {link.label}
          </Link>
        ))}
        <Link
          className="tm-btn tm-btn-sm tm-btn-neutral"
          href={`/teams/${teamId}/tactics/${game.gameId}`}
          aria-label={`${title} 전술`}
        >
          전술
        </Link>
      </div>
    </>
  );
}

type StatusTone = 'ok' | 'warn' | 'muted';

const STATUS_COLOR: Record<StatusTone, string> = {
  ok: 'var(--green700)',
  warn: 'var(--orange700)',
  muted: 'var(--text-caption)',
};

function rosterStatus(game: V1TeamUpcomingGame): { text: string; tone: StatusTone } {
  if (game.competitionKind === 'FRIENDLY') {
    // "참석명단 제출"은 할 일(버튼 이름)로도 읽혀 완료 상태가 흐렸다(L15) — 상태는 "제출 완료 / 제출 전".
    return game.lineupState === 'DONE'
      ? { text: '참석명단 제출 완료', tone: 'ok' }
      : { text: '참석명단 제출 전', tone: 'warn' };
  }
  if (game.rosterSummary === null) return { text: '참가 명단 확정 전', tone: 'muted' };
  return { text: formatRosterSummary(game.rosterSummary), tone: 'ok' };
}

/** "10명 출전 · 1명 빠짐 · 결장 1명 · 출전정지 1명" — 0 인 항목은 뺀다. */
export function formatRosterSummary(summary: V1GameRosterSummary): string {
  const parts = [`${summary.participating}명 출전`];
  if (summary.excluded > 0) parts.push(`${summary.excluded}명 빠짐`);
  if (summary.unavailable > 0) parts.push(`결장 ${summary.unavailable}명`);
  if (summary.suspended > 0) parts.push(`출전정지 ${summary.suspended}명`);
  return parts.join(' · ');
}

/**
 * 경기 상세는 누구나, 명단은 열 수 있는 사람에게만 낸다(`lib/team-game-links.ts` 가 홈 카드와 같은 규칙을 쥔다).
 * 팀장·매니저의 명단 버튼은 고치러 가는 입구라 "명단"·"참석명단", 팀원은 보기 전용이라 "명단 보기"다.
 */
function rowLinks(teamId: string, game: V1TeamUpcomingGame, canManage: boolean): { href: string; label: string }[] {
  const target = { competitionKind: game.competitionKind, competitionId: game.tournamentId, teamMatchId: game.teamMatchId };
  const detail = teamGameDetailHref(target, `/teams/${teamId}`);
  const roster = teamGameRosterHref({
    ...target,
    teamId,
    gameId: game.gameId,
    rosterAvailable: game.rosterSummary !== null,
    canManage,
  });
  const rosterLabel = !canManage ? '명단 보기' : game.competitionKind === 'FRIENDLY' ? '참석명단' : '명단';
  return [
    ...(detail !== null ? [{ href: detail, label: '경기 상세' }] : []),
    ...(roster !== null ? [{ href: roster, label: rosterLabel }] : []),
  ];
}

const rowLineStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 };
