'use client';

import Link from 'next/link';
import { useId } from 'react';
import { Card } from '@/components/v1-ui/primitives';
import { MyParticipationChip } from '@/components/teams/my-participation-chip';
import { TeamGameKindBadge } from '@/components/teams/team-game-kind-badge';
import { teamGameDetailHref, teamGameRosterHref } from '@/lib/team-game-links';
import { describeUpcomingGameTime } from '@/lib/upcoming-game-time';
import type { V1HomeNextGame } from '@/types/api';

/**
 * 홈 맨 위 "다음 경기" — 내 팀의 앞으로의 경기 중 가장 가까운 하나(리그·대회·친선).
 * 출전 여부는 서버가 판정해 내려 준 값(`viewerParticipating`)만 읽는다. 빠진 경기는 칩 없이 그린다.
 * 팀장·매니저는 같은 카드의 주 버튼이 "명단 확인"이 된다. 링크는 팀원이 열 수 있는 화면만 낸다.
 */
export function NextGameCard({ game, now = new Date() }: { game: V1HomeNextGame; now?: Date }) {
  const headingId = useId();
  const time = describeUpcomingGameTime(game.scheduledAt, now);
  const linkInput = { competitionKind: game.competitionKind, competitionId: game.competitionId, teamMatchId: game.teamMatchId };
  const detailHref = teamGameDetailHref(linkInput, '/home');
  const rosterHref = teamGameRosterHref({
    ...linkInput,
    teamId: game.teamId,
    gameId: game.gameId,
    rosterAvailable: game.participantCount !== null,
    canManage: game.viewerCanManage,
  });
  const title = game.opponentName !== null ? `vs ${game.opponentName}` : game.title;
  const subline = [game.opponentName !== null ? game.title : null, game.placeName].filter((part) => part !== null && part !== '').join(' · ');
  // 팀장·매니저에게는 명단을 아직 고칠 수 있다는 사실을 함께 알린다(대회·리그의 계산된 명단일 때만).
  const teamLine = [
    game.teamName,
    game.participantCount !== null ? `${game.participantCount}명 출전` : null,
    game.viewerCanManage && game.participantCount !== null ? '경기 시작 전까지 바꿀 수 있어요' : null,
  ]
    .filter((part) => part !== null)
    .join(' · ');

  // 팀장·매니저는 명단을 손보러 오고, 팀원은 경기를 확인하러 온다 — 주 버튼이 그에 맞춰 바뀐다.
  const detail = detailHref !== null ? { href: detailHref, label: '경기 상세' } : null;
  const roster = rosterHref !== null ? { href: rosterHref, label: game.viewerCanManage ? '명단 확인' : '명단 보기' } : null;
  const [primary, secondary] = (game.viewerCanManage ? [roster, detail] : [detail, roster]).filter((link) => link !== null);

  return (
    <section aria-labelledby={headingId}>
      <Card
        pad={16}
        // 지면에 색을 까므로 그 위 보조 텍스트를 함께 올린다(globals.css .tm-on-tint).
        className="tm-on-tint"
        style={{ background: 'var(--tint-blue)', border: '1px solid var(--tint-blue-border)', minWidth: 0, marginBottom: 16 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="tm-text-caption-strong" style={{ color: 'var(--blue700)' }}>다음 경기</span>
          {time?.countdown ? (
            <span className="tm-badge tm-badge-blue tm-badge-sm" style={{ background: 'var(--surface)', color: 'var(--blue700)' }}>
              {time.countdown}
            </span>
          ) : null}
          {time ? (
            <span className="tm-text-label tab-num" style={{ marginLeft: 'auto', color: 'var(--text-strong)' }}>{time.when}</span>
          ) : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <h2 id={headingId} className="tm-text-body-lg" style={{ margin: 0, minWidth: 0, overflowWrap: 'anywhere' }}>{title}</h2>
          <TeamGameKindBadge kind={game.competitionKind} />
        </div>
        {subline !== '' ? <div className="tm-text-caption" style={{ marginTop: 2 }}>{subline}</div> : null}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          {game.viewerParticipating ? <MyParticipationChip /> : null}
          <span className="tm-text-caption">{teamLine}</span>
        </div>

        {primary !== undefined ? (
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Link className="tm-btn tm-btn-sm tm-btn-primary" href={primary.href} style={{ flex: 1 }}>
              {primary.label}
            </Link>
            {secondary !== undefined ? (
              <Link className="tm-btn tm-btn-sm tm-btn-outline" href={secondary.href}>
                {secondary.label}
              </Link>
            ) : null}
          </div>
        ) : null}
      </Card>
    </section>
  );
}
