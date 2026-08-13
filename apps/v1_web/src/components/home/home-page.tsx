import Link from 'next/link';
import { ShieldAlert, X } from 'lucide-react';
import { AppChrome } from '@/components/v1-ui/shell';
import { LineupTodoCard } from '@/components/lineup/lineup-todo-card';
import {
  BellIcon,
  ChatIcon,
  ChevronRightIcon,
  MatchIcon,
  MyIcon,
  RefreshIcon,
  TeamMatchIcon,
  TeamsIcon,
  TrophyIcon,
} from '@/components/v1-ui/icons';
import { Card, ErrorState, KPIStat, ListItem, NumberDisplay, SectionTitle, WeatherStrip } from '@/components/v1-ui/primitives';
import { cssUrl } from '@/lib/assets';
import { formatTournamentDateRangeShort } from '@/lib/date-utils';
import { useV1AllTournaments } from '@/hooks/use-v1-api';
import type { V1TournamentListItem } from '@/types/api';
import { TournamentHeroCard } from './tournament-hero-card';
import type { HomeChatRoom, HomeMatchCard, HomeQuickAction, HomeViewModel } from './home.types';

export function HomePageView({ model }: { model: HomeViewModel }) {
  const dash = model.signedOut || model.network;
  const tournaments = useV1AllTournaments({ status: 'open' });
  const tournamentItems = tournaments.data ?? [];
  // TournamentHeroCard owns the promoHomeEnabled filter + sort — this only needs
  // to know whether *any* eligible item exists, to decide the section's visibility.
  const hasHomePromo = tournamentItems.some((item) => item.status === 'open' && item.promoHomeEnabled);
  const hasFeaturedContent = model.network || Boolean(model.featuredMatch) || tournaments.isLoading || tournaments.isError || hasHomePromo;
  const hasRecommendedMatches = model.network || model.recommendedMatches.length > 0;
  const weatherPermission = model.weatherPermission ?? 'prompt';
  const weatherPermissionCopy = getWeatherPermissionCopy(weatherPermission);

  return (
    <>
      <AppChrome
        title="teameet"
        activeTab="home"
        showSearch
        hasNewNotification={model.hasNewNotification && !model.network}
        floatingSlot={<HomeChatFloatingButton model={model} />}
      >
      <h1 className="sr-only">Teameet 홈</h1>
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

          {model.pushNudge ? <PushNudgeBanner pushNudge={model.pushNudge} /> : null}
          {model.phoneVerifyNudge ? <PhoneVerifyBanner phoneVerifyNudge={model.phoneVerifyNudge} /> : null}

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
              {tournaments.isError ? (
                <Card pad={16}>
                  <ErrorState
                    title="대회 추천을 불러오지 못했어요"
                    message="잠시 후 다시 시도해 주세요."
                    onRetry={() => void tournaments.refetch()}
                    retryLabel="다시 불러오기"
                  />
                </Card>
              ) : (
                <TournamentHeroCard items={tournamentItems} loading={tournaments.isLoading} />
              )}
            </div>
          </div>
          ) : null}

          {/* 라인업을 아직 넣지 않은 경기가 있으면 가장 먼저 보여준다 — 놓치면 경기 당일에
              발을 구르게 되는 일이라, 추천 매치나 채팅보다 위에 온다. 할 일이 없으면
              컴포넌트가 스스로 아무것도 그리지 않으므로 빈 자리가 생기지 않는다. */}
          <LineupTodoCard enabled={!model.signedOut} />

          <HomeChatSummary model={model} />

          {/* Recommended matches — horizontal rail on mobile, wrapped grid on desktop */}
          {hasRecommendedMatches ? (
          <div className="tm-home-matches-block">
            <SectionTitle title="추천 매치" sub={model.network ? '다시 불러올게요' : '내 실력에 맞는 매치 추천'} action="전체보기" actionHref="/matches" />
            {model.network ? (
              <div className="tm-home-matches-error-wrap">
                {/* [P2 UX 라이팅] 능동형 + 해요체. role="alert"는 ErrorState 자체 루트에 이미
                    있어(primitives.tsx) 여기서 다시 걸면 중첩 live region이 된다 — 추가 안 함. */}
                <ErrorState title="목록을 불러오지 못했어요" message="아래 버튼으로 다시 불러올 수 있어요." onRetry={model.retry} retryLabel="다시 불러오기" />
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
              <div>
                <div className="tm-text-label">내 위치 날씨</div>
                <div className="tm-text-caption" style={{ marginTop: 2 }}>
                  {weatherPermissionCopy}
                </div>
              </div>
              <button
                className="tm-btn tm-btn-icon tm-btn-neutral"
                type="button"
                onClick={model.refreshWeather}
                disabled={!model.refreshWeather || model.weatherRefreshing || weatherPermission === 'unsupported'}
                aria-label={model.weatherRefreshing ? '날씨 확인 중' : weatherPermission === 'granted' ? '현재 위치 날씨 다시 확인' : '위치 권한을 확인하고 날씨 보기'}
                title={model.weatherRefreshing ? '확인 중' : weatherPermission === 'granted' ? '날씨 다시 확인' : '위치로 날씨 보기'}
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
    </>
  );
}

function getWeatherPermissionCopy(permission: NonNullable<HomeViewModel['weatherPermission']>) {
  if (permission === 'checking') return '브라우저의 위치 허용 상태를 확인하고 있어요.';
  if (permission === 'granted') return '권한은 허용되어 있어요. 버튼을 누를 때만 Teameet와 날씨·지역 확인 제공처에 좌표를 1회 전송해요.';
  if (permission === 'denied') return '브라우저 설정에서 위치를 허용한 뒤 다시 확인해 주세요.';
  if (permission === 'unsupported') return '이 브라우저에서는 위치 기반 날씨를 사용할 수 없어요.';
  return '버튼을 누르면 권한을 요청하고 Teameet와 날씨·지역 확인 제공처에 좌표를 1회 전송해요.';
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
          <ErrorState title="채팅방을 불러오지 못했어요" message="다시 불러오거나 채팅 목록으로 이동해 보세요." onRetry={model.chatRetry} retryLabel="다시 불러오기" />
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

function PushNudgeBanner({ pushNudge }: { pushNudge: NonNullable<HomeViewModel['pushNudge']> }) {
  return (
    <Card pad={14} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span
        aria-hidden="true"
        style={{
          flexShrink: 0,
          width: 36,
          height: 36,
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--blue-soft)',
          color: 'var(--blue700)',
        }}
      >
        <BellIcon size={18} strokeWidth={2} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="tm-text-label">알림을 받아보세요</div>
        <div className="tm-text-caption" style={{ marginTop: 2 }}>매칭, 채팅, 경기 결과 소식을 놓치지 않아요.</div>
      </div>
      <button
        type="button"
        className="tm-btn tm-btn-sm tm-btn-primary"
        style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
        disabled={pushNudge.subscribing}
        onClick={pushNudge.onSubscribe}
      >
        {pushNudge.subscribing ? '확인 중' : '알림 받기'}
      </button>
      <button
        type="button"
        aria-label="알림 받기 안내 닫기"
        className="tm-pressable"
        style={{ flexShrink: 0, padding: 6, minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        onClick={pushNudge.onDismiss}
      >
        <X size={18} aria-hidden="true" />
      </button>
    </Card>
  );
}

function PhoneVerifyBanner({ phoneVerifyNudge }: { phoneVerifyNudge: NonNullable<HomeViewModel['phoneVerifyNudge']> }) {
  return (
    <Card pad={14} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span
        aria-hidden="true"
        style={{
          flexShrink: 0,
          width: 36,
          height: 36,
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--orange-soft)',
          color: 'var(--orange700)',
        }}
      >
        <ShieldAlert size={18} strokeWidth={2} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="tm-text-label">휴대폰 본인인증이 필요해요</div>
        <div className="tm-text-caption" style={{ marginTop: 2 }}>인증해야 대회 신청·팀 활동을 할 수 있어요.</div>
      </div>
      <button
        type="button"
        className="tm-btn tm-btn-sm tm-btn-primary"
        style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
        onClick={phoneVerifyNudge.onVerify}
      >
        인증하기
      </button>
    </Card>
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
       * [taste-A] 퀵액션 아이콘 색 강조 낮춤 — 아이콘만 컬러, 배경은 중립.
       * 기존: orange·green·blue 배경이 동시에 노출 → 다중 강조색 충돌(R-C1 위반 경계).
       * 변경: 배경은 통일 var(--grey100), 아이콘 컬러만 item.color로 종목/기능 식별.
       * 아이콘+라벨 텍스트 병행으로 컬러만으로 정보 전달하지 않는다(R-C3 준수).
       * grey100 사용 이유: 부모 .tm-quick-grid가 --grey50이라 동일 토큰을 재참조하면
       * 44px 타일 경계가 사라진다 — 이 도메인의 기존 중립 아이콘칩 패턴
       * (.tm-weather-icon-cloud/.tm-weather-icon-fog, globals.css)과 동일하게 한 단계
       * 진한 grey100으로 타일 경계를 확보한다.
       * 배경색은 .tm-quick-icon(globals.css)이 담당 — 다크에서는 --grey100(#1c1e24)이
       * 그리드 배경과의 명도차가 거의 없어 :root.dark 오버라이드로 --grey150(#20222a)을 쓴다.
       */}
      <div className="tm-quick-icon" style={{ color: item.color }}>
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
      <div className={network ? 'tm-featured-content' : 'tm-featured-content tm-featured-content-with-cta'}>
        {network ? (
          <ErrorState title="목록을 불러오지 못했어요" message="잠시 후 다시 시도해 주세요." onRetry={onRetry} retryLabel="다시 불러오기" />
        ) : (
          <>
            <div className="tm-featured-copy">
              <div className="tm-text-body-lg">{match.venue}</div>
              <div
                className="tm-text-caption tm-featured-meta"
                style={{ marginTop: 6, display: 'flex', alignItems: 'center', columnGap: 8, rowGap: 4, flexWrap: 'wrap' }}
              >
                <span style={{ color: 'var(--text-strong)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {match.date} {match.time}
                </span>
                <span style={{ fontVariantNumeric: 'tabular-nums', display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-strong)' }}>{match.currentParticipants}/{match.maxParticipants}</span>
                  <span className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>명</span>
                </span>
                {Math.max(match.maxParticipants - match.currentParticipants, 0) <= 3 && match.currentParticipants < match.maxParticipants
                  ? <span className="tm-badge tm-badge-orange">마감 임박</span>
                  : null}
              </div>
            </div>
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
                  // 2026-08-11: 순수 내비게이션 카드 아이콘 — 무채색 통일(마이허브 메뉴와 동일 근거)
                  // 2026-08-12: [인라인 style 우선순위 fix] 배경을 인라인으로 두면 다크모드
                  // 전용 클래스 오버라이드(.tm-tournament-widget-icon, globals.css)가 절대
                  // 못 이겨서 배지가 여전히 카드에 녹아 사라졌다 — 배경은 CSS 클래스로만 관리.
                  className="tm-tournament-widget-icon"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    color: 'var(--text-strong)',
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
                    {/* [P1 숫자:단위 2:1 + tabular-nums] 팀 수.
                        [R-T2] 단위(9px)가 하한(12px)에 3px 미달 — 알파 실측
                        최다 위반. 숫자:단위 크기비로 위계를 주던 것을 굵기
                        위계(숫자 600, 단위 기본)로 옮기고 둘 다 12px로 맞춘다
                        (R-T3 "강조는 weight로"와도 합치). 부모 div가
                        flexWrap:wrap이라 폭이 늘어도 줄바꿈으로 흡수된다. */}
                    <span style={{ fontVariantNumeric: 'tabular-nums', display: 'inline-flex', alignItems: 'baseline', gap: 1 }}>
                      <span style={{ fontWeight: 600 }}>{t.confirmedCount}/{t.teamCount}</span>
                      <span style={{ fontSize: 12 }}>팀</span>
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
            <div className="tm-text-micro" style={{ color: 'var(--blue700)' }}>{match.sportLabel}</div>
            <div className="tm-text-label line-clamp-2" style={{ color: 'var(--text-strong)', marginTop: 4, minHeight: 36 }}>
              {match.title}
            </div>
            <div className="tm-match-card-footer">
              {/* #8: 잔여 자리 ≤3일 때 인원 수치를 orange로 + 텍스트 강조 */}
              {/* [P1 숫자:단위 2:1 + tabular-nums] 인원수 조판: 숫자 font-weight 700, 단위는
                  굵기(600)로만 recede — [R-T2] 단위가 9px(하한 3px 미달)였던 것을
                  ambient tm-text-micro(12px, globals.css)와 맞춰 12로 올림. */}
              {Math.max(match.maxParticipants - match.currentParticipants, 0) <= 3 && match.currentParticipants < match.maxParticipants ? (
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2, fontVariantNumeric: 'tabular-nums' }}>
                  <span className="tm-text-micro" style={{ color: 'var(--orange600)', fontWeight: 700 }}>
                    {match.currentParticipants}/{match.maxParticipants}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--orange600)', fontWeight: 600 }}>명</span>
                  <span className="tm-badge tm-badge-orange" style={{ marginLeft: 2 }}>마감 임박</span>
                </span>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 1, fontVariantNumeric: 'tabular-nums' }}>
                  <span className="tm-text-micro" style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
                    {match.currentParticipants}/{match.maxParticipants}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>명</span>
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
