'use client';

import Link from 'next/link';
import { Fragment, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card } from '@/components/v1-ui/primitives';
import { TeamAvatar } from '@/components/v1-ui/team-avatar';

/**
 * §순위표 지표 통일 — 같은 대회 `/bracket` 화면의 두 탭(순위·대진표 탭의
 * GroupStandingsSection/LeagueStandingsSection, 경기 일정 탭의 옛
 * schedule-content.tsx StandingsTable)이 같은 순위 데이터를 서로 다른
 * 컬럼(승점+득실 vs 승/무/패+승점)으로 그려서, 탭만 바꿔도 같은 팀 성적이
 * 다르게 읽혔다. 이 컴포넌트가 그 두 표시 로직을 하나로 합친 유일한 구현이다.
 *
 * 컬럼 구성: #(순위) · 팀 · 전적 · 승점 · 득실.
 *
 * 전적(승-무-패)은 한때 뺐다가 되살렸다. 뺐던 근거는 "승/무/패는 이미 승점에
 * 반영됐으니 중복"이었는데, 오너가 실제 화면을 보고 "전적하고 승점 득실까지 다
 * 나와야지 테이블이 잘못되었다"고 판단했다 — 순위표를 읽는 사람은 승점만이 아니라
 * "몇 경기 해서 어떻게 됐는지"를 같이 본다. 승점은 결과의 요약이지 경기 수를
 * 알려주지 않는다(3점이 1승인지 3무인지 구분되지 않는다).
 *
 * 다만 "1승 0무 0패"(최대 11자)를 그대로 쓰면 390px 에서 팀명을 밀어낸다. 그래서
 * 스포츠 표의 관용 표기인 `1-0-0` 으로 압축하고, 스크린리더에는 aria-label 로 풀어
 * 읽힌다. 컬럼 수는 폭에 상관없이 항상 5개로 고정한다 — 탭이나 폭에 따라 컬럼이
 * 접히면 "다른 표"처럼 보여, 이 컴포넌트가 애초에 없애려던 문제(탭마다 다른 표)를
 * 폭 축에서 재현하게 된다.
 */
export interface TournamentStandingsRow {
  /** React key — registrationId(대회 등록 단위)가 있으면 그걸, 없으면 teamId. */
  readonly key: string;
  /**
   * 참가팀 공개 정책 통일(fix/v1-publish) — teamId/teamName은 모집 중(open)이고
   * 조회자가 운영자·스태프가 아니면 둘 다 null이다. teamName===null을 "비공개"의
   * 단일 판정 기준으로 쓴다(별도 boolean 플래그를 추가하지 않는다).
   */
  readonly teamId: string | null;
  readonly teamName: string | null;
  readonly teamLogoUrl?: string | null;
  readonly position: number;
  readonly points: number;
  readonly wins: number;
  readonly draws: number;
  readonly losses: number;
  readonly goalsFor: number;
  readonly goalsAgainst: number;
}

/**
 * `unranked`는 아직 한 경기도 집계되지 않은 표(전 팀 0점·0경기)에서 켜진다. 그때
 * 1·2·3위에 금·은·동을 칠하면 "조 편성 순서"일 뿐인 숫자가 성적처럼 읽힌다(#374).
 * 색만 빼고 번호는 그대로 남겨 순서 정보는 유지하되, 없는 성적을 색으로 만들어내지
 * 않는다. 안내 문구는 표 하단에 텍스트로 함께 붙는다(색만으로 상태를 구분하지 않음).
 */
function StandingRankBadge({ pos, advance, unranked }: { pos: number; advance: number | null; unranked: boolean }) {
  const promoted = advance !== null && pos <= advance;
  if (!unranked) {
    if (pos === 1) return <span className="tm-standings-rank tm-standings-rank-gold">{pos}</span>;
    if (pos === 2) return <span className="tm-standings-rank tm-standings-rank-silver">{pos}</span>;
    if (pos === 3) return <span className="tm-standings-rank tm-standings-rank-bronze">{pos}</span>;
  }
  return (
    <span
      className="tm-standings-rank"
      style={promoted && !unranked ? { background: 'var(--blue50)', color: 'var(--blue700)' } : undefined}
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
 * `renderDetail`을 주면 팀 행이 **링크 대신 펼침 토글**이 되고, 펼친 내용이 그 행
 * 바로 아래에 붙는다. 오너 지시: "각 클릭했을 때 그 팀의 경기 상세 페이지로
 * 넘어가는 것보다 하단에 그 내용 상세를 보여주는 게 더 좋을 것 같고". 순위표에서
 * 팀을 눌렀을 때 화면이 통째로 바뀌면 방금 보던 순위 맥락을 잃는다.
 * 주지 않으면 기존대로 `/teams/:teamId/records` 링크를 유지한다(전적 페이지로
 * 가는 경로가 필요한 소비처를 깨뜨리지 않기 위해).
 */
export function TournamentStandingsTable({
  rows,
  advance,
  ariaLabel,
  emptyMessage = '순위 집계 전이에요',
  renderDetail,
}: {
  rows: readonly TournamentStandingsRow[];
  advance: number | null;
  ariaLabel: string;
  emptyMessage?: string;
  renderDetail?: (row: TournamentStandingsRow) => ReactNode;
}) {
  const sorted = [...rows].sort((a, b) => a.position - b.position);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const COLUMN_COUNT = 5;
  /**
   * "아직 한 경기도 집계되지 않았다"는 행 값만으로 정확히 판별된다 — 경기가 한 건이라도
   * 집계되면 최소 한 팀은 승/무/패 중 하나가 1 이상이 되기 때문에, 전 행이 전 지표 0이면
   * 집계된 경기가 0건이다. API에 별도 플래그를 새로 얹지 않고 이 규칙 하나로 두 소비처
   * (순위·대진표 탭의 조별/리그 순위, 경기 일정 탭의 조별 순위)를 함께 덮는다.
   */
  const unranked =
    sorted.length > 0 &&
    sorted.every(
      (row) =>
        row.points === 0 &&
        row.wins === 0 &&
        row.draws === 0 &&
        row.losses === 0 &&
        row.goalsFor === 0 &&
        row.goalsAgainst === 0,
    );

  return (
    <Card pad={0}>
      <div style={{ overflowX: 'auto' }}>
        <table className="tm-standings-table" aria-label={ariaLabel} style={{ minWidth: 296 }}>
          <thead className="tm-standings-thead">
            <tr>
              <th style={{ width: 36, paddingLeft: 12 }}>#</th>
              <th>팀</th>
              <th className="num" style={{ width: 56 }}>전적</th>
              <th className="num" style={{ width: 44 }}>승점</th>
              <th className="num" style={{ width: 44, paddingRight: 12 }}>득실</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length > 0 ? (
              sorted.map((row) => {
                const expanded = expandedKey === row.key;
                // 참가팀 공개 정책 통일(fix/v1-publish) — teamName===null이 "이 팀은
                // 모집 중이라 비공개"의 단일 판정 기준(별도 boolean을 두지 않는다).
                // teamId도 null이므로 seed는 항상 채워지는 row.key(registrationId)로
                // 대신한다 — TeamAvatar의 identicon이 팀마다 달라 보여야 하는데
                // teamId가 전부 null이면 모든 비공개 팀이 같은 무늬로 뭉친다.
                const isHidden = row.teamName === null;
                const teamCell = (
                  <>
                    <TeamAvatar
                      seed={row.teamId ?? row.key}
                      name={isHidden ? '참가팀 비공개' : row.teamName}
                      logoUrl={isHidden ? null : (row.teamLogoUrl ?? null)}
                      size="sm"
                    />
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: isHidden ? 500 : 600,
                        color: isHidden ? 'var(--text-caption)' : 'var(--text-strong)',
                      }}
                    >
                      {isHidden ? '참가팀 비공개' : row.teamName}
                    </span>
                  </>
                );
                const cellStyle = {
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  minHeight: 44,
                  textDecoration: 'none',
                  color: 'inherit',
                } as const;
                return (
                  <Fragment key={row.key}>
                    <tr
                      className={`tm-standings-row${advance !== null && row.position <= advance ? ' tm-standings-row-highlight' : ''}`}
                    >
                      <td style={{ paddingLeft: 12 }}>
                        <StandingRankBadge pos={row.position} advance={advance} unranked={unranked} />
                      </td>
                      <td>
                        {isHidden ? (
                          // 팀명이 가려지면 링크/펼침 둘 다 의미가 없다 — /teams/null 같은
                          // 깨진 링크나(row.teamId===null), 펼쳐도 어느 팀인지 특정 못 하는
                          // 토글을 만들지 않는다. 비공개 상태는 그냥 정적 행이다.
                          <div style={cellStyle}>{teamCell}</div>
                        ) : renderDetail ? (
                          <button
                            type="button"
                            className="tm-pressable"
                            aria-expanded={expanded}
                            onClick={() => setExpandedKey(expanded ? null : row.key)}
                            style={{ ...cellStyle, width: '100%', background: 'none', border: 'none', padding: 0, textAlign: 'left' }}
                          >
                            {teamCell}
                            <ChevronDown
                              size={14}
                              aria-hidden="true"
                              style={{
                                marginLeft: 'auto',
                                color: 'var(--text-caption)',
                                transform: expanded ? 'rotate(180deg)' : undefined,
                                transition: 'transform 120ms ease',
                              }}
                            />
                          </button>
                        ) : (
                          <Link href={`/teams/${row.teamId}/records`} className="tm-pressable" style={cellStyle}>
                            {teamCell}
                          </Link>
                        )}
                      </td>
                      {/* 전적은 `1-0-0`(승-무-패) 압축 표기 — 폭 근거는 파일 상단 주석 참조.
                          숫자만 보면 순서를 알 수 없으므로 스크린리더에는 풀어서 읽힌다. */}
                      <td
                        className="num tab-num"
                        style={{ fontSize: 12, color: 'var(--text-muted)' }}
                        aria-label={`${row.wins}승 ${row.draws}무 ${row.losses}패`}
                      >
                        {row.wins}-{row.draws}-{row.losses}
                      </td>
                      <td className="num" style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-strong)' }}>
                        {row.points}점
                      </td>
                      <td className="num" style={{ paddingRight: 12 }}>
                        <GoalDiff gf={row.goalsFor} ga={row.goalsAgainst} />
                      </td>
                    </tr>
                    {renderDetail && expanded ? (
                      <tr className="tm-standings-detail-row">
                        <td colSpan={COLUMN_COUNT} style={{ padding: '0 12px 12px' }}>
                          {renderDetail(row)}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            ) : (
              <tr>
                <td colSpan={COLUMN_COUNT} style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--text-caption)', fontSize: 13 }}>
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {/* 집계 전 표는 숫자가 전부 0이라 "데이터가 안 들어온 건지" 헷갈린다. 순위가 아직
          정해지지 않았다는 사실을 색이 아니라 문장으로 명시한다. */}
      {unranked ? (
        <div
          style={{
            padding: '10px 12px',
            borderTop: '1px solid var(--grey100)',
            fontSize: 12,
            color: 'var(--text-caption)',
          }}
        >
          아직 경기 기록이 없어요. 첫 결과가 등록되면 순위가 매겨져요.
        </div>
      ) : null}
    </Card>
  );
}
