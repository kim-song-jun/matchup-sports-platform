import Link from 'next/link';
import { AppChrome } from '@/components/v1-ui/shell';
import { ChatIcon, RefreshIcon } from '@/components/v1-ui/icons';
import { Card, EmptyState, KPIStat, ListItem, NumberDisplay, SectionTitle, WeatherStrip } from '@/components/v1-ui/primitives';
import { cssUrl } from '@/lib/assets';
import { TournamentTeaserCard } from './tournament-teaser-card';
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
          <div className="tm-home-greeting-block" style={{ padding: '8px 20px 24px' }}>
            <div className="tm-text-label" style={{ color: 'var(--text-muted)' }}>
              {dash ? '안녕하세요' : `안녕하세요, ${model.viewerName}님`}
            </div>
            <div className="tm-home-stats">
              <div>
                <div className="tm-text-label" style={{ color: 'var(--text-muted)' }}>이번 달 활동</div>
                <NumberDisplay
                  value={dash ? '-' : model.stats.monthlyActivity}
                  unit={dash ? '' : '경기'}
                  size={36}
                  sub={dash ? '지난달 비교 -' : model.stats.monthlyActivitySub}
                />
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="tm-text-label" style={{ color: 'var(--text-muted)' }}>매너 점수</div>
                <NumberDisplay
                  value={dash ? '-' : model.stats.mannerScore}
                  unit={dash ? '' : '점'}
                  size={36}
                  sub={dash ? '상위 -' : model.stats.mannerScoreSub}
                />
              </div>
            </div>
          </div>

          {/* Featured recommendation hero */}
          <div className="tm-home-featured-block" style={{ margin: '0 20px 28px' }}>
            <div className="tm-text-label" style={{ marginBottom: 8 }}>오늘의 추천</div>
            <FeaturedMatchCard match={model.featuredMatch} network={model.network} signedOut={model.signedOut} onRetry={model.retry} />
            <TournamentTeaserCard />
          </div>

          {/* Recommended matches — horizontal rail on mobile, wrapped grid on desktop */}
          <div className="tm-home-matches-block">
            <SectionTitle title="추천 매치" sub={model.network ? '다시 불러오기가 필요합니다' : '실력에 맞는 경기 5개'} action="전체보기" actionHref="/matches" />
            {model.network ? (
              <div style={{ padding: '0 20px 8px' }}>
                <EmptyState title="새로고침이 필요합니다" sub="추천 목록과 대표 매치를 다시 불러올 수 있어야 합니다." cta="다시 불러오기" onCta={model.retry} />
              </div>
            ) : (
              <RecommendedMatchRail matches={model.recommendedMatches} />
            )}
          </div>

        </div>{/* /tm-home-main */}

        {/* ── RIGHT: sticky sidebar ─────────────────────────────────────── */}
        <div className="tm-home-sidebar">

          {/* Quick-action shortcuts: 매치 / 팀매치 / 팀 / 나의팀 */}
          <div>
            <div style={{ padding: '0 20px 28px' }}>
              <div className="tm-quick-grid">
                {model.quickActions.map((item) => (
                  <QuickAction key={item.label} item={item} />
                ))}
              </div>
            </div>
          </div>

          {/* Weather strip */}
          <div>
            <div style={{ padding: '0 20px 24px' }}>
              <div className="tm-home-weather-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 10 }}>
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
          </div>

          {/* Notices */}
          <div>
            {/* .tm-home-sidebar-notices gives the panel a card surface on desktop.
                The inner div retains the original mobile inline padding. */}
            <div className="tm-home-sidebar-notices" style={{ padding: '20px 20px 24px' }}>
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

        </div>{/* /tm-home-sidebar */}

      </div>{/* /tm-home-desktop */}
    </AppChrome>
  );
}

function HomeChatFloatingButton({ model }: { model: HomeViewModel }) {
  return (
    <Link className="tm-floating-fab tm-home-chat-fab" href={model.chatHref} aria-label={`채팅 ${model.chatUnreadCount}개 읽지 않음`}>
      <ChatIcon size={22} strokeWidth={2.2} />
      {model.chatUnreadCount > 0 ? <span className="tm-floating-count tab-num">{model.chatUnreadCount}</span> : null}
    </Link>
  );
}

function QuickAction({ item }: { item: HomeQuickAction }) {
  const content = (
    <>
      <div className="tm-quick-icon" style={{ background: item.background, color: item.color }}>
        {item.label[0].toUpperCase()}
      </div>
      <span className="tm-text-micro" style={{ color: 'var(--text-strong)', textAlign: 'center', lineHeight: 1.2 }}>
        {item.label}
      </span>
    </>
  );

  if (item.disabled || !item.href) {
    return (
      <button className="tm-pressable tm-quick-action" disabled type="button" aria-label={`${item.label} 이용 불가`}>
        {content}
      </button>
    );
  }

  return (
    <Link className="tm-pressable tm-quick-action" href={item.href}>
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
            <div className="tm-text-body-lg">새로고침이 필요합니다</div>
            <button className="tm-btn tm-btn-sm tm-btn-primary" type="button" style={{ marginTop: 10 }} onClick={onRetry}>
              다시 불러오기
            </button>
          </>
        ) : (
          <>
            <div className="tm-text-body-lg">{match.venue}</div>
            <div className="tm-text-caption" style={{ marginTop: 4 }}>
              {match.date} {match.time} · {match.currentParticipants}/{match.maxParticipants}명
            </div>
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
              <span className="tm-text-micro tab-num" style={{ color: 'var(--text-muted)' }}>
                {match.currentParticipants}/{match.maxParticipants}명
              </span>
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
