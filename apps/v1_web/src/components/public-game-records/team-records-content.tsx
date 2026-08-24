'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card, EmptyState, KPIStat } from '@/components/v1-ui/primitives';
import { TeamAvatar } from '@/components/v1-ui/team-avatar';
import { formatTournamentDateShort } from '@/lib/date-utils';
import { AbnormalClockBadge } from './abnormal-clock-badge';
import {
  eventPresentation,
  formatGoalMinute,
  formatTeamRecordPenaltyScoreline,
  isClockAbnormal,
  presentGameEventParticipantName,
  presentParticipantName,
  teamRecordResultLabel,
} from './format';
import { resultChipStyle, resultStripeStyle } from './result-emphasis';
import type {
  PublicTeamRecordEvent,
  PublicTeamRecordItem,
  PublicTeamRecordsResponse,
  TeamRecordCategory,
  TeamRecordSummaryTotals,
  TeamRecordTypeFilter,
} from './types';

/**
 * U2 -- 탭 4개, 순서 고정. '전체'만 로컬 전용 값(`'all'`)이고 나머지 세 값은
 * 서버가 그대로 받는 `type` 쿼리 값(`TeamRecordCategory`)과 동일하다.
 */
const TEAM_RECORD_TYPE_TABS: readonly { readonly key: TeamRecordTypeFilter; readonly label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'league', label: '정규 리그' },
  { key: 'tournament', label: '대회' },
  { key: 'friendly', label: '친선' },
];

const TEAM_RECORD_TYPE_LABEL: Readonly<Record<TeamRecordCategory, string>> = {
  league: '정규 리그',
  tournament: '대회',
  friendly: '친선',
};

/** 대회 소스면 대회 상세로, 팀매치 소스면 팀매치 상세로 — exactly-one-source라 항상 둘 중
 * 하나만 있다(V1Game의 CHECK 제약, public-team-records.service.ts 주석 참고). */
function recordHref(item: PublicTeamRecordItem): string | null {
  if (item.tournamentId) return `/tournaments/${item.tournamentId}`;
  if (item.teamMatchId) return `/team-matches/${item.teamMatchId}`;
  return null;
}

/**
 * 아코디언으로 펼치는 한 경기의 골/카드 이벤트 한 줄. 아이콘·라벨·분 표기는
 * `match-detail-content.tsx`의 `EventRow`와 완전히 같은 유틸(`eventPresentation`,
 * `formatGoalMinute`, `presentParticipantName`)을 재사용한다 — 같은 사실이 화면마다
 * 다른 표현으로 나오지 않게 하기 위함이다. 다만 `clockMs`는 여기서 분 단위로만
 * 보여준다(경기 상세는 mm:ss까지 보여줄 공간이 있지만, 이 패널은 팀 전적 행 안에
 * 접혀 있는 좁은 공간이라 일정 카드와 같은 압축 표기를 쓴다).
 *
 * `side`는 'own'/'opponent'로 이미 정규화돼 오므로, 우리 팀 이벤트는 좌측, 상대팀
 * 이벤트는 우측에 배치해 색이 아니라 정렬로도 구분한다.
 */
function TeamRecordEventRow({ event }: { event: PublicTeamRecordEvent }) {
  const presentation = eventPresentation(event);
  const content = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {event.jerseyNumber !== null ? (
        <span className="tab-num" style={{ color: 'var(--text-caption)', fontSize: 12 }}>{event.jerseyNumber}</span>
      ) : null}
      <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-strong)' }}>
        {/* 열어도 되는지는 서버가 `profileHref` 로 판단해 내려준다 — 여기서 동의·계정
            유무를 다시 따지지 않는다(경기 상세의 ProfileLink 와 같은 규칙). */}
        {event.profileHref !== null ? (
          <Link href={event.profileHref} style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2 }}>
            {presentGameEventParticipantName(event.type, event.participantName)}
          </Link>
        ) : (
          presentGameEventParticipantName(event.type, event.participantName)
        )}
      </span>
    </span>
  );
  return (
    <div role="listitem" style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{event.side === 'own' ? content : null}</div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 36 }}>
        <span aria-hidden="true" style={{ fontSize: 14, lineHeight: 1 }}>{presentation.icon}</span>
        <span className="sr-only">{presentation.label}</span>
        {presentation.badge ? (
          /* 자책골처럼 아이콘만으로 뜻이 갈리지 않는 이벤트에 붙는 **보이는** 표식.
             `sr-only` 라벨만으로는 화면에서 일반 골과 구분되지 않는다(2026-08-19 alpha 실측:
             관전자에게는 원정 열에 홈 선수 이름이 뜬 일반 골로만 보였다). */
          <span
            style={{
              fontSize: 10,
              lineHeight: 1.4,
              padding: '0 4px',
              borderRadius: 4,
              fontWeight: 700,
              // 실제 팔레트 토큰을 쓴다 — `--danger-*` 는 이 코드베이스에 없어서
              // 하드코딩 fallback 이 항상 적용되고 있었다(다크모드도 따라오지 않는다).
              color: 'var(--red700)',
              background: 'var(--tint-red)',
            }}
          >
            {presentation.badge}
          </span>
        ) : null}
        <span className="tab-num" style={{ fontSize: 12, color: 'var(--text-caption)' }}>
          {formatGoalMinute(event.clockMs)}
          {isClockAbnormal(event.clockMs) ? <AbnormalClockBadge /> : null}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-start' }}>{event.side === 'opponent' ? content : null}</div>
    </div>
  );
}

/**
 * 펼쳐진 경기 기록 패널. 우리 팀/상대팀 이름을 열 머리글로 한 번 더 텍스트로
 * 박아둔다 — 좌/우 정렬만으로 구분하면 색맹 대응과 별개로 스크린리더 사용자에게는
 * 정렬 자체가 전달되지 않기 때문이다(색·정렬만으로 정보 전달 금지 원칙의 연장).
 */
function TeamRecordEventsPanel({
  id,
  item,
  teamName,
}: {
  id: string;
  item: PublicTeamRecordItem;
  teamName: string;
}) {
  return (
    <div
      id={id}
      role="list"
      aria-label={`${teamName} 대 ${item.opponentTeamName ?? '상대 미상'} 경기 기록`}
      style={{ padding: '0 16px 14px', borderTop: '1px solid var(--grey100)' }}
    >
      {/* 이벤트 행(`TeamRecordEventRow`)과 **같은 grid·gap·가운데 폭**을 쓴다 — 머리글만
       * gap 없이 두면 두 팀명이 `…01팀(테스트) QA 스쿼드 02팀` 처럼 맞붙어 한 덩어리로
       * 읽히고(알파 1440 실측), 아래 이벤트의 좌/우 열과 머리글이 어긋난다. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          gap: 8,
          fontSize: 11,
          color: 'var(--text-caption)',
          margin: '10px 0 8px',
        }}
      >
        <span style={{ textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {teamName}
        </span>
        <span aria-hidden="true" style={{ minWidth: 36 }} />
        <span style={{ textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.opponentTeamName ?? '상대 미상'}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {item.events.map((event) => (
          <TeamRecordEventRow key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}

/** 05/06번 팀매치 결과 화면이 쓰는 "팀 로고 · 점수 · 팀 로고" 스코어박스 톤을 그대로
 * 가져왔다 — 이전엔 텍스트 한 줄(결과·상대팀명·점수)뿐이라 같은 데이터인데도 대회/매치
 * 상세보다 훨씬 밋밋해 보였다.
 *
 * 아코디언 토글 버튼(있다면)은 이 컴포넌트 밖, 부모의 `<Link>` 형제로 렌더된다 --
 * `<a>` 안에 `<button>`을 중첩하면 무효한 마크업이 되므로, 여기서는 순수하게
 * 정정됨 배지가 있던 우측 상단 자리를 토글 버튼이 겹쳐 올라올 수 있도록 여유
 * 공간(`headerPaddingRight`)만 남겨둔다. */
function TeamRecordRow({
  item,
  teamId,
  teamName,
  teamLogoUrl,
  reserveToggleSpace,
}: {
  item: PublicTeamRecordItem;
  teamId: string;
  teamName: string;
  teamLogoUrl: string | null;
  reserveToggleSpace: boolean;
}) {
  const penaltyLabel = formatTeamRecordPenaltyScoreline(item.penalties);
  return (
    <div
      style={{
        padding: '14px 16px 14px 12px',
        borderTop: '1px solid var(--grey100)',
        ...resultStripeStyle(item.result),
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 10,
          // '정정됨' 배지가 빠진 자리 재균형: 배지가 있던 시절엔 우측 여백이 배지
          // 폭만큼만 확보됐는데, 배지를 완전히 없앤 지금은 (1) 아코디언 토글 버튼이
          // 있는 행엔 그 버튼(44px)과 안 겹치도록 동일한 폭을 계속 남기고, (2) 토글이
          // 없는 행(events가 빈 경기)은 이 span이 `flex:1`로 남은 폭 전부를 가져가
          // 날짜·대회명이 줄임표 없이 더 길게 보일 여유를 얻는다.
          paddingRight: reserveToggleSpace ? 40 : 0,
        }}
      >
        <span style={resultChipStyle(item.result)}>{teamRecordResultLabel(item.result)}</span>
        <span
          style={{
            fontSize: 12,
            color: 'var(--text-caption)',
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {formatTournamentDateShort(item.playedAt) ?? ''}
          {item.tournamentTitle ? ` · ${item.tournamentTitle}` : ''}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <TeamAvatar seed={teamId} name={teamName} logoUrl={teamLogoUrl} size="sm" />
          <span
            className="tm-text-caption"
            style={{ fontWeight: 600, color: 'var(--text-strong)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {teamName}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, gap: 2 }}>
          <span className="tab-num" style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-strong)' }}>
            {item.goalsFor} : {item.goalsAgainst}
          </span>
          {/* 정규시간 스코어 그대로 두고, 승부차기는 아래 보조 표기로만 덧붙인다 --
              대회 화면(PenaltyScoreline)과 동일한 "승부차기 N-M" 문구. */}
          {penaltyLabel ? (
            <span className="tab-num" style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-caption)' }}>
              {penaltyLabel}
            </span>
          ) : null}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <TeamAvatar seed={item.opponentTeamId ?? item.gameId} name={item.opponentTeamName ?? '상대 미상'} logoUrl={item.opponentTeamLogoUrl} size="sm" />
          <span
            className="tm-text-caption"
            style={{ fontWeight: 600, color: 'var(--text-strong)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {item.opponentTeamName ?? '상대 미상'}
          </span>
        </div>
      </div>
    </div>
  );
}

export function TeamRecordsContent({
  data,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  activeType,
  onChangeType,
}: {
  data: PublicTeamRecordsResponse;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
  /** U2 -- 미전달 시 '전체' 고정(다른 화면이 아직 탭 없이 이 컴포넌트를 쓸 수 있어 optional). */
  activeType?: TeamRecordTypeFilter;
  onChangeType?: (type: TeamRecordTypeFilter) => void;
}) {
  // 여러 행을 동시에 펼칠 수 있게 Set으로 관리한다 -- 아코디언끼리 서로 배타적이어야
  // 할 이유가 없고(다른 경기 두 개를 나란히 비교해 보고 싶을 수 있다), gameId는
  // 행마다 고유하다.
  const [expandedGameIds, setExpandedGameIds] = useState<ReadonlySet<string>>(new Set());

  function toggleExpanded(gameId: string) {
    setExpandedGameIds((prev) => {
      const next = new Set(prev);
      if (next.has(gameId)) next.delete(gameId);
      else next.add(gameId);
      return next;
    });
  }

  const resolvedActiveType: TeamRecordTypeFilter = activeType ?? 'all';
  // U2 -- '전체'가 아닌 탭이면 KPI를 서버가 이미 계산해 보낸 `summary.byType[종류]`로
  // 교체한다. 새 계산 없이 그대로 꺼내 쓴다(과제 지시: "새 계산 없이 이미 온 값 그대로").
  const activeSummary: TeamRecordSummaryTotals =
    resolvedActiveType === 'all' ? data.summary : data.summary.byType[resolvedActiveType];
  const emptyStateCopy =
    resolvedActiveType === 'all'
      ? { title: '아직 공식 경기 기록이 없어요', sub: '대회·팀매치 결과가 확정되면 이곳에 표시돼요.' }
      : {
          title: `아직 ${TEAM_RECORD_TYPE_LABEL[resolvedActiveType]} 경기가 없어요`,
          sub: `${TEAM_RECORD_TYPE_LABEL[resolvedActiveType]} 결과가 확정되면 이곳에 표시돼요.`,
        };

  return (
    <div style={{ padding: '16px 20px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {onChangeType ? (
        <div role="tablist" aria-label="경기 종류" className="tm-seg-tabs" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {TEAM_RECORD_TYPE_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={resolvedActiveType === tab.key}
              data-active={resolvedActiveType === tab.key}
              className="tm-seg-tab"
              onClick={() => onChangeType(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}

      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <KPIStat label="경기" value={activeSummary.played} unit="경기" />
          <KPIStat label="승·무·패" value={`${activeSummary.won}·${activeSummary.drawn}·${activeSummary.lost}`} />
          <KPIStat label="득실차" value={activeSummary.goalsFor - activeSummary.goalsAgainst} />
        </div>
      </Card>

      <section>
        <h3 className="tm-hub-section-title" style={{ marginBottom: 10 }}>경기 기록</h3>
        {data.items.length === 0 ? (
          <EmptyState title={emptyStateCopy.title} sub={emptyStateCopy.sub} />
        ) : (
          <Card pad={0}>
            {data.items.map((item) => {
              const href = recordHref(item);
              const hasEvents = item.events.length > 0;
              const isExpanded = hasEvents && expandedGameIds.has(item.gameId);
              const panelId = `team-record-events-${item.gameId}`;
              const row = (
                <TeamRecordRow
                  item={item}
                  teamId={data.teamId}
                  teamName={data.teamName}
                  teamLogoUrl={data.teamLogoUrl}
                  reserveToggleSpace={hasEvents}
                />
              );
              return (
                <div key={item.gameId} style={{ position: 'relative' }}>
                  {href ? (
                    <Link href={href} style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
                      {row}
                    </Link>
                  ) : (
                    row
                  )}
                  {hasEvents ? (
                    // 링크 형제 요소 -- `<a>` 안에 중첩되지 않으므로 클릭이 서로 간섭하지
                    // 않는다: 이 버튼 영역을 누르면 버튼의 onClick만 실행되고(상위에
                    // 앵커가 없으니 버블링으로 이동이 트리거될 일도 없다), 행의 나머지
                    // 영역을 누르면 여전히 위 <Link>가 그대로 이동을 처리한다.
                    <button
                      type="button"
                      className="tm-pressable"
                      aria-expanded={isExpanded}
                      aria-controls={panelId}
                      aria-label={`${item.opponentTeamName ?? '상대 미상'} 전 경기 기록 ${isExpanded ? '접기' : '펼치기'}`}
                      onClick={() => toggleExpanded(item.gameId)}
                      style={{
                        position: 'absolute',
                        top: 3,
                        right: 3,
                        width: 44,
                        height: 44,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'none',
                        border: 'none',
                        borderRadius: 22,
                        cursor: 'pointer',
                      }}
                    >
                      <ChevronDown
                        size={16}
                        aria-hidden="true"
                        style={{
                          color: 'var(--text-caption)',
                          transform: isExpanded ? 'rotate(180deg)' : undefined,
                          transition: 'transform 120ms ease',
                        }}
                      />
                    </button>
                  ) : null}
                  {isExpanded ? (
                    <TeamRecordEventsPanel id={panelId} item={item} teamName={data.teamName} />
                  ) : null}
                </div>
              );
            })}
          </Card>
        )}
        {hasNextPage ? (
          <button
            type="button"
            className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block"
            style={{ marginTop: 12 }}
            disabled={isFetchingNextPage}
            onClick={onLoadMore}
          >
            {isFetchingNextPage ? '불러오는 중…' : '더 보기'}
          </button>
        ) : null}
      </section>
    </div>
  );
}
