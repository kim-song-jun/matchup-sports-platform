'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useV1LeagueMatch, useV1LeagueMatchStandings, useV1ResolveChatRoom, useV1TeamMatch } from '@/hooks/use-v1-api';
import { usePublicLeagueFixtureRecord } from '@/components/public-game-records/use-public-game-records';
import { MatchDetailContent } from '@/components/public-game-records/match-detail-content';
import { AttestRequestsSection } from '@/components/public-game-records/attest-requests';
import { LeagueClaimMyRecordSection } from '@/components/public-game-records/claim-my-record';
import { Card, ErrorState } from '@/components/v1-ui/primitives';
import { TeamAvatar } from '@/components/v1-ui/team-avatar';
import { extractErrorMessage } from '@/lib/error-message';
import { V1ApiError } from '@/lib/api-client';
import { LEAGUE_STATE_META } from '@/lib/league-state-meta';
import { formatTournamentDateTimeLong, formatTournamentDateTimeShort } from '@/lib/date-utils';
import { fixtureResultLabel, fixtureStatusMeta } from '@/lib/league-fixture-meta';
import type { V1TeamMatch, V1TeamMatchViewerState } from '@/types/api';
import type { V1LeagueFixture, V1LeagueStandingRow } from '@/types/league-match';

/**
 * 리그 경기 상세 — 리그 일정에서 경기를 누르면 오는 화면.
 *
 * 그전까지 이 클릭은 친선 팀매치 상세(/team-matches/:id)로 갔다. 리그 대진은 데이터
 * 모델상 팀매치 레코드 그대로라 라우팅 자체는 맞았지만, 그 화면은 "상대팀 모집 → 신청
 * → 승인" 프레임이라 상대가 이미 확정된 리그 경기에서는 상대팀 이름 자리에 신청
 * 상태("승인 완료")가 뜨고 주차·스코어·순위 같은 리그 문맥이 전혀 없었다(2026-08-25
 * 사용자 보고, B안 확정). 이 화면은 관전자 우선으로 리그 문맥을 보여주고, 참가팀에게만
 * 채팅·라인업·결과 통로를 얹는다. /team-matches/:id 는 리그 대진이면 서버에서 여기로
 * 리다이렉트한다(알림 딥링크 호환).
 */

/**
 * 주차 라벨 — 공개 fixture 응답에는 round 필드가 없다(어드민 preview 전용). 리그 대진은
 * 주 단위 템플릿으로 일괄 생성되므로(V1GenerateLeagueFixturesPayload.weeksCount) KST
 * 기준 "몇 번째 경기 날짜인가"가 곧 주차다. 같은 날 여러 라운드를 몰아넣은 QA 시드류
 * 데이터에서는 어긋날 수 있어 단정 표기 대신 보조 정보로만 싣는다.
 */
const KST_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' });

function roundLabel(fixtures: V1LeagueFixture[], target: V1LeagueFixture): string | null {
  const days = [...new Set(fixtures.map((fixture) => KST_DAY.format(new Date(fixture.startAt))))].sort();
  const index = days.indexOf(KST_DAY.format(new Date(target.startAt)));
  return index >= 0 ? `${index + 1}주차` : null;
}

function recordLine(row: V1LeagueStandingRow | undefined): string | null {
  if (!row) return null;
  // 아직 한 경기도 안 치른 팀의 "N위"는 동점자 사전순 폴백이라 순위 정보가 아니다 —
  // 순위표 화면(ParticipantTeamList 분기)과 같은 이유로 전적이 생기기 전엔 숨긴다.
  if (row.played === 0) return null;
  return `${row.position}위 · ${row.wins}승 ${row.draws}무 ${row.losses}패`;
}

function TeamSide({ teamId, name, logoUrl, record, align }: {
  teamId: string | null;
  name: string;
  logoUrl: string | null;
  record: string | null;
  align: 'left' | 'right';
}) {
  const body = (
    <span className={`flex flex-col gap-2 ${align === 'right' ? 'items-end text-right' : 'items-start text-left'}`}>
      <TeamAvatar seed={teamId ?? name} name={name} logoUrl={logoUrl} size="md" />
      <span className="tm-text-body-lg text-[var(--text-strong)]">{name}</span>
      {record ? <span className="text-xs text-[var(--text-muted)]">{record}</span> : null}
    </span>
  );
  // 상대 미정(부전 등)은 링크로 감싸지 않는다 — 빈 링크는 키보드 포커스만 먹는다
  // (standings 화면 TeamNameLink와 같은 규칙).
  if (teamId === null) return body;
  return (
    <Link href={`/teams/${teamId}`} className="tm-pressable flex min-h-[44px] flex-1" aria-label={`${name} 팀 상세로 이동`}>
      {body}
    </Link>
  );
}

/**
 * team-matches-client.tsx getViewerState 와 같은 판정. 함수 경계로 두는 이유: 값 표현식을
 * 그대로 const 에 담으면 TS 대입 내로잉이 viewer.state/viewerState 교차 유니온('host_team'
 * 없음)으로 다시 좁혀 'host_team' 비교가 TS2367 로 죽는다 — 선언된 반환 타입이 그 내로잉을
 * 지운다.
 */
function getViewerState(match: V1TeamMatch | undefined): V1TeamMatchViewerState {
  return match?.viewer?.state ?? match?.viewerState ?? 'none';
}

export default function LeagueFixtureDetailClient({ leagueId, fixtureId }: { leagueId: string; fixtureId: string }) {
  const router = useRouter();
  const seriesQuery = useV1LeagueMatch(leagueId);
  const standingsQuery = useV1LeagueMatchStandings(leagueId);
  // 참가팀 여부(채팅·라인업 통로)만을 위해 쓴다 — 실패해도 관전 화면은 그대로 뜬다.
  const teamMatchQuery = useV1TeamMatch(fixtureId);
  // 대회 경기 상세와 동일한 게임 프로젝션(스코어·득점/카드 타임라인·라인업·승부차기·
  // 몰수 사유·MVP·정정 이력·라이브 폴링). 404(게임 미공개/숨김)면 아래 자체 요약
  // 카드로 폴백하므로 이 실패는 화면 오류가 아니다.
  const recordQuery = usePublicLeagueFixtureRecord(leagueId, fixtureId);
  const resolveChatRoom = useV1ResolveChatRoom();
  const [chatError, setChatError] = useState('');

  const series = seriesQuery.data;
  const standings = standingsQuery.data;

  const fixture = useMemo(
    () => series?.fixtures.find((item) => item.teamMatchId === fixtureId) ?? null,
    [series, fixtureId],
  );

  const rowByTeam = useMemo(() => {
    const map = new Map<string, V1LeagueStandingRow>();
    for (const row of standings?.standings ?? []) map.set(row.teamId, row);
    return map;
  }, [standings]);

  // 이 리그 안에서 같은 두 팀이 붙은 다른 대진(맞대결 기록). 취소 대진은 순위표와
  // 동일하게 집계에서 제외한다.
  const headToHead = useMemo(() => {
    if (!series || !fixture || fixture.awayTeamId === null) return [];
    const pair = new Set([fixture.homeTeamId, fixture.awayTeamId]);
    return series.fixtures
      .filter((item) =>
        item.teamMatchId !== fixture.teamMatchId &&
        item.awayTeamId !== null &&
        pair.has(item.homeTeamId) &&
        pair.has(item.awayTeamId) &&
        item.status !== 'cancelled' &&
        typeof item.homeScore === 'number' &&
        typeof item.awayScore === 'number')
      .sort((a, b) => (a.startAt < b.startAt ? 1 : -1))
      .slice(0, 3);
  }, [series, fixture]);

  if (seriesQuery.isError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <ErrorState
          message={extractErrorMessage(seriesQuery.error, '리그 경기 정보를 불러오지 못했어요.')}
          onRetry={() => void seriesQuery.refetch()}
        />
      </div>
    );
  }

  if (series === undefined) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <div className="tm-skeleton" style={{ height: 24, borderRadius: 'var(--radius-chip)' }} />
        <div className="tm-skeleton" style={{ height: 180, borderRadius: 'var(--radius-container)' }} />
        <div className="tm-skeleton" style={{ height: 120, borderRadius: 'var(--radius-control)' }} />
      </div>
    );
  }

  if (fixture === null) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <ErrorState message="이 리그에서 해당 경기를 찾을 수 없어요. 대진이 재생성되었을 수 있어요." />
        <Link href={`/league-matches/${leagueId}`} className="tm-btn tm-btn-lg tm-btn-neutral mt-4 w-full">
          리그 순위표·일정으로 이동
        </Link>
      </div>
    );
  }

  const stateMeta = LEAGUE_STATE_META[series.state];
  const statusMeta = fixtureStatusMeta(fixture.status);
  const result = fixtureResultLabel(fixture);
  const round = roundLabel(series.fixtures, fixture);
  const homeRow = rowByTeam.get(fixture.homeTeamId);
  const awayRow = fixture.awayTeamId !== null ? rowByTeam.get(fixture.awayTeamId) : undefined;
  const homeName = homeRow?.teamName ?? '홈팀 정보 없음';
  const awayName = fixture.awayTeamId === null ? '상대팀 미정' : awayRow?.teamName ?? '상대팀 정보 없음';

  const viewerState = getViewerState(teamMatchQuery.data);
  // 리그 대진의 신청서는 운영자가 일괄 생성한다 — away 팀 팀장은 '신청서를 낸 사람'이
  // 아니라서 viewerState 가 'approved' 가 되지 않는다(alpha 실측: A팀 팀장인데 카드
  // 미노출). 결과 승인 게이트가 쓰는 manageableHostTeam/manageableOpponentTeam 과
  // 참가팀 멤버 판정(participantMember)을 함께 본다.
  const viewer = teamMatchQuery.data?.viewer;
  const isParticipant =
    viewerState === 'host_team' ||
    viewerState === 'approved' ||
    viewer?.manageableHostTeam === true ||
    viewer?.manageableOpponentTeam === true ||
    viewer?.participantMember === true;
  // 서버 assertCanUseTeamMatchChat(chat.service.ts)과 정확히 같은 기준으로 바꾼다 — 양 팀
  // owner/manager. 예전엔 host_team/approved(=신청서를 낸 사람 한 명)만 봐서, 리그 대진의
  // 신청서를 운영자가 대신 내는 원정팀 owner/manager는 canChat이 영원히 false였다(alpha
  // 실측: 원정팀 owner에게 '상대팀과 채팅' 버튼 자체가 없음). manageableHostTeam/
  // manageableOpponentTeam은 팀 멤버십만으로 판정해 서버가 실제로 허용하는 사용자와 일치한다.
  const canChat = viewer?.manageableHostTeam === true || viewer?.manageableOpponentTeam === true;

  const openChat = () => {
    setChatError('');
    resolveChatRoom.mutate(
      { targetType: 'team_match', targetId: fixtureId },
      {
        onSuccess: (data) => router.push(data.route || `/chat/${data.roomId}`),
        onError: (error) => setChatError(extractErrorMessage(error, '채팅방을 열지 못했어요. 다시 시도해 주세요.')),
      },
    );
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      {/* 리그 문맥 — 어느 리그의 몇 주차 경기인지. 리그명 전체를 그대로 싣는다(팀매치
          상세의 말줄임 배지가 "이상한 글씨"로 읽히던 문제의 반대 방향). */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={`tm-badge ${stateMeta.badgeClass}`}>{stateMeta.label}</span>
        <Link href={`/league-matches/${leagueId}`} className="tm-pressable text-sm font-semibold text-[var(--text-strong)] underline underline-offset-2">
          {series.title}
        </Link>
        {/* 기록 본문(MatchDetailContent)이 뜨면 그 헤더가 주차를 이미 보여준다 — 중복 표기 방지. */}
        {round && !recordQuery.data ? <span className="text-sm text-[var(--text-muted)]">{round}</span> : null}
      </div>

      {recordQuery.data ? (
        <>
          {/* 대회 경기 상세(/tournaments/:id/matches/:fixtureId)와 완전히 같은 본문 —
              스코어·승부차기·몰수 사유·MVP·라인업·득점/카드 타임라인·경기 영상·정정 이력.
              (2026-08-25 사용자 지시: 대회에 만든 경기 UI/UX 가 리그에도 모두 있어야 한다.)
              MatchDetailContent 는 자체 좌우 패딩(20px)을 가진다 — 이 컨테이너의 px-4 와
              겹쳐 본문만 안으로 밀리지 않게 음수 마진으로 상쇄한다. */}
          <div className="-mx-4">
            <MatchDetailContent data={recordQuery.data} />
          </div>
          {/* 기록 연결 승인함 (attest UI C안): 다른 참가자의 연결 신청을 확인·승인하는
              반대쪽 절반. 신청 알림의 착지 화면이기도 하다 — 요청이 있을 때만 보인다. */}
          <AttestRequestsSection gameId={recordQuery.data.gameId} />
          {/* 대회 경기 상세와 같은 "내 기록 연결" 배너 (claim 의 리그 판). 기록 본문이
              뜨는 경우에만 싣는다 — 게임 미공개(404 폴백) 대진은 연결할 기록 자체가
              화면에 없어 배너가 맥락을 잃는다. 조회는 모달을 연 뒤에만 나간다. */}
          <LeagueClaimMyRecordSection leagueId={leagueId} teamMatchId={fixtureId} />
          {/* 리그 고유 문맥 — 대회 본문에는 없는 순위·전적. 팀 상세로 가는 통로이기도 하다. */}
          {(recordLine(homeRow) || recordLine(awayRow)) && (
            <Card pad={16}>
              <h2 className="text-sm font-bold text-[var(--text-strong)]">리그 순위·전적</h2>
              <ul className="mt-2 space-y-1">
                {[
                  { teamId: fixture.homeTeamId, name: homeName, row: homeRow },
                  { teamId: fixture.awayTeamId, name: awayName, row: awayRow },
                ].map((side) =>
                  side.teamId === null || !recordLine(side.row) ? null : (
                    <li key={side.teamId}>
                      <Link
                        href={`/teams/${side.teamId}`}
                        className="tm-pressable tm-list-row-interactive flex min-h-[44px] items-center justify-between gap-2 rounded-lg px-2 text-sm"
                      >
                        <span className="inline-flex items-center gap-2">
                          <TeamAvatar seed={side.teamId} name={side.name} logoUrl={side.row?.teamLogoUrl ?? null} size="sm" />
                          <span className="text-[var(--text-strong)]">{side.name}</span>
                        </span>
                        <span className="text-[var(--text-muted)]">{recordLine(side.row)}</span>
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            </Card>
          )}
        </>
      ) : recordQuery.isPending ? (
        <div className="tm-skeleton" style={{ height: 180, borderRadius: 'var(--radius-container)' }} />
      ) : recordQuery.isError &&
        !(recordQuery.error instanceof V1ApiError && recordQuery.error.statusCode === 404) ? (
        /* 404(게임 미공개·숨김)만 정상 폴백이다 — 네트워크/5xx 를 요약 카드로 숨기면
           실제 장애가 화면에서 사라진다(Copilot 리뷰 #747). */
        <ErrorState
          message={extractErrorMessage(recordQuery.error, '경기 기록을 불러오지 못했어요.')}
          onRetry={() => void recordQuery.refetch()}
        />
      ) : (
        /* 기록 API 404(게임 미공개·숨김 정책) 폴백 — 리그 대진 요약 카드.
           양팀 실명·스코어/상태·일시·장소는 리그 공개 상세만으로도 보여줄 수 있다. */
        <Card pad={20}>
          <div className="flex items-start justify-between gap-3">
            <TeamSide teamId={fixture.homeTeamId} name={homeName} logoUrl={homeRow?.teamLogoUrl ?? null} record={recordLine(homeRow)} align="left" />
            <div className="flex min-w-[96px] flex-col items-center gap-1 pt-1">
              {result.hasScore ? (
                <span className="text-2xl font-bold text-[var(--text-strong)]">{result.text}</span>
              ) : (
                <span className="text-sm font-semibold text-[var(--text-muted)]">{result.text}</span>
              )}
              {result.isForfeit ? <span className="tm-badge tm-badge-sm tm-badge-orange">몰수</span> : null}
              <span className={`tm-badge tm-badge-sm ${statusMeta.badgeClass}`}>{statusMeta.label}</span>
            </div>
            <TeamSide teamId={fixture.awayTeamId} name={awayName} logoUrl={awayRow?.teamLogoUrl ?? null} record={recordLine(awayRow)} align="right" />
          </div>
          <div className="mt-4 space-y-1 border-t border-[var(--border)] pt-3 text-sm text-[var(--text-muted)]">
            <p>{formatTournamentDateTimeLong(fixture.startAt) ?? '일정 미정'}</p>
            <p>{fixture.placeName || '장소 미정'}</p>
          </div>
        </Card>
      )}

      {/* 맞대결 기록 — 이 리그에서 같은 두 팀이 이미 치른 경기. 없으면 섹션 자체를 숨긴다. */}
      {headToHead.length > 0 && (
        <Card pad={16}>
          <h2 className="text-sm font-bold text-[var(--text-strong)]">이 리그 맞대결</h2>
          <ul className="mt-2 space-y-1">
            {headToHead.map((item) => {
              const itemResult = fixtureResultLabel(item);
              const itemHome = rowByTeam.get(item.homeTeamId)?.teamName ?? '홈팀';
              const itemAway = item.awayTeamId !== null ? rowByTeam.get(item.awayTeamId)?.teamName ?? '상대팀' : '상대팀';
              return (
                <li key={item.teamMatchId}>
                  <Link
                    href={`/league-matches/${leagueId}/fixtures/${item.teamMatchId}`}
                    className="tm-pressable tm-list-row-interactive flex min-h-[44px] flex-wrap items-center justify-between gap-2 rounded-lg px-2 text-sm"
                  >
                    <span className="text-[var(--text-strong)]">{itemHome} <span className="font-bold">{itemResult.text}</span> {itemAway}</span>
                    <span className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                      {itemResult.isForfeit ? <span className="tm-badge tm-badge-sm tm-badge-orange">몰수</span> : null}
                      {formatTournamentDateTimeShort(item.startAt) ?? ''}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* 참가팀 전용 통로 — 관전자에게는 아무것도 늘어나지 않는다. */}
      {isParticipant && (
        <Card pad={16}>
          <h2 className="text-sm font-bold text-[var(--text-strong)]">우리 팀 경기</h2>
          <div className="mt-3 flex flex-col gap-2">
            {canChat ? (
              <button type="button" className="tm-btn tm-btn-lg tm-btn-neutral" disabled={resolveChatRoom.isPending} onClick={openChat}>
                {resolveChatRoom.isPending ? '연결 중' : '상대팀과 채팅'}
              </button>
            ) : null}
            {chatError ? <p role="alert" className="text-sm text-red-700 dark:text-red-300">{chatError}</p> : null}
            <Link href={`/team-matches/${fixtureId}/lineup`} className="tm-btn tm-btn-lg tm-btn-neutral">
              라인업 관리
            </Link>
            {(fixture.status === 'completed' || result.hasScore) && (
              <Link href={`/team-matches/${fixtureId}/result`} className="tm-btn tm-btn-lg tm-btn-neutral">
                결과 상세·이의 제기
              </Link>
            )}
          </div>
        </Card>
      )}

      <Link href={`/league-matches/${leagueId}`} className="tm-btn tm-btn-lg tm-btn-primary w-full">
        전체 순위표·일정 보기
      </Link>
    </div>
  );
}
