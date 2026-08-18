import Link from 'next/link';
import type { ReactNode } from 'react';
import { Trophy, LayoutGrid, Star, ChevronRight, Video, Gift, Search } from 'lucide-react';
import { Card, ErrorState } from '@/components/v1-ui/primitives';
import type {
  V1ReviewListItem,
  V1TournamentFixture,
  V1TournamentStatus,
} from '@/types/api';
import {
  getTournamentPostEventCards,
  getTournamentVenuePrepItems,
  type HubState,
  type TournamentAnnouncementSummary,
  type TournamentPostEventCard,
  type TournamentVenuePrepItem,
} from './tournament-venue-retention-model';
import { TournamentVenueMap } from './tournament-venue-map';
import { TournamentVenueNavigationButton } from './tournament-venue-navigation-button';

export {
  getTournamentPostEventCards,
  getTournamentVenuePrepItems,
} from './tournament-venue-retention-model';

export function TournamentVenuePrepSection({
  venue,
  announcements,
  parkingInfo = null,
  latitude = null,
  longitude = null,
}: {
  venue: string | null;
  parkingInfo?: string | null;
  announcements: TournamentAnnouncementSummary[];
  /** 카카오 지오코딩 좌표. 둘 다 있을 때만 지도 임베드 + 내비게이션 버튼을 보여준다. */
  latitude?: number | null;
  longitude?: number | null;
}) {
  const items = getTournamentVenuePrepItems({ venue, parkingInfo, announcements, latitude, longitude });
  const hasCoordinates = venue !== null && latitude !== null && longitude !== null;

  return (
    <section aria-labelledby="venue-prep-heading" style={{ marginTop: 24 }}>
      <div id="venue-prep-heading" className="tm-text-body-lg" style={{ marginBottom: 8 }}>
        현장 안내
      </div>
      <Card pad={16} style={{ marginTop: 4 }}>
        <div style={{ display: 'grid', gap: 12 }}>
          {items.map((item) => (
            <HubFactRow key={item.key} item={item} />
          ))}
        </div>
        {hasCoordinates ? (
          <>
            <TournamentVenueMap venue={venue} latitude={latitude} longitude={longitude} />
            <TournamentVenueNavigationButton venue={venue} latitude={latitude} longitude={longitude} />
          </>
        ) : null}
      </Card>
    </section>
  );
}

export function TournamentPostEventHubSection({
  tournamentId,
  status,
  fixtures,
  hasAnnouncements,
  sponsorCount,
  announcements,
}: {
  tournamentId: string;
  status: V1TournamentStatus;
  fixtures: V1TournamentFixture[];
  hasAnnouncements: boolean;
  sponsorCount?: number;
  announcements: TournamentAnnouncementSummary[];
}) {
  // completed: verbose 5카드 대신 Toss식 컴팩트 액션 리스트로 대체(스크롤·복잡도 축소).
  // 단 "리뷰할 수 있는 경기"는 여기서도 함께 내린다 — 후기는 대회가 끝난 뒤에 쓰는 것인데
  // 예전엔 completed 가 되는 순간 이 진입점이 통째로 사라져, 정작 쓸 시점에 들어갈 길이 없었다.
  // 경기별 후기 진입은 "대회 후기" 화면(/tournaments/:id/awards)으로 합쳤다 — 대회 상세에
  // 후기 입구가 두 개(대회 후기 행 + 리뷰할 수 있는 경기 섹션)라 어디로 가야 하는지 헷갈렸다.
  if (status === 'completed') {
    return <TournamentCompletedActionList tournamentId={tournamentId} />;
  }

  // draft/open/closed: 대회가 아직 시작도 안 했는데 "대회 후" 콘텐츠를 보여줄 단계가
  // 아니다 — 예전엔 이 상태에서도 전부 "준비 중"인 5카드를 그대로 노출해 혼란을 줬다.
  if (status !== 'in_progress') {
    return null;
  }

  const hasCompletedFixture = fixtures.some(
    (fixture) => fixture.status === 'completed' && fixture.result !== null,
  );
  const cards = getTournamentPostEventCards({
    status,
    hasCompletedFixture,
    hasAnnouncements,
    sponsorCount,
    announcements,
  });

  // in_progress: "준비 중"(upcoming)·"공지 대기"(operator_update) 같은 빈 placeholder는
  // 숨기고, 실제로 확인할 거리가 있는(available) 항목만 컴팩트 리스트로 노출한다.
  // "다음 대회"는 상태 무관 항상 available이라 완료 리스트(TournamentCompletedActionList)와
  // 동일하게 절제 원칙상 제외. 아무것도 없으면(경기 결과·공지 전무) 섹션째 숨긴다 — 조별
  // 순위·대진표는 이미 같은 페이지 다른 섹션에서 보여주고 있어 여기서 반복하지 않는다.
  const availableCards = cards.filter(
    (card) => card.status === 'available' && card.key !== 'next_tournament',
  );
  if (availableCards.length === 0 && !hasCompletedFixture) return null;

  return (
    <>
      {availableCards.length > 0 ? <PostEventActionList heading="대회 현황" cards={availableCards} /> : null}

    </>
  );
}

export type TournamentFixtureReviewState = {
  status: 'guest' | 'loading' | 'error' | 'ready';
  items: V1ReviewListItem[];
  onRetry?: () => void;
};

const POST_EVENT_CARD_ICON: Record<TournamentPostEventCard['key'], ReactNode> = {
  results: <Trophy size={18} strokeWidth={2} aria-hidden="true" />,
  video: <Video size={18} strokeWidth={2} aria-hidden="true" />,
  sponsor: <Gift size={18} strokeWidth={2} aria-hidden="true" />,
  next_tournament: <Search size={18} strokeWidth={2} aria-hidden="true" />,
};

/** completed 전용 리스트(TournamentCompletedActionList)와 동일한 hairline-row 스타일 공유. */
function PostEventActionList({ heading, cards }: { heading: string; cards: TournamentPostEventCard[] }) {
  return (
    <section aria-labelledby="post-event-heading" style={{ marginTop: 24 }}>
      <div id="post-event-heading" className="tm-text-body-lg" style={{ marginBottom: 8 }}>
        {heading}
      </div>
      <Card pad={0} style={{ overflow: 'hidden' }}>
        {cards.map((card, idx) => (
          <Link
            key={card.key}
            href={card.href ?? '#'}
            className="tm-list-row-interactive tm-pressable"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              minHeight: 60,
              padding: '12px 16px',
              borderBottom: idx < cards.length - 1 ? '1px solid var(--border)' : 'none',
              textDecoration: 'none',
            }}
          >
            <span
              aria-hidden="true"
              // 2026-08-11: 5개 카드(결과/영상/리뷰/스폰서/다음대회) 전부 순수 내비게이션이라
              // 파란 틴트에 의미가 없다는 지적 — 무채색으로 통일
              // 2026-08-12: [인라인 style 우선순위 fix] 배경을 인라인으로 두면 다크모드
              // 전용 클래스 오버라이드(.tm-post-event-icon-badge, globals.css)가 절대 못
              // 이겨서 배지가 여전히 카드에 녹아 사라졌다 — 배경은 CSS 클래스로만 관리.
              className="tm-post-event-icon-badge"
              style={{
                flexShrink: 0,
                width: 36,
                height: 36,
                borderRadius: 10,
                color: 'var(--text-strong)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              {POST_EVENT_CARD_ICON[card.key]}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>
                {card.title}
              </div>
              <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 1 }}>
                {card.body}
              </div>
            </div>
            <ChevronRight size={16} strokeWidth={2.2} aria-hidden="true" style={{ color: 'var(--text-caption)', flexShrink: 0 }} />
          </Link>
        ))}
      </Card>
    </section>
  );
}

export function TournamentFixtureReviewEntrySection({
  fixtures,
  state,
}: {
  fixtures: V1TournamentFixture[];
  state: TournamentFixtureReviewState;
}) {
  if (state.status === 'guest') return null;

  if (state.status === 'loading') {
    return (
      <section aria-labelledby="fixture-review-heading" style={{ marginTop: 24 }}>
        <div id="fixture-review-heading" className="tm-text-body-lg" style={{ marginBottom: 8 }}>
          리뷰할 수 있는 경기
        </div>
        <Card pad={16}>
          <div className="tm-text-label" role="status" style={{ color: 'var(--text-muted)' }}>
            남은 리뷰를 확인하고 있어요.
          </div>
        </Card>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section aria-labelledby="fixture-review-heading" style={{ marginTop: 24 }}>
        <div id="fixture-review-heading" className="tm-text-body-lg" style={{ marginBottom: 8 }}>
          리뷰할 수 있는 경기
        </div>
        <Card pad={16}>
          <ErrorState
            title="리뷰 가능 경기를 불러오지 못했어요"
            message="잠시 후 다시 시도해 주세요."
            onRetry={state.onRetry}
          />
        </Card>
      </section>
    );
  }

  const fixtureById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  const entries = state.items.flatMap((item) => {
    if (item.sourceType !== 'tournament_fixture' || item.remainingCount <= 0) return [];
    const fixture = fixtureById.get(item.sourceId);
    if (!fixture || fixture.status !== 'completed' || fixture.result === null) return [];
    return [{ fixture, remainingCount: item.remainingCount }];
  });

  if (entries.length === 0) return null;
  return <TournamentFixtureReviewEntryList entries={entries} />;
}

function TournamentFixtureReviewEntryList({
  entries,
}: {
  entries: Array<{ fixture: V1TournamentFixture; remainingCount: number }>;
}) {
  return (
    <section aria-labelledby="fixture-review-heading" style={{ marginTop: 24 }}>
      <div id="fixture-review-heading" className="tm-text-body-lg" style={{ marginBottom: 4 }}>
        리뷰할 수 있는 경기
      </div>
      <p className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.5, margin: '0 0 8px' }}>
        경기 결과와 내 역할을 확인해 아직 남길 수 있는 리뷰만 보여드려요.
      </p>
      <Card pad={0} style={{ overflow: 'hidden' }}>
        {entries.map(({ fixture, remainingCount }, index) => {
          const homeTeamName = getFixtureTeamLabel(fixture.homeTeamName);
          const awayTeamName = getFixtureTeamLabel(fixture.awayTeamName);
          const result = fixture.result!;
          const roundLabel = fixture.round || `${fixture.fixtureNumber}경기`;
          const hasPenaltyResult =
            result.hasPenalty && result.homePenaltyScore !== null && result.awayPenaltyScore !== null;

          return (
            <Link
              key={fixture.id}
              href={`/my/reviews/tournament_fixture/${fixture.id}`}
              className="tm-list-row-interactive tm-pressable"
              aria-label={`${homeTeamName} 대 ${awayTeamName} 경기 남은 리뷰 ${remainingCount}개 작성`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                minHeight: 68,
                padding: '12px 16px',
                borderBottom: index < entries.length - 1 ? '1px solid var(--border)' : 'none',
                textDecoration: 'none',
              }}
            >
              <span
                aria-hidden="true"
                className="tm-post-event-icon-badge"
                style={{
                  flexShrink: 0,
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  color: 'var(--text-strong)',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Star size={18} strokeWidth={2} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="tm-text-caption" style={{ color: 'var(--text-caption)', marginBottom: 2 }}>
                  {roundLabel}
                </div>
                <div
                  className="tm-text-label"
                  style={{
                    color: 'var(--text-strong)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {homeTeamName} <span aria-hidden="true" style={{ color: 'var(--text-caption)' }}>vs</span> {awayTeamName}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div className="tab-num tm-text-label" style={{ color: 'var(--text-strong)' }}>
                  {result.homeScore} : {result.awayScore}
                </div>
                {hasPenaltyResult ? (
                  <div className="tab-num tm-text-caption" style={{ color: 'var(--text-caption)', marginTop: 1 }}>
                    PK {result.homePenaltyScore} : {result.awayPenaltyScore}
                  </div>
                ) : null}
                <div className="tm-text-caption" style={{ color: 'var(--blue700)', fontWeight: 700, marginTop: 2 }}>
                  남은 리뷰 {remainingCount}개
                </div>
              </div>
              <ChevronRight
                size={16}
                strokeWidth={2.2}
                aria-hidden="true"
                style={{ color: 'var(--text-caption)', flexShrink: 0 }}
              />
            </Link>
          );
        })}
      </Card>
    </section>
  );
}

function getFixtureTeamLabel(teamName: string | null | undefined) {
  if (teamName === null) return '비공개';
  if (!teamName || teamName === 'TBD') return '미정';
  return teamName;
}

type CompletedActionItem = {
  key: string;
  label: string;
  caption: string;
  href: string;
  icon: ReactNode;
};

/**
 * completed 전용 Toss식 컴팩트 액션 리스트 — 결과·시상 / 대진표·조별 순위 / 후기·매너 평가
 * 3개 행을 하나의 Card에 hairline 구분선으로 묶는다. 각 row 전체가 링크(44px+ 터치 타겟).
 * 하이라이트 영상 "준비 중"·협찬 "공지 대기" 같은 빈 placeholder는 제거하고, "다음 대회" 링크도
 * Toss 절제 원칙에 따라 생략했다(핵심 3개 행만 유지).
 */
function TournamentCompletedActionList({ tournamentId }: { tournamentId: string }) {
  const items: CompletedActionItem[] = [
    {
      key: 'results',
      label: '최종 결과·시상',
      caption: '최종 순위와 시상 내역을 확인해요',
      href: `/tournaments/${tournamentId}/results`,
      icon: <Trophy size={18} strokeWidth={2} aria-hidden="true" />,
    },
    {
      key: 'bracket',
      label: '대진표·조별 순위',
      caption: '전체 경기 기록과 순위를 확인해요',
      href: `/tournaments/${tournamentId}/bracket`,
      icon: <LayoutGrid size={18} strokeWidth={2} aria-hidden="true" />,
    },
    {
      key: 'reviews',
      label: '대회 후기',
      caption: '이 대회의 참가팀 후기를 보고 남겨요',
      // 예전엔 '/my/reviews'로 보내 대회 컨텍스트가 통째로 사라졌다 — 어떤 대회의 후기를
      // 쓰려던 건지 화면이 알 수 없어 사용자가 목록에서 다시 찾아야 했다.
      href: `/tournaments/${tournamentId}/awards`,
      icon: <Star size={18} strokeWidth={2} aria-hidden="true" />,
    },
  ];

  return (
    <section aria-labelledby="post-event-heading" style={{ marginTop: 24 }}>
      <div id="post-event-heading" className="tm-text-body-lg" style={{ marginBottom: 8 }}>
        대회 후 더보기
      </div>
      <Card pad={0} style={{ overflow: 'hidden' }}>
        {items.map((item, idx) => (
          <Link
            key={item.key}
            href={item.href}
            className="tm-list-row-interactive tm-pressable"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              minHeight: 60,
              padding: '12px 16px',
              borderBottom: idx < items.length - 1 ? '1px solid var(--border)' : 'none',
              textDecoration: 'none',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                flexShrink: 0,
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'var(--blue50)',
                color: 'var(--blue700)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              {item.icon}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>
                {item.label}
              </div>
              <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 1 }}>
                {item.caption}
              </div>
            </div>
            <ChevronRight size={16} strokeWidth={2.2} aria-hidden="true" style={{ color: 'var(--text-caption)', flexShrink: 0 }} />
          </Link>
        ))}
      </Card>
    </section>
  );
}

function HubFactRow({ item }: { item: TournamentVenuePrepItem }) {
  // status가 null이면 이 행엔 상태 배지를 렌더하지 않는다(아래 status 필드 주석 참고).
  // 배지가 없을 땐 3열(72px 1fr auto) 대신 2열(72px 1fr)로 재배치해 값 영역이
  // 남는 폭을 온전히 쓰도록 한다 — 빈 auto 컬럼만 남기지 않음.
  const hasBadge = item.status !== null;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: hasBadge ? '72px 1fr auto' : '72px 1fr',
        gap: 10,
        alignItems: 'start',
      }}
    >
      <div className="tm-text-caption" style={{ color: 'var(--text-caption)', paddingTop: 2 }}>
        {item.label}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>
          {item.value}
        </div>
        {item.detail ? (
          <div
            className="tm-text-caption"
            style={{ color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 2, whiteSpace: 'pre-line' }}
          >
            {item.detail}
          </div>
        ) : null}
        {item.actionLabel && item.href ? (
          item.hrefExternal ? (
            <a
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="tm-btn tm-btn-sm tm-btn-neutral"
              style={{ marginTop: 8 }}
            >
              {item.actionLabel}
            </a>
          ) : (
            <Link href={item.href} className="tm-btn tm-btn-sm tm-btn-neutral" style={{ marginTop: 8 }}>
              {item.actionLabel}
            </Link>
          )
        ) : null}
        {item.notice ? (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <div className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {item.notice.summary}
            </div>
            <Link
              href={item.notice.href}
              className="tm-text-caption"
              style={{ color: 'var(--blue700)', fontWeight: 600, marginTop: 2, display: 'inline-block' }}
            >
              {item.notice.actionLabel}
            </Link>
          </div>
        ) : null}
      </div>
      {item.status !== null ? <StatusBadge status={item.status} /> : null}
    </div>
  );
}

function StatusBadge({ status }: { status: HubState }) {
  const label = getStatusLabel(status);
  const badgeClass = status === 'confirmed' || status === 'available' ? 'tm-badge-blue' : 'tm-badge-grey';

  return (
    <span className={`tm-badge ${badgeClass}`} style={{ whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

function getStatusLabel(status: HubState): string {
  switch (status) {
    case 'confirmed':
      return '확정';
    case 'available':
      return '확인 가능';
    case 'operator_update':
      return '공지 대기';
    case 'upcoming':
      return '준비 중';
  }
}
