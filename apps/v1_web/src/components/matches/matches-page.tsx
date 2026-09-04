'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ChangeEvent } from 'react';
import { useRef, useState } from 'react';
import { useShellOverride } from '@/components/v1-ui/shell-override';
import { Card, EmptyState, ErrorState, InfoRow, ListItem } from '@/components/v1-ui/primitives';
import { Button } from '@/components/v1-ui/button';
import { ChevronLeftIcon, FilterIcon, PlusIcon, SearchIcon, ShareIcon } from '@/components/v1-ui/icons';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { cssUrl } from '@/lib/assets';
import { SportIllustration } from '@/components/v1-ui/sport-illustration';
import { MatchTypeSegment } from '@/components/v1-ui/match-type-segment';
import { BottomSheet } from '@/components/v1-ui/bottom-sheet';
import { CreateField, FieldErrorText, GenderRuleSelector, MissingFieldsBanner, RecentVenueChips } from '@/components/v1-ui/create-form-fields';
import type {
  MatchCardModel,
  MatchCreateViewModel,
  MatchDetailViewModel,
  MatchListViewModel,
  MatchStateViewModel,
} from './matches.types';

/**
 * 종목 한국어 레이블 → 인디케이터 dot CSS 색상.
 * getSportAccent(code)는 영문 코드 기준이라 여기서 인라인 매핑.
 * 미매핑 종목은 grey400 fallback으로 안전하게 처리한다.
 */
function sportDotColor(sportLabel: string): string {
  const map: Record<string, string> = {
    풋살: 'var(--blue500)',
    축구: 'var(--blue500)',
    수영: 'var(--blue500)',
    배구: 'var(--blue500)',
    농구: 'var(--orange500)',
    야구: 'var(--orange500)',
    러닝: 'var(--green500)',
    배드민턴: 'var(--green500)',
    테니스: 'var(--green500)',
    사이클: 'var(--green500)',
    골프: 'var(--green500)',
  };
  return map[sportLabel] ?? 'var(--grey400)';
}

/**
 * [P2 마이크로인터랙션] 매치 만들기 완료 체크 아이콘 — globals.css .tm-complete-check 키프레임 활용.
 * reduced-motion 환경: 0.18s fade-in만 적용 (globals.css에서 자동 처리).
 */
/**
 * [P0/P1 아이콘+컬러] 상태 아이콘 — 색상만으로 상태를 구분하지 않도록 아이콘+텍스트 병행 (WCAG 1.4.1).
 */
function StatusIcon({ tone }: { tone: 'orange' | 'green' | 'grey' }) {
  if (tone === 'green') {
    return (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
        <circle cx="7.5" cy="7.5" r="7.5" fill="var(--tint-green)" />
        <path d="M4 7.5L6.5 10L11 5" stroke="var(--green500)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (tone === 'grey') {
    return (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
        <circle cx="7.5" cy="7.5" r="7.5" fill="var(--tint-grey)" />
        <path d="M4.5 7.5H10.5" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="7.5" cy="7.5" r="7.5" fill="var(--tint-orange)" />
      <path d="M7.5 4.5V8" stroke="var(--orange700)" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="7.5" cy="10.5" r="0.75" fill="var(--orange700)" />
    </svg>
  );
}

export function MatchListPageView({ model }: { model: MatchListViewModel }) {
  // 셸 승격(U27): title/activeTab/topBar는 route-chrome/fragments/matches.ts로 옮겼다.
  // floatingSlot(매치 만들기 FAB)은 이 화면 성공 분기에서만 필요한 런타임 슬롯이라 override로
  // 밀어넣는다(§1b, home-page.tsx의 동일 패턴 참조).
  useShellOverride({ floatingSlot: <MatchCreateFloatingButton /> });
  return (
    <>
      {/* Desktop-only page header with inline "매치 만들기" CTA */}
      <div className="tm-match-desktop-header tm-show-desktop">
        <h1 className="tm-match-desktop-header-title">매치</h1>
        <Link className="tm-match-desktop-create-btn" href="/matches/new/sport" aria-label="새 매치 만들기">
          <PlusIcon size={18} strokeWidth={2.5} aria-hidden="true" />
          매치 만들기
        </Link>
      </div>
      <MatchSearchBar query={model.query} filterCount={model.filterCount} search={model.search} filterHref={model.filterHref} />
      <MatchTypeSegment active="personal" />
      {/* 결과가 0건일 때만 tm-list-empty — 카드가 있는 평소 레이아웃은 건드리지 않는다. */}
      <div className={`tm-match-list${!model.isLoading && model.matches.length === 0 ? ' tm-list-empty' : ''}`}>
        <SportSelector sports={model.sports} />
        <div className="tm-match-summary-row">
          <div className="tm-text-label">{model.summary.label}</div>
          {/* summary.urgent = status==='open'(모집중) 매치 수 — '마감'은 의미 반대였음(WS11 Rank6) */}
          {/* #21 + [P1 tabular-nums]: '모집 중 N' 숫자 weight700 + tabular-nums */}
          <div className="tm-text-caption tab-num">{model.summary.count}개 · 오늘 {model.summary.today} · 모집 중 <strong style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{model.summary.urgent}</strong></div>
        </div>
        {/* team-matches-page.tsx #5와 동일 — 로딩 중(isLoading)엔 PageSkeleton, 완료 후
            비어 있으면 EmptyState. 이 분기 없이는 필터를 바꿔 새 쿼리가 도는 동안에도
            "조건에 맞는 매치가 없어요"가 잠깐 뜬다(실제로는 아직 응답을 못 받은 상태). */}
        {model.isLoading ? (
          <PageSkeleton />
        ) : model.matches.length ? (
          <div className="tm-match-card-stack">
            {model.matches.map((match) => <MatchCardItem key={match.id} match={match} />)}
          </div>
        ) : (
          /* EmptyState must be a sibling of .tm-match-card-stack, not nested inside it —
             the stack becomes a 2-up/3-up CSS grid on desktop (matches.css), and a single
             grid-item child gets confined to the first grid cell (~50%/33% width), reading
             as flush-left instead of centered across the full content column. Matches the
             pattern already used by teams-page.tsx / team-matches-page.tsx / tournaments page.tsx. */
          <EmptyState
            fill
            illustration={{ name: 'matches-empty' }}
            title="조건에 맞는 매치가 없어요"
            sub="다른 종목을 선택하거나 전체 매치로 돌아가면 모집 중인 매치를 볼 수 있어요."
            cta={model.filterCount > 0 || model.sports.some((sport) => sport.active && sport.label !== '전체') ? '전체 매치 보기' : undefined}
            ctaHref="/matches"
          />
        )}
        {/* 서버는 20건씩 커서로 자르는데(matches.service.ts) 예전엔 여기서 더 볼 방법이
            없었다(감사 결함) — tournaments/page.tsx 와 같은 "더 보기" 누적 패턴. */}
        {!model.isLoading && model.hasNext ? (
          <button
            type="button"
            className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block"
            style={{ marginTop: 16 }}
            disabled={model.loadMorePending}
            onClick={model.onLoadMore}
          >
            {model.loadMorePending ? '불러오는 중…' : '더 보기'}
          </button>
        ) : null}
      </div>
      {model.filterSheet?.open ? <MatchFilterSheet model={model} /> : null}
    </>
  );
}


export function MatchStatePageView({ model }: { model: MatchStateViewModel }) {
  // 셸 승격(U27): 이 화면은 /matches(목록 에러)와 /matches/:id(상세 에러) 두 라우트에서
  // 재사용되는 공유 에러 뷰다(app-shell-promotion.md §1.9 "공유 에러 뷰" 절 — 여러 라우트
  // 재사용은 override 메커니즘엔 영향 없음). title은 에러 상태에 따라 달라지는 런타임 값이라
  // override로 밀어넣는다.
  useShellOverride({ title: model.title });
  return (
    <>
      {/* 데스크톱: 기존 자체 헤더(뒤로가기+제목) 유지 */}
      <div className="tm-desktop-page-head tm-show-desktop">
        <Link className="tm-desktop-back" href="/matches" aria-label="매치 목록으로 돌아가기">
          <ChevronLeftIcon size={20} strokeWidth={2.2} aria-hidden="true" />
        </Link>
        <h1 className="tm-text-heading" style={{ margin: 0 }}>{model.title}</h1>
      </div>
      {/* 모바일: 두 라우트 모두 이 화면의 "성공" 짝(MatchListPageView/MatchDetailPageView)
          기준으로 topBar가 false로 고정돼 있어(route-chrome/fragments/matches.ts) 제너릭
          토픽바의 뒤로가기가 뜨지 않는다 — 이 화면이 원래 거기에 기대고 있던 유일한 곳이라
          직접 그려 넣는다(데스크톱은 위 자체 헤더가 이미 대신함). */}
      <div className="tm-hide-desktop" style={{ padding: '12px 16px 0' }}>
        <Link className="tm-btn tm-btn-icon tm-btn-ghost" href="/matches" aria-label="매치 목록으로 돌아가기">
          <ChevronLeftIcon size={22} strokeWidth={2.2} />
        </Link>
      </div>
      <div className="tm-match-list">
        {/* 오류는 ErrorState + 재시도(DESIGN.md §13). 예전엔 EmptyState + "목록으로 돌아가기" 카드뿐이라
            다시 불러올 길이 없었다(2026-09-04 감사). */}
        {model.state === 'error' ? (
          <>
            <ErrorState title={model.title} message={model.description} onRetry={model.retry} retryLabel="다시 불러오기" />
            <Link className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" href="/matches" style={{ marginTop: 12 }}>목록으로 돌아가기</Link>
          </>
        ) : (
          <EmptyState title={model.title} sub={model.description} />
        )}
        {model.state === 'joined' ? (
          <div className="tm-match-card-stack" style={{ marginTop: 20 }}>
            {model.matches.map((match) => <MatchCardItem key={match.id} match={match} />)}
          </div>
        ) : null}
      </div>
    </>
  );
}


function MatchCreateFloatingButton() {
  return (
    <Link className="tm-floating-fab" href="/matches/new/sport" aria-label="매치 만들기">
      <PlusIcon size={25} strokeWidth={2.2} />
    </Link>
  );
}

function matchStatusBadgeClass(mode: MatchDetailViewModel['mode'], status: MatchDetailViewModel['match']['status']) {
  if (mode === 'pending') return 'tm-badge-orange';
  if (mode === 'approved') return 'tm-badge-green';
  if (mode === 'mine') return 'tm-badge-blue';
  if (mode === 'closed' || status === 'full') return 'tm-badge-grey';
  return 'tm-badge-grey';
}

function matchStatusBadgeLabel(mode: MatchDetailViewModel['mode'], status: MatchDetailViewModel['match']['status']) {
  if (mode === 'pending') return '승인 대기';
  if (mode === 'approved') return '승인 완료';
  if (mode === 'mine') return '내 매치';
  if (mode === 'closed' || status === 'full') return '모집 완료';
  return '모집 중';
}

/**
 * 매치 상세 로딩 셸. 데이터가 오기 전 하드코딩 목업(matches.view-model.ts)을 그대로
 * 렌더하던 자리를 대신한다 — 목업 참가자·주소·설명이 실제 매치처럼 보이던 결함을 막는다.
 * 셸 승격(U27) 이후 title/activeTab/bottomNav/topBar 는 route-chrome/fragments/matches.ts
 * 테이블의 '/matches/:id' 항목(title: '매치')이 이미 그린다 — MatchDetailPageView(성공
 * 뷰)도 useShellOverride로 title을 덮어쓰지 않으므로 두 상태가 같은 값을 보여 헤더가
 * 흔들리지 않는다. 그래서 본문 스켈레톤만 렌더한다.
 */
export function MatchDetailPageSkeleton() {
  return (
    <>
      <p className="sr-only" role="status">매치 정보를 불러오는 중이에요.</p>
      <PageSkeleton variant="detail" />
    </>
  );
}

export function MatchDetailPageView({ model }: { model: MatchDetailViewModel }) {
  const { match, mode } = model;
  const [heroMessage, setHeroMessage] = useState('');
  const locked = mode === 'pending' || mode === 'approved' || mode === 'closed' || match.status === 'full';
  const canRunAction = Boolean(model.onApply);
  const cta = model.applyLabel ?? (mode === 'mine' ? '매치 관리' : mode === 'approved' ? '승인 완료' : mode === 'pending' ? '신청 취소' : mode === 'closed' || match.status === 'full' ? '신청 마감' : '참가 신청');
  const ctaTone = mode === 'pending' ? 'tm-btn-warning' : mode === 'approved' ? 'tm-btn-success' : locked ? 'tm-btn-neutral' : 'tm-btn-primary';
  const showChat = mode === 'approved' && Boolean(model.onChat);
  const timeRange = match.endTime ? `${match.time}-${match.endTime}` : match.time;
  // 경기가 끝난 뒤 후기로 가는 유일한 상세 화면 진입점. 완료 알림도 후기 화면으로 보내지만,
  // 매치 상세에서 직접 들어갈 길이 없으면 알림을 지운 사용자는 후기를 쓸 방법이 사라진다.
  const reviewCard = model.reviewAction ? (
    <Card pad={16} style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div className="tm-text-body-lg">후기</div>
          <div className="tm-text-caption" style={{ marginTop: 2, color: 'var(--text-muted)' }}>
            함께 뛴 참가자에게 후기를 남겨요.
          </div>
        </div>
        <Link
          className="tm-btn tm-btn-sm tm-btn-outline"
          href={model.reviewAction.href}
          style={{ flexShrink: 0, minHeight: 44, display: 'inline-flex', alignItems: 'center' }}
        >
          {model.reviewAction.label}
        </Link>
      </div>
    </Card>
  ) : null;
  const heroActionBusyRef = useRef(false);
  const runHeroAction = (action: (() => void | string | null | Promise<void | string | null>) | undefined, fallbackMessage: string) => {
    // 로딩 중 재클릭 시 중복 제출 방지 — disabled/loading prop은 리렌더 이후에나 반영되므로
    // 동기적인 ref 락으로 한 번 더 막는다.
    if (!action || heroActionBusyRef.current) return;
    heroActionBusyRef.current = true;
    // action()을 .then() 콜백 안에서 호출 — 동기 throw도 promise rejection으로 변환되어
    // .catch/.finally가 항상 실행되고 락이 풀린다(Promise.resolve(action())은 인자 평가가
    // Promise.resolve 호출보다 먼저라 동기 throw 시 .finally를 건너뛰어 락이 영구 고정됨).
    void Promise.resolve()
      .then(() => action())
      .then((result) => {
        // null = 액션이 UX를 직접 처리(네이티브 공유/취소/prompt 폴백) → 토스트 미표시.
        if (result === null) return;
        const msg = typeof result === 'string' && result ? result : fallbackMessage;
        setHeroMessage(msg);
        window.setTimeout(() => setHeroMessage(''), 1800);
      })
      .catch(() => {
        setHeroMessage('잠깐 문제가 생겼어요. 잠시 후 다시 시도해 주세요.');
        window.setTimeout(() => setHeroMessage(''), 1800);
      })
      .finally(() => {
        heroActionBusyRef.current = false;
      });
  };

  return (
    <>
      {/* Desktop: back link + match title (mobile topbar is hidden on desktop) */}
      <div className="tm-desktop-page-head tm-show-desktop">
        <Link className="tm-desktop-back" href="/matches" aria-label="매치 목록으로 돌아가기">
          <ChevronLeftIcon size={20} strokeWidth={2.2} aria-hidden="true" />
        </Link>
        <h1 className="tm-text-heading" style={{ margin: 0 }}>{match.title}</h1>
      </div>

      <article className="tm-match-detail tm-content-enter">
        <div className={`tm-match-detail-hero${match.image ? '' : ' tm-match-media-sport tm-match-detail-hero-sport'}`} style={match.image ? { backgroundImage: cssUrl(match.image) } : undefined}>
          {match.image ? null : <SportIllustration sport={match.sport} sizes="(min-width: 1024px) 160px, 136px" className="tm-match-detail-hero-illustration" />}
          <div className="tm-match-detail-overlay">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              {/* Mobile back button — hidden on desktop (desktop back is in the page head above) */}
              <Link className="tm-btn tm-btn-icon tm-btn-ghost tm-hero-button tm-hide-desktop" href="/matches" aria-label="뒤로가기">
                <ChevronLeftIcon size={22} strokeWidth={2.2} />
              </Link>
              <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                <button className="tm-btn tm-btn-icon tm-btn-ghost tm-hero-button" type="button" aria-label="공유" onClick={() => runHeroAction(model.onShare, '링크를 복사했어요')}><ShareIcon size={20} /></button>
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                {/* 종목 배지: blue solid → sport dot + 텍스트(중립 배지).
                    R-C1 준수: 단일 블루 액센트는 상태 배지에만 예약. */}
                <span className="tm-badge tm-match-detail-sport-badge">
                  <span
                    className="tm-match-detail-sport-dot"
                    style={{ background: sportDotColor(match.sport) }}
                    aria-hidden="true"
                  />
                  {match.sport}
                </span>
                <span className="tm-badge tm-badge-grey">{match.level}</span>
                <span className="tm-badge tm-badge-grey">{match.gender}</span>
                <span className={`tm-badge ${matchStatusBadgeClass(mode, match.status)}`}>{matchStatusBadgeLabel(mode, match.status)}</span>
              </div>
              <h2 className="tm-match-detail-title">{match.title}</h2>
              <div className="tm-text-caption" style={{ color: 'var(--overlay-white-76)', marginTop: 8 }}>{match.host} 호스트 · {match.deadline}</div>
              {heroMessage ? <div className="tm-text-caption" role="status" style={{ color: 'var(--overlay-white-86)', marginTop: 8 }}>{heroMessage}</div> : null}
            </div>
          </div>
        </div>

        {/* Desktop: 2-column layout — left body, right sticky CTA card */}
        <div className="tm-match-detail-desktop-layout tm-show-desktop">
          {/* Left column */}
          <div className="tm-match-detail-body">
            <InfoRow label="지역" value={match.region} />
            <InfoRow label="날짜와 시간" value={`${match.date} ${timeRange}`} />
            <InfoRow label="신청 마감" value={match.deadlineDetail ?? match.deadline} sub={match.deadline} />
            <InfoRow label="장소" value={match.venue} sub={match.address} />
            {/* [P1 숫자:단위 2:1 + tabular-nums] 인원 — 숫자(subhead/heading 크기) + 단위(body) 2:1 비율 */}
            <CapacityRow current={match.current} capacity={match.capacity} />
            <InfoRow label="레벨" value={match.level} />
            <InfoRow label="성별 조건" value={match.gender} />
            {mode === 'pending' ? (
              <>
                <StateCard tone="orange" title="승인 대기" body="호스트가 신청을 확인하고 있어요." />
                {/* 신청 후 현황 확인 CTA — '내 신청 현황 보기' (#13) */}
                <Link className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" href="/my/matches/joined" style={{ marginTop: 12 }}>
                  내 신청 현황 보기
                </Link>
              </>
            ) : null}
            {mode === 'approved' ? <StateCard tone="green" title="승인 완료" body="참가를 확정했어요. 경기 당일 늦지 않게 도착해 주세요." /> : null}
            {mode === 'closed' ? <StateCard tone="grey" title="모집 완료" body="이 매치는 신청이 마감됐어요. 다른 매치를 둘러봐 주세요." /> : null}
            {match.rules.length ? <Card pad={16} style={{ marginTop: 12 }}><div className="tm-text-body-lg">규칙</div><div style={{ display: 'grid', gap: 8, marginTop: 12 }}>{match.rules.map((rule) => <div key={rule} className="tm-text-body" style={{ color: 'var(--text-muted)' }}>{rule}</div>)}</div></Card> : null}
            <Card pad={16} style={{ marginTop: 12 }}>
              <div className="tm-text-body-lg">참가자</div>
              <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                {match.participants.map((person) => (
                  <div key={person.name}>
                    {person.href ? (
                      <Link href={person.href} aria-label={`${person.name} 관리 페이지로 이동`}>
                        <ListItem title={person.name} sub={person.meta} trailing={person.status} />
                      </Link>
                    ) : (
                      <ListItem title={person.name} sub={person.meta} trailing={person.status} />
                    )}
                  </div>
                ))}
              </div>
            </Card>
            {reviewCard}
          </div>

          {/* Right column: sticky summary + CTA */}
          <div className="tm-match-detail-desktop-cta" role="complementary" aria-label="매치 신청">
            <div className="tm-match-detail-desktop-cta-label">
              <span className="tm-text-caption">{mode === 'mine' ? '내가 만든 매치' : '신청 상태'}</span>
              <span className="tm-text-label">{model.statusLabel ?? match.actionLabel}</span>
            </div>
            <div className="tm-match-detail-desktop-cta-actions">
              {showChat ? (
                <Button loading={model.chatPending} disabled={!model.onChat} onClick={model.onChat} size="lg" type="button" variant="neutral">
                  {model.chatLabel ?? '채팅'}
                </Button>
              ) : null}
              {mode === 'mine' ? (
                <>
                  <Link className="tm-btn tm-btn-lg tm-btn-neutral" href={match.applicationsHref ?? `/matches/${match.id}/applications`}>신청자 관리</Link>
                  <Link className="tm-btn tm-btn-lg tm-btn-primary" href={match.editHref ?? `/matches/${match.id}/edit`}>매치 수정</Link>
                </>
              ) : (
                <Button
                  disabled={!canRunAction}
                  loading={model.applyPending}
                  onClick={() => runHeroAction(model.onApply, mode === 'pending' ? '신청을 취소했어요.' : '신청을 완료했어요.')}
                  size="lg"
                  type="button"
                  variant={ctaTone === 'tm-btn-primary' ? 'primary' : ctaTone === 'tm-btn-warning' ? 'warning' : ctaTone === 'tm-btn-success' ? 'success' : 'neutral'}
                >
                  {cta}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Mobile: original single-column body (hidden on desktop) */}
        <div className="tm-match-detail-body tm-hide-desktop">
          <InfoRow label="지역" value={match.region} />
          <InfoRow label="날짜와 시간" value={`${match.date} ${timeRange}`} />
          <InfoRow label="신청 마감" value={match.deadlineDetail ?? match.deadline} sub={match.deadline} />
          <InfoRow label="장소" value={match.venue} sub={match.address} />
          {/* [P1 숫자:단위 2:1 + tabular-nums] 인원 (모바일) */}
          <CapacityRow current={match.current} capacity={match.capacity} />
          <InfoRow label="레벨" value={match.level} />
          <InfoRow label="성별 조건" value={match.gender} />
          {mode === 'pending' ? (
            <>
              <StateCard tone="orange" title="승인 대기" body="호스트가 신청을 확인하고 있어요." />
              {/* 신청 후 현황 확인 CTA — '내 신청 현황 보기' (#13) */}
              <Link className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" href="/my/matches/joined" style={{ marginTop: 12 }}>
                내 신청 현황 보기
              </Link>
            </>
          ) : null}
          {mode === 'approved' ? <StateCard tone="green" title="승인 완료" body="참가를 확정했어요. 경기 당일 늦지 않게 도착해 주세요." /> : null}
          {mode === 'closed' ? <StateCard tone="grey" title="모집 완료" body="이 매치는 신청이 마감됐어요. 다른 매치를 둘러봐 주세요." /> : null}
          {match.rules.length ? <Card pad={16} style={{ marginTop: 12 }}><div className="tm-text-body-lg">규칙</div><div style={{ display: 'grid', gap: 8, marginTop: 12 }}>{match.rules.map((rule) => <div key={rule} className="tm-text-body" style={{ color: 'var(--text-muted)' }}>{rule}</div>)}</div></Card> : null}
          <Card pad={16} style={{ marginTop: 12 }}>
            <div className="tm-text-body-lg">참가자</div>
            <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              {match.participants.map((person) => (
                <div key={person.name}>
                  {person.href ? (
                    <Link href={person.href} aria-label={`${person.name} 관리 페이지로 이동`}>
                      <ListItem title={person.name} sub={person.meta} trailing={person.status} />
                    </Link>
                  ) : (
                    <ListItem title={person.name} sub={person.meta} trailing={person.status} />
                  )}
                </div>
              ))}
            </div>
          </Card>
          {reviewCard}
        </div>
      </article>

      {/* Mobile-only fixed CTA — hidden on desktop (CSS: .tm-match-detail + .tm-fixed-cta) */}
      <div className="tm-fixed-cta tm-hide-desktop">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <span className="tm-text-caption">{mode === 'mine' ? '내가 만든 매치' : '신청 상태'}</span>
          <span className="tm-text-label">{model.statusLabel ?? match.actionLabel}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: showChat || mode === 'mine' ? '1fr 1fr' : '1fr', gap: 8 }}>
          {showChat ? (
            <Button loading={model.chatPending} disabled={!model.onChat} onClick={model.onChat} size="lg" type="button" variant="neutral">
              {model.chatLabel ?? '채팅'}
            </Button>
          ) : null}
          {mode === 'mine' ? (
            <>
              <Link className="tm-btn tm-btn-lg tm-btn-neutral" href={match.applicationsHref ?? `/matches/${match.id}/applications`}>신청자 관리</Link>
              <Link className="tm-btn tm-btn-lg tm-btn-primary" href={match.editHref ?? `/matches/${match.id}/edit`}>매치 수정</Link>
            </>
          ) : (
            <Button
              disabled={!canRunAction}
              loading={model.applyPending}
              onClick={() => runHeroAction(model.onApply, mode === 'pending' ? '신청을 취소했어요.' : '신청을 완료했어요.')}
              size="lg"
              type="button"
              variant={ctaTone === 'tm-btn-primary' ? 'primary' : ctaTone === 'tm-btn-warning' ? 'warning' : ctaTone === 'tm-btn-success' ? 'success' : 'neutral'}
            >
              {cta}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
export function MatchCreatePageView({ model }: { model: MatchCreateViewModel }) {
  const edit = model.step === 'edit';
  const stepNo = edit ? 2 : stepToNumber(model.step);
  const primaryLabel = model.form?.submitLabel ?? (edit ? '변경사항 저장' : model.step === 'confirm' ? '매치 만들기' : '다음');
  const primaryAction = model.step === 'confirm' || edit ? model.form?.onSubmit : model.form?.onNext;
  const secondaryAction = model.form?.onBack;
  const missingFields = model.form?.missingFields ?? [];
  return (
    <>
      {/* Desktop page head */}
      <div className="tm-desktop-page-head tm-show-desktop">
        <Link className="tm-desktop-back" href={edit ? (model.matchId ? `/matches/${model.matchId}` : '/matches') : '/matches'} aria-label={edit ? '매치 상세로 돌아가기' : '매치 목록으로 돌아가기'}>
          <ChevronLeftIcon size={20} strokeWidth={2.2} aria-hidden="true" />
        </Link>
        <h1 className="tm-text-heading" style={{ margin: 0 }}>{edit ? '매치 수정' : '매치 만들기'}</h1>
      </div>
      <div className="tm-create-shell tm-match-create-shell tm-content-enter">
        {/* 단계 전환 시 스크린리더에 현재 단계 공지 */}
        {!edit ? (
          <div className="sr-only" aria-live="polite" aria-atomic="true">
            {['종목 선택', '매치 정보', '장소와 시간', '작성 내용 확인'][stepNo - 1]} — {stepNo}단계 / 4단계
          </div>
        ) : null}
        <CreateProgress step={stepNo} edit={edit} completeSteps={model.form?.completeSteps?.map(stepToNumber) ?? []} />
        {model.form?.error ? <StateCard tone="orange" title="저장할 수 없어요" body={model.form.error} /> : null}
        {missingFields.length > 0 ? <MissingFieldsBanner missingFields={missingFields} stepHref={matchStepHref} /> : null}
        {model.form?.lockedReason ? <StateCard tone="orange" title="수정이 제한된 매치예요" body={model.form.lockedReason} /> : null}
        {model.step === 'sport' ? <SportStep model={model} /> : null}
        {model.step === 'info' || model.step === 'edit' ? <InfoStep model={model} edit={edit} /> : null}
        {model.step === 'place-time' ? <PlaceTimeStep model={model} /> : null}
        {model.step === 'confirm' ? <ConfirmStep model={model} /> : null}
      </div>
      <div className="tm-fixed-cta tm-create-fixed-cta">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
          {secondaryAction ? (
            <button className="tm-btn tm-btn-lg tm-btn-neutral" type="button" onClick={secondaryAction}>{edit ? '변경 취소' : model.step === 'sport' ? '취소' : '이전'}</button>
          ) : (
            <Link className="tm-btn tm-btn-lg tm-btn-neutral" href={model.step === 'sport' ? '/matches' : '/matches/new'}>{edit ? '변경 취소' : model.step === 'sport' ? '취소' : '이전'}</Link>
          )}
          {primaryAction ? (
            <button className="tm-btn tm-btn-lg tm-btn-primary" type="button" disabled={model.form?.submitting || Boolean(model.form?.lockedReason)} onClick={primaryAction}>
              {model.form?.submitting ? '저장 중' : primaryLabel}
            </button>
          ) : (
            <Link className="tm-btn tm-btn-lg tm-btn-primary" href={nextCreateHref(model.step)}>{primaryLabel}</Link>
          )}
        </div>
        {/* lockedReason이 있으면(완료·취소·만료 등 터미널 상태) 서버 cancel()도 같은 조건으로
            409를 던진다 — '변경사항 저장' 버튼과 같은 게이트를 걸어 죽은 버튼을 사전에 막는다
            (2026-08-27 감사 M-A-personal-match-state). */}
        {edit && model.form?.onCancel ? <button className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" type="button" style={{ marginTop: 8 }} disabled={model.form.submitting || Boolean(model.form?.lockedReason)} onClick={model.form.onCancel}>매치 취소</button> : null}
      </div>
    </>
  );
}

function MatchSearchBar({ query, filterCount, search, filterHref = '/matches?filter=1' }: { query: string; filterCount: number; search?: MatchListViewModel['search']; filterHref?: string }) {
  return (
    <div className="tm-list-searchbar">
      <form
        className="tm-list-search-form"
        onBlur={(event) => {
          if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
            search?.onBlur();
          }
        }}
        onSubmit={(event) => {
          event.preventDefault();
          search?.onSubmit();
        }}
      >
        <div className={`tm-list-search-input tm-list-search-input-field ${search?.isOpen ? 'tm-list-search-input-active' : ''}`} aria-label="매치 검색">
          <input
            aria-label="매치 검색어"
            className="tm-list-search-field"
            onChange={(event) => search?.onChange(event.target.value)}
            onFocus={search?.onFocus}
            placeholder={search?.placeholder ?? '지역, 시간, 매치명 검색'}
            value={search?.value ?? query}
          />
          {search?.value ? (
            <button className="tm-list-search-clear" type="button" aria-label="검색어 지우기" onClick={search.onClear}>
              ×
            </button>
          ) : null}
          <button className="tm-list-search-submit" type="submit" aria-label="검색">
            <SearchIcon size={19} strokeWidth={2} />
          </button>
        </div>
        {search?.isOpen ? (
          <div className="tm-list-search-dropdown">
            <div className="tm-list-search-dropdown-title">최근 검색</div>
            {search.isLoading ? <div className="tm-list-search-empty">불러오는 중</div> : null}
            {!search.isLoading && search.recentItems.length === 0 ? <div className="tm-list-search-empty">최근 검색어가 없어요</div> : null}
            {search.recentItems.map((item) => (
              <button key={item.id} className="tm-list-search-recent" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => search.onSelectRecent(item.query)}>
                <span>{item.query}</span>
                <SearchIcon size={16} strokeWidth={2} />
              </button>
            ))}
          </div>
        ) : null}
      </form>
      <Link className="tm-list-filter-button" href={filterHref} aria-label="필터">
        <FilterIcon size={21} strokeWidth={2} />
        {filterCount > 0 ? <span className="tm-list-filter-count tab-num">{filterCount}</span> : null}
      </Link>
    </div>
  );
}

function MatchFilterSheet({ model }: { model: MatchListViewModel }) {
  const sheet = model.filterSheet;
  const router = useRouter();
  if (!sheet) return null;

  return (
    <>
      <Link className="tm-filter-scrim" href={sheet.closeHref} aria-label="필터 닫기" />
      <BottomSheet open={sheet.open} onRequestClose={() => router.push(sheet.closeHref)} ariaLabel="매치 필터">
        <div className="tm-filter-sheet-handle" />
        <div className="tm-filter-sheet-head">
          <div>
            <div className="tm-text-subhead">필터</div>
            <div className="tm-text-caption" style={{ marginTop: 2 }}>원하는 조건으로 매치를 걸러볼 수 있어요</div>
          </div>
          <Link className="tm-btn tm-btn-sm tm-btn-ghost" href={sheet.resetHref} style={{ color: 'var(--text-caption)' }}>초기화</Link>
        </div>
        <div className="tm-filter-section">
          <div className="tm-text-label">정렬</div>
          <div className="tm-filter-chip-wrap">
            {sheet.sortOptions.map((option) => (
              <Link key={option.value} className={`tm-chip ${option.active ? 'tm-chip-active' : ''}`} href={option.href} aria-current={option.active ? true : undefined}>{option.label}</Link>
            ))}
          </div>
        </div>
        <div className="tm-filter-section">
          <div className="tm-text-label">성별 조건</div>
          <div className="tm-filter-chip-wrap">
            {sheet.genderOptions.map((option) => (
              <Link key={option.value} className={`tm-chip ${option.active ? 'tm-chip-active' : ''}`} href={option.href} aria-current={option.active ? true : undefined}>{option.label}</Link>
            ))}
          </div>
        </div>
        <div className="tm-filter-section">
          <div className="tm-text-label">레벨</div>
          <div className="tm-filter-chip-wrap">
            {sheet.levelOptions.map((option) => (
              <Link key={option.value} className={`tm-chip ${option.active ? 'tm-chip-active' : ''}`} href={option.href} aria-current={option.active ? true : undefined}>{option.label}</Link>
            ))}
          </div>
        </div>
        <div className="tm-filter-actions">
          <Link className="tm-btn tm-btn-lg tm-btn-neutral" href={sheet.closeHref}>닫기</Link>
          <Link className="tm-btn tm-btn-lg tm-btn-primary" href={sheet.applyHref}>적용하기</Link>
        </div>
      </BottomSheet>
    </>
  );
}

function SportSelector({ sports }: { sports: MatchListViewModel['sports'] }) {
  return (
    <div className="tm-sport-chip-row">
      {sports.map((sport) => {
        const className = `tm-chip ${sport.active ? 'tm-chip-active' : ''}`;
        const content = <>{sport.label} <span className="tab-num">{sport.count}</span></>;

        return sport.href ? (
          <Link key={sport.label} className={className} href={sport.href} aria-current={sport.active ? 'page' : undefined}>
            {content}
          </Link>
        ) : (
          <button key={sport.label} className={className} type="button" aria-pressed={sport.active}>
            {content}
          </button>
        );
      })}
    </div>
  );
}

function MatchCardItem({ match }: { match: MatchCardModel }) {
  return (
    <Link className="tm-match-list-card tm-card-interactive tm-pressable" href={`/matches/${match.id}`}>
      <div className={`tm-match-list-media${match.image ? '' : ' tm-match-media-sport'}`} style={match.image ? { backgroundImage: cssUrl(match.image) } : undefined}>
        {match.image ? null : <SportIllustration sport={match.sport} sizes="112px" />}
        <span className="tm-badge tm-badge-blue">{match.sport}</span>
        {/* [P1 숫자:단위 2:1 + tabular-nums] 현재/최대 인원 — 숫자(body-lg weight600) : 단위(caption) 2:1 */}
        <span className="tm-match-count-badge" style={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: 'var(--font-size-body-lg)' }}>{match.current}</span>
          <span style={{ fontSize: 'var(--font-size-body-sm)', color: 'inherit', opacity: 0.8 }}>/{match.capacity}명</span>
        </span>
      </div>
      <div className="tm-match-list-card-body">
        {/* [격상1] 종목 배지 제거 — 미디어 상단 badge에 이미 표시됨(중복).
            [격상2] 마감 orange 배지 제거 — footer actionLabel로 통합.
            레벨·성별은 pill 배지 → caption 인라인 텍스트로 강등(메타 배지 동등경쟁 해소). */}
        <div className="tm-text-caption" style={{ color: 'var(--text-caption)', marginTop: 2 }}>{match.level} · {match.gender}</div>
        <div className="tm-text-body-lg" style={{ marginTop: 8 }}>{match.title}</div>
        {/* [격상3] 시간만 weight 600으로 강조 — 행동 결정 핵심 정보 분리. 날짜·장소는 caption 유지. */}
        <div className="tm-text-caption" style={{ marginTop: 4 }}>
          <strong style={{ fontWeight: 600 }}>{match.date} {match.time}</strong>
          {' · '}{match.venue}
        </div>
        <div className="tm-match-list-footer">
          <span className="tm-text-caption">{match.region} · {match.host}</span>
          <span className="tm-text-label">{match.actionLabel}</span>
        </div>
      </div>
    </Link>
  );
}

/* #13: 로컬 InfoRow 제거 — 공유 primitives.tsx의 InfoRow로 통합 (sub/badge prop 지원 포함) */

/**
 * [P1 숫자:단위 2:1 + tabular-nums] 인원 행 — 숫자(subhead size, weight700)와 단위(body size)를 2:1로 조판.
 * 잔여 자리 ≤3 시 orange "마감 임박" 배지 병행 (색상 + 텍스트, WCAG 1.4.1).
 */
function CapacityRow({ current, capacity }: { current: number; capacity: number }) {
  const remaining = Math.max(capacity - current, 0);
  const isNearFull = remaining <= 3 && current < capacity;
  return (
    <div className="tm-info-row">
      <div className="tm-text-caption" style={{ color: 'var(--text-caption)', flexShrink: 0 }}>인원</div>
      <div style={{ textAlign: 'right', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 4 }}>
          {/* 숫자: subhead 크기 + weight700 + tabular-nums */}
          <span style={{
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 700,
            fontSize: 'var(--font-size-subhead)',
            color: 'var(--text-strong)',
            lineHeight: 1,
          }}>
            {current}
          </span>
          {/* 단위: body 크기 (약 절반) */}
          <span style={{ fontSize: 'var(--font-size-body)', color: 'var(--text-muted)', fontWeight: 500 }}>
            /{capacity}명
          </span>
          {isNearFull ? <span className="tm-badge tm-badge-orange">마감 임박</span> : null}
        </div>
        <div className="tm-text-micro" style={{ marginTop: 3, color: 'var(--text-caption)' }}>
          {remaining}자리 남았어요
        </div>
      </div>
    </div>
  );
}

function StateCard({ tone, title, body }: { tone: 'orange' | 'green' | 'grey'; title: string; body: string }) {
  const tint = tone === 'green' ? 'var(--tint-green)' : tone === 'grey' ? 'var(--tint-grey)' : 'var(--tint-orange)';
  const accent = tone === 'green' ? 'var(--green700)' : tone === 'grey' ? 'var(--text-muted)' : 'var(--orange700)';
  return (
    <Card pad={16} style={{ marginTop: 16, background: tint }}>
      {/* [P0/P1 아이콘+컬러] 아이콘을 타이틀과 함께 표시해 색상만으로 상태를 구분하지 않음 (WCAG 1.4.1) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <StatusIcon tone={tone} />
        <div className="tm-text-label" style={{ color: accent }}>{title}</div>
      </div>
      <div className="tm-text-caption" style={{ marginTop: 4 }}>{body}</div>
    </Card>
  );
}

function CreateProgress({ step, edit, completeSteps = [] }: { step: number; edit: boolean; completeSteps?: number[] }) {
  return (
    <div className="tm-create-progress">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <span
          className={`tm-badge ${edit ? 'tm-badge-orange' : 'tm-badge-blue'}`}
          {...(!edit && {
            role: 'progressbar',
            'aria-valuenow': step,
            'aria-valuemin': 1,
            'aria-valuemax': 4,
            'aria-label': `매치 만들기 ${step}단계/4단계`,
          })}
        >
          {edit ? '수정' : `${step}/4단계`}
        </span>
        <span className="tm-text-caption">{edit ? '기존 값 유지 · 변경사항만 저장' : ['종목 선택', '매치 정보', '장소와 시간', '작성 내용 확인'][step - 1]}</span>
      </div>
      {/* data-complete: 이미 지나온 스텝 중 필수 필드를 전부 채운 스텝 — CSS가 green으로 표시(#1). */}
      {!edit ? <div className="tm-create-bars" aria-hidden="true">{[1, 2, 3, 4].map((item) => <span key={item} data-active={item <= step} data-complete={completeSteps.includes(item)} />)}</div> : null}
    </div>
  );
}

function SportStep({ model }: { model: MatchCreateViewModel }) {
  return (
    <div>
      <h1 className="tm-text-heading">어떤 종목인가요?</h1>
      <p className="tm-text-body" style={{ marginTop: 8 }}>함께 할 종목을 선택해 주세요.</p>
      <div className="tm-create-sport-grid">
        {model.sports.map((sport) => (
          <button
            key={sport}
            className={`tm-card tm-pressable ${sport === model.selectedSport ? 'tm-create-selected' : ''}`}
            style={{ padding: 16, textAlign: 'left' }}
            type="button"
            aria-pressed={sport === model.selectedSport}
            onClick={() => model.form?.onSelectSport(sport)}
          >
            <div className="tm-text-body-lg">{sport}</div>
            {sport === model.selectedSport ? <div className="tm-text-caption" style={{ marginTop: 4 }}>선택됨</div> : null}
          </button>
        ))}
      </div>
      <FieldErrorText id="field-sportId" message={model.form?.fieldErrors?.sportId} />
    </div>
  );
}

function InfoStep({ model, edit }: { model: MatchCreateViewModel; edit: boolean }) {
  const draft = model.draft;
  return (
    <div>
      <h1 className="tm-text-heading">매치 정보</h1>
      {edit ? <CreateSelect label="종목" value={model.selectedSport} options={model.sports} onChange={model.form?.onSelectSport} /> : null}
      <CreateField id="field-title" error={model.form?.fieldErrors?.title} label="제목" value={draft.title} placeholder="예: 주말 저녁 풋살 멤버 모집" onChange={(value) => model.form?.onFieldChange('title', value)} />
      <CreateField label="설명" value={draft.description} placeholder="예: 초보도 편하게 참여할 수 있는 친선 매치예요." multiline onChange={(value) => model.form?.onFieldChange('description', value)} />
      <ImageUploadField image={draft.image} onChange={(value) => model.form?.onFieldChange('image', value)} onUpload={model.form?.uploadImage} />
      <CapacityField value={draft.capacity} onChange={(value) => model.form?.onFieldChange('capacity', value)} />
      <LevelRangeField levels={model.levels} minLevel={draft.minLevel} maxLevel={draft.maxLevel} onChange={(field, value) => model.form?.onFieldChange(field, value)} />
      <GenderRuleSelector value={draft.gender} onChange={(value) => model.form?.onFieldChange('gender', value)} />
      <CreateField label="규칙" value={draft.rules} placeholder="예: 풋살화 착용, 지각 시 미리 연락" multiline onChange={(value) => model.form?.onFieldChange('rules', value)} />
      {edit ? (
        <>
          <h2 className="tm-text-subhead" style={{ marginTop: 28 }}>장소와 시간</h2>
          <PlaceTimeFields model={model} />
        </>
      ) : null}
      {edit ? <StateCard tone="orange" title="변경사항 저장" body="저장에 실패하면 입력한 내용을 유지한 채 다시 시도할 수 있어요." /> : null}
    </div>
  );
}

function ImageUploadField({ image, onChange, onUpload }: { image: string; onChange?: (value: string) => void; onUpload?: (file: File) => Promise<string> }) {
  const [fileName, setFileName] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset value so re-selecting the same file (after failure/removal) re-fires onChange.
    event.target.value = '';
    if (!file) return;
    setFileName(file.name);
    setUploadError(null);

    if (onUpload) {
      setUploading(true);
      try {
        const url = await onUpload(file);
        onChange?.(url);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '이미지 업로드에 실패했어요. 다시 시도해 주세요.';
        setUploadError(msg);
        setFileName('');
      } finally {
        setUploading(false);
      }
    }
  };

  return (
    <Card pad={0} style={{ marginTop: 16, overflow: 'hidden' }}>
      <div className="tm-create-image-preview" style={{ backgroundImage: cssUrl(image) }}>
        <span className="tm-badge tm-badge-grey">대표 이미지</span>
      </div>
      <div style={{ padding: 16 }}>
        <label className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" style={{ opacity: uploading ? 0.6 : 1 }}>
          {uploading ? '업로드 중…' : fileName ? '이미지 변경' : '대표 이미지 선택'}
          <input className="sr-only" type="file" accept="image/*" disabled={uploading} onChange={handleChange} />
        </label>
        {uploadError ? <div className="tm-text-caption" role="alert" style={{ marginTop: 8, color: 'var(--orange700)' }}>{uploadError}</div> : null}
        {image && !uploading ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 12 }}>
            <span className="tm-text-caption" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName || '현재 대표 이미지'}</span>
            <button className="tm-btn tm-btn-sm tm-btn-ghost" type="button" onClick={() => { setFileName(''); onChange?.(''); }}>제거</button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function CapacityField({ value, onChange }: { value: number; onChange?: (value: number) => void }) {
  const options = Array.from({ length: 99 }, (_, index) => index + 2);
  const normalized = Math.min(100, Math.max(2, Number(value) || 2));

  return (
    <div className="tm-create-field">
      <div className="tm-text-label">최대 인원</div>
      <div className="tm-create-stepper">
        <button className="tm-create-stepper-button" type="button" aria-label="인원 줄이기" onClick={() => onChange?.(Math.max(2, normalized - 1))}>-</button>
        <select className="tm-create-input tm-create-select-control" value={normalized} aria-label="최대 인원 선택" onChange={(event) => onChange?.(Number(event.target.value))}>
          {options.map((item) => <option key={item} value={item}>{item}명</option>)}
        </select>
        <button className="tm-create-stepper-button" type="button" aria-label="인원 늘리기" onClick={() => onChange?.(Math.min(100, normalized + 1))}>+</button>
      </div>
    </div>
  );
}

function LevelRangeField({
  levels,
  minLevel,
  maxLevel,
  onChange,
}: {
  levels: string[];
  minLevel: string;
  maxLevel: string;
  onChange?: (field: 'minLevel' | 'maxLevel', value: string) => void;
}) {
  const fallbackLevel = levels[0] ?? '';
  const normalizedMinLevel = levels.includes(minLevel) ? minLevel : fallbackLevel;
  const normalizedMaxLevel = levels.includes(maxLevel) ? maxLevel : normalizedMinLevel;
  const minIndex = Math.max(0, levels.indexOf(normalizedMinLevel));
  const maxIndex = Math.max(minIndex, levels.indexOf(normalizedMaxLevel));
  const minOptions = levels.filter((_, index) => index <= maxIndex);
  const maxOptions = levels.filter((_, index) => index >= minIndex);

  const handleMinChange = (value: string) => {
    const nextIndex = levels.indexOf(value);
    onChange?.('minLevel', value);
    if (nextIndex > maxIndex) onChange?.('maxLevel', value);
  };

  const handleMaxChange = (value: string) => {
    const nextIndex = levels.indexOf(value);
    onChange?.('maxLevel', value);
    if (nextIndex < minIndex) onChange?.('minLevel', value);
  };

  return (
    <div className="tm-create-two-col">
      <CreateSelect label="최소 레벨" value={normalizedMinLevel} options={minOptions} onChange={handleMinChange} />
      <CreateSelect label="최대 레벨" value={normalizedMaxLevel} options={maxOptions} onChange={handleMaxChange} />
    </div>
  );
}

function CreateSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange?: (value: string) => void }) {
  return (
    <label className="tm-create-field">
      <div className="tm-text-label">{label}</div>
      <select aria-label={label} className="tm-create-input tm-create-select-control" value={value} onChange={(event) => onChange?.(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function PlaceTimeStep({ model }: { model: MatchCreateViewModel }) {
  return (
    <div>
      <h1 className="tm-text-heading">장소와 시간</h1>
      <PlaceTimeFields model={model} />
    </div>
  );
}

function PlaceTimeFields({ model }: { model: MatchCreateViewModel }) {
  const draft = model.draft;
  const errors = model.form?.fieldErrors;
  const recentVenues = model.form?.recentVenues ?? [];
  // #3 1단계: 장소 입력창이 focus를 갖고 있는 동안만 최근 사용 장소 칩을 보여준다.
  // 칩 버튼은 onMouseDown preventDefault로 이 blur보다 클릭이 먼저 처리되게 한다
  // (EntityPicker 드롭다운과 동일한 패턴) — 그래서 탭 한 번으로 안전하게 채워진다.
  const [venueFocused, setVenueFocused] = useState(false);
  return (
    <>
      <RegionSelect value={model.form?.regionId ?? ''} regions={model.form?.regions ?? []} onChange={model.form?.onRegionChange} error={errors?.regionId} />
      <CreateField
        id="field-venue"
        error={errors?.venue}
        label="장소"
        value={draft.venue}
        placeholder="예: 한강공원 축구장, 동네 체육관 등"
        onChange={(value) => model.form?.onFieldChange('venue', value)}
        onFocus={() => setVenueFocused(true)}
        onBlur={() => setVenueFocused(false)}
      >
        {venueFocused ? (
          <RecentVenueChips
            items={recentVenues}
            selectedValue={draft.venue}
            onSelect={(venue) => {
              model.form?.onFieldChange('venue', venue.placeName);
              model.form?.onFieldChange('address', venue.addressText ?? '');
              setVenueFocused(false);
            }}
          />
        ) : null}
      </CreateField>
      <CreateField label="상세 주소" value={draft.address} placeholder="예: 서울 영등포구 여의동로 330" onChange={(value) => model.form?.onFieldChange('address', value)} />
      <CreateField id="field-date" error={errors?.date} label="날짜" value={draft.date} type="date" onChange={(value) => model.form?.onFieldChange('date', value)} />
      <div className="tm-create-two-col">
        <CreateField id="field-startTime" error={errors?.startTime} label="시작 시간" value={draft.startTime} type="time" onChange={(value) => model.form?.onFieldChange('startTime', value)} />
        <CreateField label="종료 시간" value={draft.endTime} type="time" onChange={(value) => model.form?.onFieldChange('endTime', value)} />
      </div>
      <div className="tm-create-two-col">
        <CreateField id="field-deadlineDate" error={errors?.deadlineDate} label="신청 마감일" value={draft.deadlineDate} type="date" onChange={(value) => model.form?.onFieldChange('deadlineDate', value)} />
        <CreateField id="field-deadlineTime" error={errors?.deadlineTime} label="신청 마감시간" value={draft.deadlineTime} type="time" onChange={(value) => model.form?.onFieldChange('deadlineTime', value)} />
      </div>
      <div className="tm-text-caption" style={{ marginTop: 8 }}>둘 다 비워두면 경기 시작 전까지 신청을 받아요.</div>
    </>
  );
}

function RegionSelect({ value, regions, onChange, error }: { value: string; regions: Array<{ id: string; name: string }>; onChange?: (regionId: string) => void; error?: string }) {
  return (
    <label className="tm-create-field">
      <div className="tm-text-label">지역</div>
      <select id="field-regionId" aria-label="지역" className="tm-create-input tm-create-select-control" value={value} onChange={(event) => onChange?.(event.target.value)}>
        <option value="">시/군/구 선택</option>
        {regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}
      </select>
      <div className="tm-text-caption" style={{ marginTop: 8 }}>지역은 검색·추천에 쓰이고, 장소와 주소는 아래에 직접 입력해 주세요.</div>
      <FieldErrorText message={error} />
    </label>
  );
}

function ConfirmStep({ model }: { model: MatchCreateViewModel }) {
  const draft = model.draft;
  const regionName = model.form?.regions.find((region) => region.id === model.form?.regionId)?.name ?? '지역 선택 필요';
  const deadlineText = draft.deadlineDate && draft.deadlineTime ? `${draft.deadlineDate} ${draft.deadlineTime}` : '경기 시작 전까지';
  const timeRangeText = draft.endTime ? `${draft.date} ${draft.startTime}-${draft.endTime}` : `${draft.date} ${draft.startTime}`;
  return <div><h1 className="tm-text-heading">입력한 내용을 확인해 주세요</h1><Card pad={0} style={{ marginTop: 16, overflow: 'hidden' }}><div className="tm-create-image-preview" style={{ backgroundImage: cssUrl(draft.image) }} /><div style={{ padding: 16 }}><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><span className="tm-badge tm-badge-blue">{model.selectedSport}</span><span className="tm-badge tm-badge-grey">{draft.minLevel}-{draft.maxLevel}</span><span className="tm-badge tm-badge-grey">{draft.gender}</span></div><div className="tm-text-subhead" style={{ marginTop: 12 }}>{draft.title}</div><div className="tm-text-caption" style={{ marginTop: 8 }}>{draft.description}</div></div></Card><Card pad={16} style={{ marginTop: 12 }}><InfoRow label="지역" value={regionName} sub="검색·추천에 사용돼요" /><InfoRow label="일시" value={timeRangeText} /><InfoRow label="신청 마감" value={deadlineText} /><InfoRow label="장소" value={draft.venue} sub={draft.address} /><InfoRow label="인원" value={`최대 ${draft.capacity}명`} /><InfoRow label="이미지" value="대표 이미지" sub="목록과 상세 화면에 표시돼요" /></Card></div>;
}

function stepToNumber(step: MatchCreateViewModel['step']) {
  if (step === 'sport') return 1;
  if (step === 'info') return 2;
  if (step === 'place-time') return 3;
  return 4;
}

/* #2: MissingFieldsBanner가 각 결측 필드를 그 필드가 실제로 사는 스텝으로 링크할 때 쓴다.
 * 'info' 스텝만 라우트가 세그먼트 없는 /matches/new 라 템플릿 하나로 처리할 수 없다. */
function matchStepHref(step: MatchCreateViewModel['step']) {
  if (step === 'info') return '/matches/new';
  return `/matches/new/${step}`;
}

function nextCreateHref(step: MatchCreateViewModel['step']) {
  if (step === 'sport') return '/matches/new';
  if (step === 'info') return '/matches/new/place-time';
  if (step === 'place-time') return '/matches/new/confirm';
  // 확인 단계의 폴백 링크 — 실제 제출은 onSubmit 이 상세로 라우팅한다(완료 라우트는 도달 불가라 삭제).
  if (step === 'confirm') return '/matches';
  // 'edit' 단계에선 이 함수가 호출되지 않음(onSubmit/onCancel 핸들러가 직접 라우팅).
  // 만약 도달하면 안전하게 목록으로 복귀.
  return '/matches';
}
