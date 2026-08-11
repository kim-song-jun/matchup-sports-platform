'use client';

import Link from 'next/link';
import { Card } from '@/components/v1-ui/primitives';
import { TeamAvatar } from '@/components/v1-ui/team-avatar';

/**
 * §순위표 지표 통일 — 같은 대회 `/bracket` 화면의 두 탭(순위·대진표 탭의
 * GroupStandingsSection/LeagueStandingsSection, 경기 일정 탭의 옛
 * schedule-content.tsx StandingsTable)이 같은 순위 데이터를 서로 다른
 * 컬럼(승점+득실 vs 승/무/패+승점)으로 그려서, 탭만 바꿔도 같은 팀 성적이
 * 다르게 읽혔다. 이 컴포넌트가 그 두 표시 로직을 하나로 합친 유일한 구현이다.
 *
 * 컬럼 구성 근거(#순위표-지표-통일 과제 지시대로 "사람들이 실제 확인하는 것"
 * 기준으로 골랐다):
 *   - 순위·팀·승점 = 핵심 3(이 표를 보는 이유 그 자체 — 몇 위, 어느 팀, 몇 점).
 *   - 승/무/패와 득실 중 득실만 남겼다. 축구식 대회 표에서 승점 다음 1순위
 *     동률 판정 기준은 골득실(GD)이지 승/무/패 그 자체가 아니고, 승/무/패는
 *     이미 승점 계산에 반영된 값이라 승점 옆에 다시 풀어 적으면 같은 정보를
 *     두 번 보여주는 셈이다. 표시 폭도 결정적이었다: "+2" 같은 부호 있는
 *     한 자리~세 자리 숫자는 "1승 0무 0패"(최대 11자) 텍스트보다 훨씬 덜
 *     차지해서, 390px 표(minWidth 240)에 4번째 컬럼으로 넣어도 줄바꿈 없이
 *     들어간다(기존 bracket-page-client 구현이 이 폭에서 이미 검증돼 있었다).
 *   → 최종 컬럼: #(순위) · 팀 · 승점 · 득실, 4개를 폭에 상관없이 항상 그대로
 *     보여준다. 컬럼을 폭별로 접거나 늘리지 않은 이유: 순위·대진표 탭과 경기
 *     일정 탭을 오가며 컬럼 수 자체가 바뀌면 "다른 표"처럼 보여 이 과제가
 *     고치려는 문제(탭마다 다른 표)를 폭 축에서 재현하게 된다.
 */
export interface TournamentStandingsRow {
  /** React key — registrationId(대회 등록 단위)가 있으면 그걸, 없으면 teamId. */
  readonly key: string;
  readonly teamId: string;
  readonly teamName: string;
  readonly teamLogoUrl?: string | null;
  readonly position: number;
  readonly points: number;
  readonly goalsFor: number;
  readonly goalsAgainst: number;
}

function StandingRankBadge({ pos, advance }: { pos: number; advance: number | null }) {
  const promoted = advance !== null && pos <= advance;
  if (pos === 1) return <span className="tm-standings-rank tm-standings-rank-gold">{pos}</span>;
  if (pos === 2) return <span className="tm-standings-rank tm-standings-rank-silver">{pos}</span>;
  if (pos === 3) return <span className="tm-standings-rank tm-standings-rank-bronze">{pos}</span>;
  return (
    <span
      className="tm-standings-rank"
      style={promoted ? { background: 'var(--blue50)', color: 'var(--blue500)' } : undefined}
    >
      {pos}
    </span>
  );
}

function GoalDiff({ gf, ga }: { gf: number; ga: number }) {
  const diff = gf - ga;
  const color = diff > 0 ? 'var(--blue500)' : diff < 0 ? 'var(--red, #ff4d4f)' : 'var(--text-muted)';
  return (
    <span style={{ color, fontWeight: diff !== 0 ? 700 : 400 }}>
      {diff > 0 ? '+' : ''}{diff}
    </span>
  );
}

/**
 * `advance`는 §B-7 진출 게이트("그 조의 조별리그가 실제로 끝난 뒤에만 진출
 * 배지·하이라이트를 보여준다")를 이미 반영해 호출측이 계산해서 넘긴다 — 이
 * 컴포넌트 자체는 게이트를 판단하지 않고 받은 값 그대로 하이라이트만 한다
 * (게이트 로직이 두 곳에 중복되는 걸 막기 위해). `null`이면 진출선 표시
 * 자체가 없는 표(리그 최종 순위, 경기 일정 탭의 조별 순위)다.
 *
 * 팀명은 항상 `/teams/:teamId/records`(팀 전적) 링크로 렌더한다 — 최근 추가된
 * 리그레션 방지 대상 기능이라 이 표시 로직 안에 고정해 두 소비처 모두에서
 * 자동으로 보존되게 했다.
 */
export function TournamentStandingsTable({
  rows,
  advance,
  ariaLabel,
  emptyMessage = '순위 집계 전이에요',
}: {
  rows: readonly TournamentStandingsRow[];
  advance: number | null;
  ariaLabel: string;
  emptyMessage?: string;
}) {
  const sorted = [...rows].sort((a, b) => a.position - b.position);

  return (
    <Card pad={0}>
      <div style={{ overflowX: 'auto' }}>
        <table className="tm-standings-table" aria-label={ariaLabel} style={{ minWidth: 240 }}>
          <thead className="tm-standings-thead">
            <tr>
              <th style={{ width: 36, paddingLeft: 12 }}>#</th>
              <th>팀</th>
              <th className="num" style={{ width: 44 }}>승점</th>
              <th className="num" style={{ width: 44, paddingRight: 12 }}>득실</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length > 0 ? (
              sorted.map((row) => (
                <tr
                  key={row.key}
                  className={`tm-standings-row${advance !== null && row.position <= advance ? ' tm-standings-row-highlight' : ''}`}
                >
                  <td style={{ paddingLeft: 12 }}>
                    <StandingRankBadge pos={row.position} advance={advance} />
                  </td>
                  <td>
                    <Link
                      href={`/teams/${row.teamId}/records`}
                      className="tm-pressable"
                      style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, textDecoration: 'none', color: 'inherit' }}
                    >
                      <TeamAvatar seed={row.teamId} name={row.teamName} logoUrl={row.teamLogoUrl ?? null} size="sm" />
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>
                        {row.teamName}
                      </span>
                    </Link>
                  </td>
                  <td className="num" style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-strong)' }}>
                    {row.points}점
                  </td>
                  <td className="num" style={{ paddingRight: 12 }}>
                    <GoalDiff gf={row.goalsFor} ga={row.goalsAgainst} />
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--text-caption)', fontSize: 13 }}>
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
