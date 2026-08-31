'use client';

import Link from 'next/link';
import { Card, SectionTitle } from '@/components/v1-ui/primitives';
import { ChevronRightIcon } from '@/components/v1-ui/icons';
import { useV1TeamUpcomingGames } from '@/hooks/use-v1-api';
import { formatTournamentDateTimeShort } from '@/lib/date-utils';

/**
 * 팀 상세의 "다가오는 경기" — 전술보드로 들어가는 입구.
 *
 * 이 목록이 따로 있는 이유: `팀 일정`(V1TeamSchedule)은 팀이 직접 만드는 캘린더라 대회
 * 경기가 들어오지 않는다. 전술보드는 경기(V1Game)에 매달려 있고 그 경기는 대회 픽스처나
 * 팀매치에서만 생기므로, 그 둘을 팀 기준으로 모아 주는 목록이 필요하다.
 *
 * 알려진 한계: 서버가 **앞으로의 경기만** 모은다 — 끝난 경기의 전술보드는 여기서 열 수 없다.
 */
export function TeamUpcomingGamesCard({ teamId }: { teamId: string }) {
  const query = useV1TeamUpcomingGames(teamId);
  const items = query.data?.items ?? [];

  // 아직 잡힌 경기가 없으면 섹션 자체를 띄우지 않는다 — 팀 상세는 이미 길고, 빈 카드가
  // 하나 더 늘어나는 것보다 조용한 편이 낫다. 조회 실패도 마찬가지다(전술보드는 이
  // 화면의 본론이 아니라 지름길이라, 실패했다고 팀 상세에 에러를 띄울 이유가 없다).
  if (query.isLoading || query.isError || items.length === 0) return null;

  return (
    <>
      <SectionTitle title="다가오는 경기" sub="경기마다 우리 팀 전술을 짜 둘 수 있어요." />
      <Card pad={16}>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {items.map((game, index) => (
            <li
              key={game.gameId}
              style={{
                borderBottom: index === items.length - 1 ? 'none' : '1px solid var(--border)',
              }}
            >
              <Link
                className="tm-pressable"
                href={`/teams/${teamId}/tactics/${game.gameId}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 0',
                  minHeight: 44,
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <div style={{ minWidth: 0, flex: '1 1 auto' }}>
                  <div className="tm-text-label" style={{ overflowWrap: 'anywhere' }}>
                    {game.opponentName !== null ? `vs ${game.opponentName}` : game.title}
                  </div>
                  <div className="tm-text-caption" style={{ marginTop: 4 }}>
                    {formatTournamentDateTimeShort(game.scheduledAt) ?? '시간 미정'}
                    {game.opponentName !== null ? ` · ${game.title}` : ''}
                  </div>
                </div>
                <span className="tm-text-caption" style={{ flex: '0 0 auto', color: 'var(--blue700)', fontWeight: 700 }}>
                  전술보드
                </span>
                <ChevronRightIcon size={18} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
