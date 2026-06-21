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
import { formatTournamentDateShort } from '@/lib/date-utils';
import { useV1Tournaments } from '@/hooks/use-v1-api';
import { TournamentHeroCard } from './tournament-hero-card';
import type { HomeMatchCard, HomeQuickAction, HomeViewModel } from './home.types';

export function HomePageView({ model }: { model: HomeViewModel }) {
  const dash = model.signedOut || model.network;

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
          <div className="tm-home-featured-block">
            <div style={{ marginBottom: 10 }}>
              <div className="tm-text-label">오늘의 추천</div>
              <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 2 }}>지금 눈여겨볼 매치·대회</div>
            </div>
            <div className="tm-home-featured-carousel">
              <FeaturedMatchCard match={model.featuredMatch} network={model.network} signedOut={model.signedOut} onRetry={model.retry} />
              <TournamentHeroCard />
            </div>
          </div>

          {/* Recommended matches — horizontal rail on mobile, wrapped grid on desktop */}
          <div className="tm-home-matches-block">
            <SectionTitle title="추천 매치" sub={model.network ? '다시 불러올게요' : '내 실력에 맞는 매치 추천'} action="전체보기" actionHref="/matches" />
            {model.network ? (
              <div style={{ padding: '0 20px 8px' }}>
                <EmptyState title="목록을 불러오지 못했어요" sub="추천 목록과 대표 매치를 다시 불러와야 해요." cta="다시 불러오기" onCta={model.retry} />
              </div>
            ) : (
              <RecommendedMatchRail matches={model.recommendedMatches} />
            )}
          </div>

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
                <Link className="tm-btn tm-btn-sm tm-btn-ghost" href="/notices" style={{ alignSelf: 'flex-end', minHeight: 30, padding: '0 4px' }}>
                  전체보기
                </Link>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {model.notices.map((notice) => (
                  <ListItem key={notice.id} title={notice.title} sub={notice.summary} trailing={notice.trailing} href={`/notices/${notice.id}`} chev />
                ))}
              </div>
            </div>
          </div>

          {/* Upcoming tournaments — fills remaining sidebar height, avoids ~830px gap */}
          <SidebarTournamentsWidget />

        </div>{/* /tm-home-sidebar */}

      </div>{/* /tm-home-desktop */}
    </AppChrome>
  );
}

function HomeChatFloatingButton({ model }: { model: HomeViewModel }) {
  return (
    <Link className="tm-floating-fab tm-home-chat-fab" href={model.chatHref} aria-label={`읽지 않은 채팅 ${model.chatUnreadCount}개`}>
      <ChatIcon size={22} strokeWidth={2.2} />
      {model.chatUnreadCount > 0 ? <span className="tm-floating-count tab-num">{model.chatUnreadCount}</span> : null}
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
    <Card pad={0} style={{ overflow: 'hidden' }}>
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
      <div style={{ padding: 16 }}>
        {network ? (
          <>
            <div className="tm-text-body-lg">목록을 불러오지 못했어요</div>
            <button className="tm-btn tm-btn-sm tm-btn-primary" type="button" style={{ marginTop: 10 }} onClick={onRetry}>
              다시 불러오기
            </button>
          </>
        ) : (
          <>
            <div className="tm-text-body-lg">{match.venue}</div>
            <div className="tm-text-caption" style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {match.date} {match.time} · {match.currentParticipants}/{match.maxParticipants}명
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
             */}
            <button
              className="tm-btn tm-btn-primary tm-btn-sm"
              type="button"
              style={{ marginTop: 12, width: '100%', pointerEvents: 'none' }}
              aria-hidden="true"
              tabIndex={-1}
            >
              {match.actionLabel ?? '신청하기'}
            </button>
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
function SidebarTournamentsWidget() {
  const { data, isLoading } = useV1Tournaments({ status: 'open', limit: 4 });
  const items = (data?.items ?? []).slice(0, 4);

  return (
    <div className="tm-home-sidebar-notices">
      <div className="tm-notice-head">
        <div className="tm-text-body-lg">진행 중인 대회</div>
        <Link
          className="tm-btn tm-btn-sm tm-btn-ghost"
          href="/tournaments"
          style={{ alignSelf: 'flex-end', minHeight: 30, padding: '0 4px' }}
        >
          전체보기
        </Link>
      </div>

      {isLoading ? (
        <div
          className="tm-text-caption"
          style={{ color: 'var(--text-muted)', paddingTop: 8 }}
          aria-busy="true"
        >
          대회 목록을 불러오는 중이에요…
        </div>
      ) : items.length === 0 ? (
        <div
          className="tm-text-caption"
          style={{ color: 'var(--text-muted)', paddingTop: 8 }}
        >
          현재 모집 중인 대회가 없어요.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {items.map((t) => {
            const dateLabel = formatTournamentDateShort(t.scheduledAt);
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
                    className="tm-text-micro tab-num"
                    style={{ color: 'var(--text-muted)', marginTop: 2 }}
                  >
                    {t.sport.name}
                    {dateLabel ? ` · ${dateLabel}` : ''}
                    {' · '}
                    <span>{t.confirmedCount}/{t.teamCount}팀</span>
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
          <div style={{ padding: 12 }}>
            <div className="tm-text-micro" style={{ color: 'var(--blue500)' }}>{match.sportLabel}</div>
            <div className="tm-text-label line-clamp-2" style={{ color: 'var(--text-strong)', marginTop: 4, minHeight: 36 }}>
              {match.title}
            </div>
            <div className="tm-match-card-footer">
              {/* #8: 잔여 자리 ≤3일 때 인원 수치를 orange로 + 텍스트 강조 */}
              {Math.max(match.maxParticipants - match.currentParticipants, 0) <= 3 && match.currentParticipants < match.maxParticipants ? (
                <span className="tm-text-micro tab-num" style={{ color: 'var(--orange500)', fontWeight: 700 }}>
                  {match.currentParticipants}/{match.maxParticipants}명 · 마감 임박
                </span>
              ) : (
                <span className="tm-text-micro tab-num" style={{ color: 'var(--text-muted)' }}>
                  {match.currentParticipants}/{match.maxParticipants}명
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
