import Link from 'next/link';
import { AppChrome } from '@/components/v1-ui/shell';
import {
  ChatIcon,
  ChevronRightIcon,
  MatchIcon,
  MyIcon,
  RefreshIcon,
  TeamMatchIcon,
  TeamsIcon,
  TrophyIcon,
} from '@/components/v1-ui/icons';
import { Card, EmptyState, KPIStat, ListItem, NumberDisplay, SectionTitle, WeatherStrip } from '@/components/v1-ui/primitives';
import { cssUrl } from '@/lib/assets';
import { formatTournamentDateRangeShort } from '@/lib/date-utils';
import { useV1Tournaments } from '@/hooks/use-v1-api';
import type { V1TournamentListItem } from '@/types/api';
import { TournamentHeroCard } from './tournament-hero-card';
import type { HomeChatRoom, HomeMatchCard, HomeQuickAction, HomeViewModel } from './home.types';

export function HomePageView({ model }: { model: HomeViewModel }) {
  const dash = model.signedOut || model.network;
  const tournaments = useV1Tournaments({ status: 'open', limit: 5 });
  const tournamentItems = tournaments.data?.items ?? [];
  const hasFeaturedContent = model.network || Boolean(model.featuredMatch) || tournaments.isLoading || tournamentItems.length > 0;
  const hasRecommendedMatches = model.network || model.recommendedMatches.length > 0;

  return (
    <AppChrome
      title="teameet"
      activeTab="home"
      showSearch
      hasNewNotification={model.hasNewNotification && !model.network}
      floatingSlot={<HomeChatFloatingButton model={model} />}
    >
      {/*
       * .tm-home-desktop: display:contents on mobile → transparent to layout.
       * display:grid on desktop → 2-column dashboard (main | sidebar).
       * .tm-home-main / .tm-home-sidebar: display:contents on mobile so their
       * children flow in DOM order; on desktop they become flex columns that
       * slot into grid-column 1 and 2 respectively.
       */}
      <div className="tm-home-desktop">

        {/* ── LEFT: main content column ─────────────────────────────────── */}
        <div className="tm-home-main">

          {/* Greeting + activity stats */}
          <div className="tm-home-greeting-block">
            <div className="tm-text-label" style={{ color: 'var(--text-muted)' }}>
              {dash ? '안녕하세요' : `안녕하세요, ${model.viewerName}님`}
            </div>
            {/*
             * [taste-A] 통계 위계 후퇴: NumberDisplay 36→24 + 한 줄 컴팩트 스트립.
             * 통계가 인사말보다 시각 무게를 과점하던 위계 역전을 교정한다.
             * 두 항목을 gap 24px 수평 스트립으로 압축하고, 숫자 크기를 heading 레벨
             * (24px, --font-size-heading)로 낮춰 제목 레벨 아이덴티티를 유지하면서도
             * 히어로 카드·섹션 타이틀이 시각 우선순위를 되찾게 한다.
             */}
            <div className="tm-home-stats">
              <div>
                <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>이번 달 활동</div>
                <NumberDisplay
                  value={dash ? '-' : model.stats.monthlyActivity}
                  unit={dash ? '' : '경기'}
                  size={24}
                  sub={dash ? undefined : model.stats.monthlyActivitySub}
                />
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>매너 점수</div>
                <NumberDisplay
                  value={dash ? '-' : model.stats.mannerScore}
                  /* 점수 없을 때(빈 sentinel '-')는 '점' 단위 숨김 → "- 점" 어색함 방지 */
                  unit={dash || model.stats.mannerScore === '-' ? '' : '점'}
                  size={24}
                  sub={
                    /* '-' 단독 문자는 의미 없으므로 리뷰 누적 안내로 대체. */
                    dash || model.stats.mannerScoreSub === '-'
                      ? '경기 후 리뷰가 쌓이면 보여요'
                      : model.stats.mannerScoreSub
                  }
                />
              </div>
            </div>
          </div>

          {/* Featured recommendation hero — 가로 캐러셀(스와이프) */}
          {hasFeaturedContent ? (
          <div className="tm-home-featured-block">
            <div style={{ marginBottom: 10 }}>
              <div className="tm-text-label">오늘의 추천</div>
              <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 2 }}>지금 눈여겨볼 매치·대회</div>
            </div>
            <div className="tm-home-featured-carousel">
              {model.featuredMatch ? (
                <FeaturedMatchCard match={model.featuredMatch} network={model.network} signedOut={model.signedOut} onRetry={model.retry} />
              ) : null}
              <TournamentHeroCard items={tournamentItems} loading={tournaments.isLoading} />
            </div>
          </div>
          ) : null}

          <HomeChatSummary model={model} />

          {/* Recommended matches — horizontal rail on mobile, wrapped grid on desktop */}
          {hasRecommendedMatches ? (
          <div className="tm-home-matches-block">
            <SectionTitle title="추천 매치" sub={model.network ? '다시 불러올게요' : '내 실력에 맞는 매치 추천'} action="전체보기" actionHref="/matches" />
            {model.network ? (
              <div style={{ padding: '0 20px 8px' }}>
                {/* [P2 UX 라이팅] 능동형 + 해요체 */}
                <EmptyState title="목록을 불러오지 못했어요" sub="아래 버튼으로 다시 불러올 수 있어요." cta="다시 불러오기" onCta={model.retry} />
              </div>
            ) : (
              <RecommendedMatchRail matches={model.recommendedMatches} />
            )}
          </div>
          ) : null}

        </div>{/* /tm-home-main */}

        {/* ── RIGHT: sticky sidebar ─────────────────────────────────────── */}
        <div className="tm-home-sidebar">

          {/* Quick-action shortcuts: 매치 / 팀매치 / 팀 / 나의팀 */}
          <div className="tm-home-sidebar-quickgrid-wrap">
            <div className="tm-quick-grid">
              {model.quickActions.map((item) => (
                <QuickAction key={item.label} item={item} />
              ))}
            </div>
          </div>

          {/* Weather strip */}
          <div className="tm-home-sidebar-weather-wrap">
            {/* 인라인 style 제거 → home.css .tm-home-weather-head 규칙으로 이전 */}
            <div className="tm-home-weather-head">
              <div className="tm-text-label">현재 위치 날씨</div>
              <button
                className="tm-btn tm-btn-icon tm-btn-neutral"
                type="button"
                onClick={model.refreshWeather}
                disabled={!model.refreshWeather || model.weatherRefreshing}
                aria-label={model.weatherRefreshing ? '날씨 확인 중' : '현재 위치 날씨 새로고침'}
                title={model.weatherRefreshing ? '확인 중' : '새로고침'}
              >
                <RefreshIcon size={18} strokeWidth={2.1} />
              </button>
            </div>
            <WeatherStrip {...model.weather} />
          </div>

          {/* Notices */}
          <div>
            {/* .tm-home-sidebar-notices gives the panel a card surface on desktop.
                The inner div retains the original mobile inline padding. */}
            <div className="tm-home-sidebar-notices">
              <div className="tm-notice-head">
                <div className="tm-text-body-lg">공지사항</div>
                <Link className="tm-btn tm-btn-sm tm-btn-ghost" href="/notices" style={{ alignSelf: 'flex-end', padding: '0 4px' }}>
                  전체보기
                </Link>
              </div>
              {model.notices.length > 0 ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  {model.notices.map((notice) => (
                    <ListItem key={notice.id} title={notice.title} trailing={notice.trailing} href={`/notices/${notice.id}`} chev />
                  ))}
                </div>
              ) : (
                <div className="tm-text-caption" style={{ color: 'var(--text-muted)', paddingTop: 8 }}>
                  새 공지사항이 없어요.
                </div>
              )}
            </div>
          </div>

          {/* Upcoming tournaments — fills remaining sidebar height, avoids ~830px gap */}
          <SidebarTournamentsWidget items={tournamentItems} loading={tournaments.isLoading} />

        </div>{/* /tm-home-sidebar */}

      </div>{/* /tm-home-desktop */}
    </AppChrome>
  );
}

function HomeChatSummary({ model }: { model: HomeViewModel }) {
  const unreadLabel = model.chatUnreadCount > 0 ? `읽지 않은 메시지 ${model.chatUnreadCount}개` : '새 메시지 없음';
  const body = (() => {
    if (model.signedOut) {
      return (
        <Card pad={16} className="tm-home-chat-empty">
          <div className="tm-text-body-lg">로그인하면 매치와 팀 채팅을 이어볼 수 있어요.</div>
          <Link className="tm-btn tm-btn-sm tm-btn-primary" href="/login" style={{ marginTop: 12 }}>
            로그인하기
          </Link>
        </Card>
      );
    }

    if (model.chatStatus === 'loading') {
      return (
        <Card pad={16} className="tm-home-chat-empty" aria-busy="true">
          <div className="tm-text-body-lg">채팅방을 불러오고 있어요</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>최근 대화를 확인하는 중이에요.</div>
        </Card>
      );
    }

    if (model.chatStatus === 'error') {
      return (
        <Card pad={16} className="tm-home-chat-empty">
          <div className="tm-text-body-lg">채팅방을 불러오지 못했어요</div>
          <Link className="tm-btn tm-btn-sm tm-btn-neutral" href={model.chatHref} style={{ marginTop: 12 }}>
            채팅으로 이동
          </Link>
        </Card>
      );
    }

    if (model.chatRooms.length === 0) {
      return (
        <Card pad={16} className="tm-home-chat-empty">
          <div className="tm-text-body-lg">아직 열려 있는 채팅방이 없어요</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>매치에 참가하거나 팀에 가입하면 채팅방이 생겨요.</div>
        </Card>
      );
    }

    return (
      <div className="tm-home-chat-list">
        {model.chatRooms.map((room) => (
          <HomeChatRoomRow key={room.id} room={room} />
        ))}
      </div>
    );
  })();

  return (
    <section className="tm-home-chat-block" aria-labelledby="home-chat-title">
      <SectionTitle id="home-chat-title" title="최근 채팅" sub={unreadLabel} action="전체보기" actionHref={model.chatHref} />
      {body}
    </section>
  );
}

function HomeChatRoomRow({ room }: { room: HomeChatRoom }) {
  return (
    <Link className={`tm-pressable tm-home-chat-row ${room.unreadCount > 0 ? 'tm-home-chat-row-unread' : ''}`} href={room.href}>
      <div className="tm-home-chat-icon" aria-hidden="true">
        <ChatIcon size={18} strokeWidth={2.1} />
      </div>
      <div className="tm-home-chat-copy">
        <div className="tm-home-chat-title-line">
          <span className="tm-text-label line-clamp-1">{room.title}</span>
          <span className="tm-badge tm-badge-grey tm-badge-sm">{room.typeLabel}</span>
        </div>
        <div className={`tm-text-caption line-clamp-1 ${room.unreadCount > 0 ? 'tm-home-chat-last-unread' : ''}`}>
          {room.lastMessage}
        </div>
      </div>
      <div className="tm-home-chat-meta">
        {room.time ? <span className="tm-text-micro">{room.time}</span> : null}
        {room.unreadCount > 0 ? (
          <span className="tm-home-chat-row-count tab-num" aria-label={`읽지 않은 메시지 ${room.unreadCount}개`}>
            {room.unreadCount}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

function HomeChatFloatingButton({ model }: { model: HomeViewModel }) {
  return (
    <Link
      className="tm-floating-fab tm-home-chat-fab"
      href={model.chatHref}
      aria-label="채팅"
    >
      <ChatIcon size={22} strokeWidth={2.2} />
      {model.chatUnreadCount > 0 ? (
        <span className="tm-floating-count tab-num" aria-hidden="true">{model.chatUnreadCount}</span>
      ) : null}
    </Link>
  );
}

/** 진입점별 SVG 아이콘 — label 첫 글자 텍스트 대체 금지(a11y: 컬러만으로 정보 전달 방지). */
function QuickActionIcon({ item }: { item: HomeQuickAction }) {
  const iconProps = { size: 20, strokeWidth: 2, 'aria-hidden': true } as const;
  switch (item.key) {
    case 'matches':
      return <MatchIcon {...iconProps} />;
    case 'team_matches':
      return <TeamMatchIcon {...iconProps} />;
    case 'teams':
      return <TeamsIcon {...iconProps} />;
    case 'my_team':
      return <MyIcon {...iconProps} />;
    default:
      // key 미지정 항목은 MatchIcon을 기본값으로 사용(라벨 텍스트 아이콘 금지).
      return <MatchIcon {...iconProps} />;
  }
}

function QuickAction({ item }: { item: HomeQuickAction }) {
  const content = (
    <>
      {/*
       * [taste-A] 퀵액션 아이콘 색 강조 낮춤 — 아이콘만 컬러, 배경은 중립 grey50.
       * 기존: orange·green·blue 배경이 동시에 노출 → 다중 강조색 충돌(R-C1 위반 경계).
       * 변경: 배경은 통일 var(--grey50), 아이콘 컬러만 item.color로 종목/기능 식별.
       * 아이콘+라벨 텍스트 병행으로 컬러만으로 정보 전달하지 않는다(R-C3 준수).
       */}
      <div className="tm-quick-icon" style={{ background: 'var(--grey50)', color: item.color }}>
        <QuickActionIcon item={item} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <span className="tm-text-label" style={{ color: 'var(--text-strong)', textAlign: 'center', lineHeight: 1.2 }}>
          {item.label}
        </span>
        <span className="tm-text-micro" style={{ color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.2 }}>
          {item.sub}
        </span>
      </div>
    </>
  );

  if (item.disabled || !item.href) {
    return (
      <button className="tm-pressable tm-quick-action" disabled type="button" aria-label={`${item.label} - 현재 이용할 수 없어요`}>
        {content}
      </button>
    );
  }

  return (
    <Link className="tm-pressable tm-quick-action" href={item.href} aria-label={item.label}>
      {content}
    </Link>
  );
}

function FeaturedMatchCard({
  match,
  network,
  signedOut,
  onRetry,
}: {
  match: HomeMatchCard;
  network: boolean;
  signedOut: boolean;
  onRetry?: () => void;
}) {
  const card = (
    <Card pad={0} className="tm-featured-card" style={{ overflow: 'hidden' }}>
      <div
        className="tm-featured-media"
        style={{ background: network ? 'var(--grey100)' : `${cssUrl(match.imageUrl)} center/cover` }}
      >
        {!network ? (
          <div className="tm-featured-overlay">
            <div className="tm-featured-text">
              <div className="tm-text-micro" style={{ color: 'var(--static-white)' }}>
                {signedOut ? '랜덤 추천 매치' : match.reason ?? '관심 종목 기반 추천'}
              </div>
              <div className="tm-text-subhead" style={{ color: 'var(--static-white)', marginTop: 4 }}>
                {match.title}
              </div>
            </div>
          </div>
        ) : null}
      </div>
      <div className="tm-featured-content">
        {network ? (
          <>
            {/* [P2 UX 라이팅] 에러 상황: 수동형 유지(실패 사실 전달) + CTA 능동형 */}
            <div className="tm-text-body-lg">목록을 불러오지 못했어요</div>
            <button className="tm-btn tm-btn-sm tm-btn-primary" type="button" style={{ marginTop: 10 }} onClick={onRetry}>
              다시 불러오기
            </button>
          </>
        ) : (
          <>
            <div className="tm-text-body-lg">{match.venue}</div>
            <div className="tm-text-caption" style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {match.date} {match.time} ·{' '}
              {/* [P1 숫자:단위 2:1 + tabular-nums] 참가 인원 조판 */}
              <span style={{ fontVariantNumeric: 'tabular-nums', display: 'inline-flex', alignItems: 'baseline', gap: 1 }}>
                <span style={{ fontWeight: 700, color: 'var(--text-strong)' }}>{match.currentParticipants}/{match.maxParticipants}</span>
                <span className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>명</span>
              </span>
              {/* #8: 잔여 자리 ≤3일 때 orange 배지로 희소성 강조 */}
              {Math.max(match.maxParticipants - match.currentParticipants, 0) <= 3 && match.currentParticipants < match.maxParticipants
                ? <span className="tm-badge tm-badge-orange">마감 임박</span>
                : null}
            </div>
            {/*
             * [taste-A] 히어로 카드 주요 CTA — solid blue primary 버튼 1개.
             * 기존에는 카드 자체(Link)가 CTA 역할을 암묵적으로 맡고 있었으나,
             * 시각적 종착점(explicit CTA)이 없어 행동 유도력이 약했다.
             * 카드 전체 Link를 유지하되, 카드 내부 CTA 버튼을 추가해
             * 명시적 행동 신호를 제공한다. (R-K5: CTA 화면당 최대 1개)
             * <a> 안에 <button>(interactive-in-interactive) 중첩은 HTML5 스펙 위반이라
             * 비-interactive 요소(span)로 렌더링한다(Copilot 리뷰 지적, PR #51).
             * .tm-featured-cta(marginTop:12px 고정) — 대회 히어로(TournamentHeroCard)와
             * 짝을 이루는 텍스트→버튼 간격. 카드 바닥 경계 정합은 .tm-featured-card의
             * height:100%가 담당하므로 버튼 자체는 하단 고정 대신 텍스트 바로 아래 붙인다.
             */}
            <span
              className="tm-btn tm-btn-primary tm-btn-sm tm-featured-cta"
              aria-hidden="true"
            >
              {match.actionLabel ?? '신청하기'}
            </span>
          </>
        )}
      </div>
    </Card>
  );

  return network ? card : (
    <Link className="tm-featured-link tm-pressable" href={`/matches/${match.id}`}>
      {card}
    </Link>
  );
}

/**
 * 사이드바 대회 위젯 — open/in_progress 대회 목록(최대 4개).
 * 우측 사이드바 하단의 빈 공간(~830px)을 채워 레이아웃 균형을 맞춘다.
 * 모바일(<1024px)에서는 display:contents인 .tm-home-sidebar 덕분에 DOM 순서상 notices 아래에 자연스럽게 흐른다.
 */
function SidebarTournamentsWidget({ items, loading }: { items: V1TournamentListItem[]; loading: boolean }) {
  const visibleItems = items.slice(0, 4);

  return (
    <div className="tm-home-sidebar-notices">
      <div className="tm-notice-head">
        <div className="tm-text-body-lg">진행 중인 대회</div>
        <Link
          className="tm-btn tm-btn-sm tm-btn-ghost"
          href="/tournaments"
          style={{ alignSelf: 'flex-end', padding: '0 4px' }}
        >
          전체보기
        </Link>
      </div>

      {loading ? (
        /* [P2 UX 라이팅] 능동형 로딩 안내 */
        <div
          className="tm-text-caption"
          style={{ color: 'var(--text-muted)', paddingTop: 8 }}
          aria-busy="true"
          role="status"
        >
          대회 목록을 가져오고 있어요…
        </div>
      ) : visibleItems.length === 0 ? (
        <div
          className="tm-text-caption"
          style={{ color: 'var(--text-muted)', paddingTop: 8 }}
        >
          현재 모집 중인 대회가 없어요.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {visibleItems.map((t) => {
            const dateLabel = formatTournamentDateRangeShort(t.scheduledAt, t.scheduledEndAt);
            return (
              <Link
                key={t.id}
                href={`/tournaments/${t.id}`}
                className="tm-pressable"
                aria-label={`대회 상세 보기 — ${t.title}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  minHeight: 44,
                }}
              >
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: 'var(--blue50)',
                    color: 'var(--blue500)',
                  }}
                  aria-hidden="true"
                >
                  <TrophyIcon size={16} strokeWidth={2} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    className="tm-text-label line-clamp-1"
                    style={{ color: 'var(--text-strong)' }}
                  >
                    {t.title}
                  </div>
                  <div
                    className="tm-text-micro"
                    style={{ color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'baseline', gap: 2, flexWrap: 'wrap' }}
                  >
                    {t.sport.name}
                    {dateLabel ? ` · ${dateLabel}` : ''}
                    {' · '}
                    {/* [P1 숫자:단위 2:1 + tabular-nums] 팀 수 */}
                    <span style={{ fontVariantNumeric: 'tabular-nums', display: 'inline-flex', alignItems: 'baseline', gap: 1 }}>
                      <span style={{ fontWeight: 600 }}>{t.confirmedCount}/{t.teamCount}</span>
                      <span style={{ fontSize: 9 }}>팀</span>
                    </span>
                  </div>
                </div>
                <ChevronRightIcon size={14} strokeWidth={2} style={{ flexShrink: 0, color: 'var(--text-muted)' }} aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RecommendedMatchRail({ matches }: { matches: HomeMatchCard[] }) {
  return (
    <div className="tm-match-rail">
      {matches.map((match) => (
        <Link key={match.id} className="tm-pressable tm-match-card" href={`/matches/${match.id}`}>
          <div className="tm-match-card-media" style={{ background: `${cssUrl(match.imageUrl)} center/cover` }} />
          <div style={{ padding: 16 }}>
            <div className="tm-text-micro" style={{ color: 'var(--blue500)' }}>{match.sportLabel}</div>
            <div className="tm-text-label line-clamp-2" style={{ color: 'var(--text-strong)', marginTop: 4, minHeight: 36 }}>
              {match.title}
            </div>
            <div className="tm-match-card-footer">
              {/* #8: 잔여 자리 ≤3일 때 인원 수치를 orange로 + 텍스트 강조 */}
              {/* [P1 숫자:단위 2:1 + tabular-nums] 인원수 조판: 숫자 font-weight 700, 단위 절반 크기 */}
              {Math.max(match.maxParticipants - match.currentParticipants, 0) <= 3 && match.currentParticipants < match.maxParticipants ? (
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2, fontVariantNumeric: 'tabular-nums' }}>
                  <span className="tm-text-micro" style={{ color: 'var(--orange600)', fontWeight: 700 }}>
                    {match.currentParticipants}/{match.maxParticipants}
                  </span>
                  <span style={{ fontSize: 9, color: 'var(--orange600)', fontWeight: 600 }}>명</span>
                  <span className="tm-badge tm-badge-orange" style={{ marginLeft: 2 }}>마감 임박</span>
                </span>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 1, fontVariantNumeric: 'tabular-nums' }}>
                  <span className="tm-text-micro" style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
                    {match.currentParticipants}/{match.maxParticipants}
                  </span>
                  <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>명</span>
                </span>
              )}
              <span className="tm-text-label tab-num" style={{ color: 'var(--text-strong)' }}>
                {match.actionLabel}
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
