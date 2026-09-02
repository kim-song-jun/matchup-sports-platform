import Link from 'next/link';
import { Eye, ShieldAlert, X } from 'lucide-react';
import { useShellOverride } from '@/components/v1-ui/shell-override';
import { PendingReviewsCard } from '@/components/tournaments/pending-review-card';
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
import { useV1AllTournaments, useV1LeagueMatches } from '@/hooks/use-v1-api';
import type { V1TournamentListItem } from '@/types/api';
import type { V1PublicLeagueListItem } from '@/types/league-match';
import { TournamentHeroCard } from './tournament-hero-card';
import { FeaturedSlotSkeleton } from './featured-slot-skeleton';
import type { HomeChatRoom, HomeMatchCard, HomeQuickAction, HomeViewModel } from './home.types';

export function HomePageView({ model }: { model: HomeViewModel }) {
  const dash = model.signedOut || model.network;
  const tournaments = useV1AllTournaments({ status: 'open' });
  const tournamentItems = tournaments.data ?? [];
  // 그룹 C 리그 발견성 감사(Task 153 Wave 3): 홈에는 관리자가 홍보를 켠 대회만 노출되고
  // 리그는 동급 프로모션이 전혀 없었다. 대회의 "오늘의 추천"은 V1Tournament의
  // promoHomeEnabled/promoHomeTitle 등 관리자 토글 필드(V1Tournament 모델)를 그대로
  // 따르는데, V1League 모델에는 그런 홍보 필드가 없다(schema.prisma 확인) — 새로 추가하려면
  // 백엔드 스키마 + 마이그레이션 + 어드민 편집 UI까지 필요해 이 프론트엔드 전용 감사
  // 수정의 범위를 벗어난다. 그래서 관리자 토글 대신 "진행 중(active)" 상태를 자동 홍보
  // 신호로 쓴다 — 어차피 진행 중 리그는 시즌 중 발견될수록 가치가 있고, 사이드바 위젯
  // 하나만 추가해 대회 히어로 카드처럼 메인 컬럼 밀도(오늘의 추천)는 건드리지 않는다.
  const leagues = useV1LeagueMatches({ state: 'active', limit: 4 });
  const leagueItems = leagues.data?.items ?? [];
  // TournamentHeroCard owns the promoHomeEnabled filter + sort — this only needs
  // to know whether *any* eligible item exists, to decide the section's visibility.
  const hasHomePromo = tournamentItems.some((item) => item.status === 'open' && item.promoHomeEnabled);
  // `isLoading`(= isPending && isFetching) 이 아니라 `isPending`(= 아직 데이터가 없다)을 본다.
  // 서버 렌더에서는 쿼리가 돌지 않아 isFetching 이 false → isLoading 도 false 라, 이 조건이
  // **"아직 모름"을 "없음"으로** 읽고 섹션을 통째로 빼 버렸다. 그래서 서버 HTML 에 슬롯이
  // 아예 없다가 하이드레이션(느린 기기에서 10초)이 끝나는 순간 통째로 나타나 아래를 밀었다
  // (alpha 실측: CLS 0.549 중 0.319 가 이 한 번의 등장이다).
  // isPending 은 서버에서도 true 이므로 슬롯이 첫 HTML 부터 자리를 잡는다.
  // model.statsLoading(= 홈 응답 미도착)도 "아직 모름"이다. 이게 빠지면, 로컬 캐시 복원으로
  // tournaments.isPending 이 이미 false 인 재방문에서 홍보 대회가 하나도 없으면 섹션 자체가
  // 사라졌다가 홈 응답이 도착하며 통째로 삽입된다 — 슬롯 안에서 자리를 잡아 봐야 소용없다.
  const hasFeaturedContent =
    model.network ||
    Boolean(model.featuredMatch) ||
    tournaments.isPending ||
    tournaments.isError ||
    model.statsLoading ||
    hasHomePromo;
  const hasRecommendedMatches = model.network || model.recommendedMatches.length > 0;
  const weatherPermission = model.weatherPermission ?? 'prompt';
  const weatherPermissionCopy = getWeatherPermissionCopy(weatherPermission);

  // 셸 승격(U25): title/activeTab/showSearch는 route-chrome/fragments/home.ts의 정적 테이블로
  // 옮겼다. hasNewNotification·floatingSlot은 model(런타임 상태) 의존이라 여기서 override로
  // 밀어넣는다 — 렌더 함수 본문(조건부 return 위)에서 직접 호출(Hooks 규칙 + useSyncExternalStore
  // 루프 방지, shell-override.ts 주석 참조).
  useShellOverride({
    hasNewNotification: model.hasNewNotification && !model.network,
    floatingSlot: <HomeChatFloatingButton model={model} />,
  });

  return (
    <>
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

          {/* 홈은 좌우 여백을 섹션마다 각자 준다(.tm-section-title 등 20px). 배너들은 그게 없어
              카드가 화면 끝에서 끝까지 늘어나 아래 콘텐츠의 여백선과 어긋났다(390 실측: 배너
              0~390 vs 다른 카드 20~370). 배너 슬롯이 그 여백을 책임진다. */}
          <div className="tm-home-banner-slot">
            {/* Task 154 P2-1: 조건이 맞아도 이번 방문에 선택된 유도 배너 하나만 렌더한다.
                차단성인 휴대폰 인증은 이 예산 밖이라 조건만 맞으면 항상 보인다 --
                밀려서 안 보이면 사용자는 신청이 왜 거부되는지 알 길이 없다.
                판정은 model.bannerDecision(lib/home-banner-policy.ts) 하나로 모았다. */}
            {model.phoneVerifyNudge ? <PhoneVerifyBanner phoneVerifyNudge={model.phoneVerifyNudge} /> : null}
            {model.bannerDecision.nudge === 'recordConsent' && model.recordConsentNudge ? (
              <RecordConsentNudgeBanner recordConsentNudge={model.recordConsentNudge} />
            ) : null}
            {model.bannerDecision.nudge === 'push' && model.pushNudge ? (
              <PushNudgeBanner pushNudge={model.pushNudge} />
            ) : null}
          {/* 남은 후기 유도 — 홈에는 대회 후기 전용 바텀시트 모달만 있어서 경기 후기는
              마이 메뉴 서브텍스트 한 줄 말고 알릴 길이 없었다. 마이페이지와 같은 컴포넌트를
              써서 두 화면의 숫자가 갈리지 않게 한다(남은 게 없으면 스스로 null). */}
            {model.bannerDecision.nudge === 'pendingReviews' ? <PendingReviewsCard /> : null}
          </div>

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
                {/* 로딩 중엔 '-'(값이 없다는 뜻)와 구분되게 스켈레톤을 그린다 — 레이블은
                    그대로 둬서 데이터가 도착해도 줄 높이가 바뀌지 않는다. */}
                {model.statsLoading ? (
                  <StatValueSkeleton />
                ) : (
                  <NumberDisplay
                    value={dash ? '-' : model.stats.monthlyActivity}
                    unit={dash ? '' : '경기'}
                    size={24}
                    sub={dash ? undefined : model.stats.monthlyActivitySub}
                  />
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="tm-text-micro" style={{ color: 'var(--text-muted)' }}>매너 점수</div>
                {model.statsLoading ? (
                  <StatValueSkeleton align="right" />
                ) : (
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
                )}
              </div>
            </div>
          </div>

          {/* Featured recommendation hero — 가로 캐러셀(스와이프) */}
          {/* aria-busy: 두 슬롯 중 **하나라도** 자리표시를 그리고 있으면 로딩이다.
              tournaments 만 보면, 대회 목록은 캐시돼 있고 홈 응답만 늦은 경우(추천 매치
              자리표시가 떠 있는데 aria-busy 는 꺼진 상태)를 놓친다. */}
          {hasFeaturedContent ? (
          <div
            className="tm-home-featured-block"
            aria-busy={tournaments.isPending || model.statsLoading || undefined}
          >
            <div style={{ marginBottom: 12 }}>
              <div className="tm-text-label">오늘의 추천</div>
              <div className="tm-text-caption" style={{ color: 'var(--text-muted)', marginTop: 2 }}>지금 눈여겨볼 매치·대회</div>
            </div>
            <div className="tm-home-featured-carousel">
              {/* 추천 매치 슬롯도 **자리를 먼저 잡는다**. 이 카드는 /api/v1/home 응답으로 나타나는데
                  캐러셀의 0번 자리라, 늦게 끼어들면 이미 자리 잡은 대회 슬롯을 통째로 오른쪽으로
                  밀어낸다 — alpha 실측에서 남아 있던 CLS 0.1286 이 전부 이것이었다(10.7초에
                  자식 1개 → 2개로 바뀌는 중간 프레임을 포착했다).
                  model.statsLoading 은 "홈 응답이 아직 안 왔다"는 뜻으로 모델이 이미 쓰는
                  신호다(no-data fallback 경로에서만 true 로 설정된다).
                  대가: 추천 매치가 없는 날엔 빈 자리가 잠깐 보였다가 접힌다(사용자 확정). */}
              {model.featuredMatch ? (
                <FeaturedMatchCard match={model.featuredMatch} network={model.network} signedOut={model.signedOut} onRetry={model.retry} />
              ) : model.statsLoading ? (
                <FeaturedSlotSkeleton eyebrow="오늘의 매치" title="추천 매치를 가져오고 있어요" />
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
                <TournamentHeroCard items={tournamentItems} loading={tournaments.isPending} />
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

          {/* 진행 중인 정규 리그 — 대회 위젯 바로 아래에 붙는다. 두 위젯이 인접해 보이는 이
              자리가 감사 C-3("리그"가 두 제품을 가리킴)의 핵심 지점이라, 여기서는 반드시
              "정규 리그"로 불러 대회(리그 방식 대회)와 구분한다. 위 주석 참조: promoHomeEnabled 같은
              관리자 토글이 리그엔 없어 자동으로 active 리그를 보여준다. */}
          <SidebarLeaguesWidget items={leagueItems} loading={leagues.isLoading} />

        </div>{/* /tm-home-sidebar */}

      </div>{/* /tm-home-desktop */}
    </>
  );
}

/**
 * 홈 통계 값 자리의 로딩 스켈레톤. NumberDisplay(size 24 + sub 한 줄)와 같은 세로 공간을
 * 차지해, 값이 도착해도 인사말 블록의 높이가 바뀌지 않는다.
 */
function StatValueSkeleton({ align = 'left' }: { align?: 'left' | 'right' }) {
  return (
    <div
      aria-hidden="true"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: align === 'right' ? 'flex-end' : 'flex-start',
        gap: 6,
        marginTop: 4,
      }}
    >
      <div className="tm-skeleton" style={{ width: 64, height: 24, borderRadius: 'var(--radius-chip)' }} />
      <div className="tm-skeleton" style={{ width: 92, height: 12, borderRadius: 'var(--radius-tight)' }} />
    </div>
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

/**
 * 경기 기록 공개 동의 유도 배너 (Task 154 P0-3).
 *
 * 형태는 `PushNudgeBanner` 를 그대로 따른다 -- 아이콘 + 문구 2줄 + 닫기, 그리고 CTA 는
 * 아래 줄로 분리. 390px 에서 한 줄에 다 넣으면 문구 자리가 남지 않는다는 그쪽 주석의
 * 판단이 여기서도 그대로 적용된다.
 *
 * 다른 점은 **문구가 아니라 숫자로 이유를 준다**는 것이다. "공개할까요?" 만으로는 왜 지금
 * 나에게 뜨는지 알 수 없고, 켜고 나서 뭐가 달라지는지도 모른다. 서버가 계산한
 * `pendingCount`(지금 켜면 즉시 공개될 경기 수)를 앞세워 그 둘을 한 번에 답한다 --
 * 이 숫자가 0 인 사용자에겐 배너 자체가 뜨지 않으므로 "0경기" 는 렌더되지 않는다.
 */
function RecordConsentNudgeBanner({
  recordConsentNudge,
}: {
  recordConsentNudge: NonNullable<HomeViewModel['recordConsentNudge']>;
}) {
  return (
    <Card pad={16} style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
          <Eye size={18} strokeWidth={2} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tm-text-label">
            {recordConsentNudge.pendingCount}경기가 공개를 기다려요
          </div>
          <div className="tm-text-caption" style={{ marginTop: 2 }}>
            공개하면 내 출전·득점이 프로필에 표시돼요.
          </div>
        </div>
        <button
          type="button"
          aria-label="경기 기록 공개 안내 닫기"
          className="tm-pressable"
          style={{ flexShrink: 0, padding: 8, minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={recordConsentNudge.onDismiss}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        {/* 무엇이 공개되는지 확인할 경로를 항상 함께 둔다 -- 개인정보 공개를 "보지 않고
            버튼 한 번"으로 켜게 만들지 않기 위한 것이다. */}
        <Link
          href="/my/settings/record-consent"
          className="tm-btn tm-btn-sm tm-btn-neutral"
          style={{ flex: 1, minHeight: 44 }}
        >
          어떤 기록인지 보기
        </Link>
        <button
          type="button"
          className="tm-btn tm-btn-sm tm-btn-primary"
          style={{ flex: 1, minHeight: 44 }}
          disabled={recordConsentNudge.saving}
          onClick={recordConsentNudge.onGrant}
        >
          {recordConsentNudge.saving ? '적용 중' : '공개하기'}
        </button>
      </div>
    </Card>
  );
}

function PushNudgeBanner({ pushNudge }: { pushNudge: NonNullable<HomeViewModel['pushNudge']> }) {
  return (
    // 390px 에서 아이콘(36) + 문구 + CTA + 닫기(44) 를 한 줄에 넣으면 gap·패딩까지 합쳐
    // 220px 넘게 먹어 문구가 들어갈 자리가 거의 남지 않는다. 정보 줄과 CTA 를 분리해
    // 같은 자리에 뜨는 "남은 후기" 배너와 같은 리듬으로 맞춘다.
    <Card pad={16} style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
          aria-label="알림 받기 안내 닫기"
          className="tm-pressable"
          style={{ flexShrink: 0, padding: 8, minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={pushNudge.onDismiss}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <button
        type="button"
        className="tm-btn tm-btn-sm tm-btn-primary tm-btn-block"
        style={{ marginTop: 12, minHeight: 44 }}
        disabled={pushNudge.subscribing}
        onClick={pushNudge.onSubscribe}
      >
        {pushNudge.subscribing ? '확인 중' : '알림 받기'}
      </button>
    </Card>
  );
}

function PhoneVerifyBanner({ phoneVerifyNudge }: { phoneVerifyNudge: NonNullable<HomeViewModel['phoneVerifyNudge']> }) {
  return (
    <Card pad={16} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
                style={{ marginTop: 8, display: 'flex', alignItems: 'center', columnGap: 8, rowGap: 4, flexWrap: 'wrap' }}
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
                  gap: 12,
                  padding: '12px 12px',
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
                    borderRadius: 'var(--radius-chip)',
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

// 대회 위젯(SidebarTournamentsWidget)과 같은 카드 관례 — 컴포넌트 파일 상단 주석 참조:
// V1League엔 promoHomeEnabled 같은 관리자 토글이 없어 "진행 중(active)" 상태를 그대로
// 홍보 신호로 쓴다. 아이콘도 같은 TrophyIcon을 재사용한다 — 대회와 리그는 같은 "대회
// 유형" 축이라(둘 다 경쟁 컨테이너) 리그 전용 아이콘을 새로 만드는 대신 그 관례를
// 그대로 따른다.
function SidebarLeaguesWidget({ items, loading }: { items: V1PublicLeagueListItem[]; loading: boolean }) {
  const visibleItems = items.slice(0, 4);

  return (
    <div className="tm-home-sidebar-notices">
      <div className="tm-notice-head">
        <div className="tm-text-body-lg">진행 중인 정규 리그</div>
        <Link
          className="tm-btn tm-btn-sm tm-btn-ghost"
          /* 리그 목록은 통합 목록으로 넘어갔다(2026-09-01) — 리다이렉트를 한 번 더 타지
             않도록 **직접** 보낸다. 개별 리그 링크(아래)는 그대로다. */
          href="/tournaments?kind=league"
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
          정규 리그 목록을 가져오고 있어요…
        </div>
      ) : visibleItems.length === 0 ? (
        <div
          className="tm-text-caption"
          style={{ color: 'var(--text-muted)', paddingTop: 8 }}
        >
          현재 진행 중인 정규 리그가 없어요.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {visibleItems.map((l) => {
            const dateLabel = formatTournamentDateRangeShort(l.startsOn, l.endsOn);
            return (
              <Link
                key={l.leagueId}
                href={`/league-matches/${l.leagueId}`}
                className="tm-pressable"
                aria-label={`정규 리그 상세 보기 — ${l.title}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 12px',
                  borderRadius: 10,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  minHeight: 44,
                }}
              >
                <span
                  className="tm-tournament-widget-icon"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    width: 32,
                    height: 32,
                    borderRadius: 'var(--radius-chip)',
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
                    {l.title}
                  </div>
                  <div
                    className="tm-text-micro"
                    style={{ color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'baseline', gap: 2, flexWrap: 'wrap' }}
                  >
                    {l.sport.name}
                    {dateLabel ? ` · ${dateLabel}` : ''}
                    {' · '}
                    <span style={{ fontVariantNumeric: 'tabular-nums', display: 'inline-flex', alignItems: 'baseline', gap: 1 }}>
                      <span style={{ fontWeight: 600 }}>{l.teamCount}</span>
                      <span style={{ fontSize: 12 }}>팀 참가</span>
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
                  <span className="tm-text-micro" style={{ color: 'var(--orange700)', fontWeight: 700 }}>
                    {match.currentParticipants}/{match.maxParticipants}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--orange700)', fontWeight: 600 }}>명</span>
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
