import Link from 'next/link';
import { EmptyState, ListItem, MetricCard } from '@/components/v1-ui/primitives';
import { cssUrl } from '@/lib/assets';
import { HomeRightRail } from './home-right-rail';
import type { HomeMatchCard, HomeViewModel } from './home.types';

const sportChips = [
  { label: '전체', tone: 'blue', active: true, href: '/matches' },
  { label: '축구', tone: 'green', active: false, href: '/matches?q=%EC%B6%95%EA%B5%AC' },
  { label: '풋살', tone: 'orange', active: false, href: '/matches?q=%ED%92%8B%EC%82%B4' },
  { label: '러닝', tone: 'blue', active: false, href: '/matches?q=%EB%9F%AC%EB%8B%9D' },
  { label: '수영', tone: 'grey', active: false, href: '/matches?q=%EC%88%98%EC%98%81' },
] as const;

const teamRows = [
  { title: '팀매치 모집 현황', sub: '팀 단위 대진은 팀매치에서 바로 확인합니다.', href: '/team-matches' },
  { title: '팀 찾기', sub: '관심 종목의 팀 프로필과 일정으로 이어집니다.', href: '/teams' },
  { title: '내 팀 관리', sub: '로스터와 참가 신청은 마이에서 관리합니다.', href: '/my' },
] as const;

export function HomeOpenDesignContent({ model }: { readonly model: HomeViewModel }) {
  const dash = model.signedOut || model.network;
  const monthlyActivity = dash || model.stats.monthlyActivity === '-' ? '-' : `${model.stats.monthlyActivity}경기`;
  const mannerScore = dash || model.stats.mannerScore === '-' ? '-' : `${model.stats.mannerScore}점`;

  return (
    <div className="tm-home-open-design" data-testid="home-open-design">
      <HomeHero model={model} monthlyActivity={monthlyActivity} mannerScore={mannerScore} />
      <SportChipSection />

      <div className="tm-home-od-layout">
        <div className="tm-home-od-main">
          <RecommendedSection model={model} />
          <TeamLiveSection />
          <NoticeSection model={model} />
        </div>
        <HomeRightRail model={model} monthlyActivity={monthlyActivity} mannerScore={mannerScore} />
      </div>
    </div>
  );
}

function HomeHero({
  model,
  monthlyActivity,
  mannerScore,
}: {
  readonly model: HomeViewModel;
  readonly monthlyActivity: string;
  readonly mannerScore: string;
}) {
  const greeting = model.signedOut || model.network ? '안녕하세요' : `안녕하세요, ${model.viewerName}님`;
  const featuredCapacity = model.network ? '-' : `${model.featuredMatch.currentParticipants}/${model.featuredMatch.maxParticipants}명`;

  return (
    <section className="tm-home-od-hero" data-testid="home-od-hero">
      <div className="tm-home-od-hero-copy">
        <div className="tm-home-od-eyebrow">{greeting}</div>
        <h1>오늘 가능한 경기</h1>
        {model.signedOut ? (
          <p data-testid="home-od-signed-out-summary">로그인하면 관심 종목과 지역에 맞춘 추천을 더 정확하게 볼 수 있습니다.</p>
        ) : (
          <p>{model.network ? '추천 매치를 다시 불러와야 합니다.' : `${model.featuredMatch.sportLabel} 중심의 추천과 공지를 한 화면에서 확인합니다.`}</p>
        )}
        <div className="tm-home-od-hero-actions">
          <Link className="tm-btn tm-btn-primary" href="/matches">오늘 매치 보기</Link>
          <Link className="tm-btn tm-btn-neutral" href="/matches/new">매치 만들기</Link>
        </div>
      </div>
      <div className="tm-home-od-stats" data-testid="home-od-stats">
        <MetricCard label="이번 달 활동" value={monthlyActivity} delta={model.network ? '다시 불러오기 필요' : model.stats.monthlyActivitySub} tone="up" />
        <MetricCard label="매너 점수" value={mannerScore} delta={model.signedOut ? '로그인 후 확인' : model.stats.mannerScoreSub} />
        <MetricCard label="추천 정원" value={featuredCapacity} delta={model.network ? '연결 대기' : model.featuredMatch.actionLabel} />
      </div>
    </section>
  );
}

function SportChipSection() {
  return (
    <section className="tm-home-od-section tm-home-od-sports" data-testid="home-od-sports" aria-label="종목 빠른 탐색">
      <div className="tm-home-od-section-head">
        <div>
          <div className="tm-text-label">종목 빠른 탐색</div>
          <div className="tm-text-caption">지원 중인 종목을 확인하고 매치 목록에서 필터링합니다.</div>
        </div>
        <Link className="tm-section-action" href="/matches">전체보기</Link>
      </div>
      <div className="tm-home-od-chip-row">
        {sportChips.map((chip) => (
          <Link key={chip.label} className="tm-home-od-sport-chip" href={chip.href} data-active={chip.active} data-tone={chip.tone}>
            <span className="tm-home-od-chip-dot" aria-hidden="true" />
            {chip.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

function RecommendedSection({ model }: { readonly model: HomeViewModel }) {
  return (
    <section className="tm-home-od-section" data-testid="home-od-recommended" aria-labelledby="home-od-recommended-title">
      <div className="tm-home-od-section-head">
        <div>
          <div className="tm-text-label">오늘의 추천</div>
          <h2 id="home-od-recommended-title">추천 매치</h2>
        </div>
        <Link className="tm-section-action" href="/matches">전체보기</Link>
      </div>
      {model.network ? <NetworkRetryPanel retry={model.retry} /> : <MatchGrid matches={model.recommendedMatches} />}
    </section>
  );
}

function NetworkRetryPanel({ retry }: { readonly retry?: () => void }) {
  return (
    <div className="tm-home-od-network" data-testid="home-od-network-retry">
      <EmptyState title="새로고침이 필요합니다" sub="추천 목록과 대표 매치를 다시 불러올 수 있어야 합니다." cta="다시 불러오기" onCta={retry} />
    </div>
  );
}

function MatchGrid({ matches }: { readonly matches: readonly HomeMatchCard[] }) {
  if (matches.length === 0) {
    return <EmptyState title="추천 매치가 없습니다" sub="조건에 맞는 매치가 생기면 이 영역에 표시됩니다." />;
  }

  const fillSlots = Math.max(0, 6 - matches.length);

  return (
    <div className="tm-home-od-card-grid">
      {matches.map((match) => (
        <Link key={match.id} className="tm-home-od-match-card tm-pressable" data-testid="home-od-match-card" href={`/matches/${encodeURIComponent(match.id)}`}>
          <div className="tm-home-od-match-media" style={{ background: `${cssUrl(match.imageUrl)} center/cover` }} />
          <div className="tm-home-od-match-body">
            <div className="tm-home-od-match-meta">
              <span>{match.sportLabel}</span>
              <span>{match.date}</span>
            </div>
            <div className="tm-text-label line-clamp-2">{match.title}</div>
            <div className="tm-text-caption line-clamp-2">{match.venue} · {match.time}</div>
            <div className="tm-home-od-match-footer">
              <span className="tab-num">{match.currentParticipants}/{match.maxParticipants}명</span>
              <span>{match.actionLabel}</span>
            </div>
          </div>
        </Link>
      ))}
      {Array.from({ length: fillSlots }).map((_, index) => (
        <div key={`fill-${index}`} className="tm-home-od-match-fill" aria-label="추가 추천 준비 중">
          <div className="tm-text-label">추천 준비 중</div>
          <div className="tm-text-caption">실제 매치가 추가되면 빈 슬롯이 채워집니다.</div>
        </div>
      ))}
    </div>
  );
}

function TeamLiveSection() {
  return (
    <section className="tm-home-od-section" data-testid="home-od-team-live" aria-labelledby="home-od-team-live-title">
      <div className="tm-home-od-section-head">
        <div>
          <div className="tm-text-label">팀매치 바로가기</div>
          <h2 id="home-od-team-live-title">진행 중인 팀 흐름</h2>
        </div>
        <Link className="tm-section-action" href="/team-matches">전체보기</Link>
      </div>
      <div className="tm-home-od-team-list">
        {teamRows.map((row) => (
          <Link key={row.title} className="tm-home-od-team-row tm-pressable" href={row.href}>
            <div>
              <div className="tm-text-label">{row.title}</div>
              <div className="tm-text-caption">{row.sub}</div>
            </div>
            <span>보기</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function NoticeSection({ model }: { readonly model: HomeViewModel }) {
  return (
    <section className="tm-home-od-section tm-home-od-notices" aria-labelledby="home-od-notices-title">
      <div className="tm-home-od-section-head">
        <div>
          <div className="tm-text-label">서비스 안내</div>
          <h2 id="home-od-notices-title">공지사항</h2>
        </div>
        <Link aria-label="공지사항 전체보기" className="tm-section-action" href="/notices">전체보기</Link>
      </div>
      <div className="tm-home-notice-list">
        {model.notices.map((notice) => (
          <ListItem key={notice.id} title={notice.title} sub={notice.summary} trailing={notice.trailing} href={`/notices/${encodeURIComponent(notice.id)}`} chev />
        ))}
      </div>
    </section>
  );
}
