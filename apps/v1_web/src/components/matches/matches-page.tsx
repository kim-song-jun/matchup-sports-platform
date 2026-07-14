'use client';

import Link from 'next/link';
import type { ChangeEvent, KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppChrome } from '@/components/v1-ui/shell';
import { Card, EmptyState, InfoRow, ListItem } from '@/components/v1-ui/primitives';
import { Button } from '@/components/v1-ui/button';
import { ChevronLeftIcon, FilterIcon, PlusIcon, SearchIcon, ShareIcon } from '@/components/v1-ui/icons';
import { NotificationBellButton } from '@/components/v1-ui/notification-bell';
import { cssUrl } from '@/lib/assets';
import { MatchTypeSegment } from '@/components/v1-ui/match-type-segment';
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
function CompletionCheckIcon() {
  return (
    <svg
      className="tm-complete-check"
      width="56"
      height="56"
      viewBox="0 0 56 56"
      fill="none"
      aria-hidden="true"
      style={{ display: 'block', margin: '0 auto 4px' }}
    >
      <circle cx="28" cy="28" r="28" fill="var(--blue50)" />
      <path
        d="M16 28.5L23.5 36L40 20"
        stroke="var(--blue500)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
      <path d="M7.5 4.5V8" stroke="var(--orange600)" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="7.5" cy="10.5" r="0.75" fill="var(--orange600)" />
    </svg>
  );
}

export function MatchListPageView({ model }: { model: MatchListViewModel }) {
  return (
    <AppChrome
      title="매치"
      activeTab="matches"
      topBar={false}
      floatingSlot={<MatchCreateFloatingButton />}
    >
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
      <div className="tm-match-list">
        <SportSelector sports={model.sports} />
        <div className="tm-match-summary-row">
          <div className="tm-text-label">{model.summary.label}</div>
          {/* summary.urgent = status==='open'(모집중) 매치 수 — '마감'은 의미 반대였음(WS11 Rank6) */}
          {/* #21 + [P1 tabular-nums]: '모집 중 N' 숫자 weight700 + tabular-nums */}
          <div className="tm-text-caption tab-num">{model.summary.count}개 · 오늘 {model.summary.today} · 모집 중 <strong style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{model.summary.urgent}</strong></div>
        </div>
        {model.matches.length ? (
          <div className="tm-match-card-stack">
            {model.matches.map((match, index) => <MatchCardItem key={match.id} match={match} index={index} />)}
          </div>
        ) : (
          /* EmptyState must be a sibling of .tm-match-card-stack, not nested inside it —
             the stack becomes a 2-up/3-up CSS grid on desktop (matches.css), and a single
             grid-item child gets confined to the first grid cell (~50%/33% width), reading
             as flush-left instead of centered across the full content column. Matches the
             pattern already used by teams-page.tsx / team-matches-page.tsx / tournaments page.tsx. */
          <EmptyState title="조건에 맞는 매치가 없어요" sub="다른 종목을 선택하거나 전체 매치로 돌아가면 모집 중인 매치를 볼 수 있어요." />
        )}
      </div>
      {model.filterSheet?.open ? <MatchFilterSheet model={model} /> : null}
    </AppChrome>
  );
}

export function MatchStatePageView({ model }: { model: MatchStateViewModel }) {
  return (
    <AppChrome title={model.title} activeTab="matches" bottomNav={false} backHref="/matches">
      {/* Desktop back + title header (mobile topbar is hidden on desktop) */}
      <div className="tm-desktop-page-head tm-show-desktop">
        <Link className="tm-desktop-back" href="/matches" aria-label="매치 목록으로 돌아가기">
          <ChevronLeftIcon size={20} strokeWidth={2.2} aria-hidden="true" />
        </Link>
        <h1 className="tm-text-heading" style={{ margin: 0 }}>{model.title}</h1>
      </div>
      <div className="tm-match-list">
        <EmptyState title={model.title} sub={model.description} />
        {model.state === 'error' ? (
          <Card pad={16} style={{ marginTop: 18, background: 'var(--grey50)' }}>
            <div className="tm-text-label">목록으로 돌아가 다시 확인해 주세요</div>
            <div className="tm-text-caption" style={{ marginTop: 6, lineHeight: 1.55 }}>
              새로고침 후에도 같은 문제가 반복되면 잠시 뒤 다시 시도해 주세요.
            </div>
            <Link className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" href="/matches" style={{ marginTop: 14 }}>목록으로 돌아가기</Link>
          </Card>
        ) : null}
        {model.state === 'joined' ? (
          <div className="tm-match-card-stack" style={{ marginTop: 18 }}>
            {model.matches.map((match, index) => <MatchCardItem key={match.id} match={match} index={index} />)}
          </div>
        ) : null}
      </div>
    </AppChrome>
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

export function MatchDetailPageView({ model }: { model: MatchDetailViewModel }) {
  const { match, mode } = model;
  const [heroMessage, setHeroMessage] = useState('');
  const locked = mode === 'pending' || mode === 'approved' || mode === 'closed' || match.status === 'full';
  const canRunAction = Boolean(model.onApply);
  const cta = model.applyLabel ?? (mode === 'mine' ? '매치 관리' : mode === 'approved' ? '승인 완료' : mode === 'pending' ? '신청 취소' : mode === 'closed' || match.status === 'full' ? '신청 마감' : '참가 신청');
  const ctaTone = mode === 'pending' ? 'tm-btn-warning' : mode === 'approved' ? 'tm-btn-success' : locked ? 'tm-btn-neutral' : 'tm-btn-primary';
  const showChat = mode === 'approved' && Boolean(model.onChat);
  const timeRange = match.endTime ? `${match.time}-${match.endTime}` : match.time;
  const runHeroAction = (action: (() => void | string | null | Promise<void | string | null>) | undefined, fallbackMessage: string) => {
    if (!action) return;
    void Promise.resolve(action())
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
      });
  };

  return (
    <AppChrome title="" activeTab="matches" bottomNav={false} topBar={false}>
      {/* Desktop: back link + match title (mobile topbar is hidden on desktop) */}
      <div className="tm-desktop-page-head tm-show-desktop">
        <Link className="tm-desktop-back" href="/matches" aria-label="매치 목록으로 돌아가기">
          <ChevronLeftIcon size={20} strokeWidth={2.2} aria-hidden="true" />
        </Link>
        <h1 className="tm-text-heading" style={{ margin: 0 }}>{match.title}</h1>
      </div>

      <article className="tm-match-detail">
        <div className="tm-match-detail-hero" style={{ backgroundImage: cssUrl(match.image) }}>
          <div className="tm-match-detail-overlay">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              {/* Mobile back button — hidden on desktop (desktop back is in the page head above) */}
              <Link className="tm-btn tm-btn-icon tm-btn-ghost tm-hero-button tm-hide-desktop" href="/matches" aria-label="뒤로가기">
                <ChevronLeftIcon size={22} strokeWidth={2.2} />
              </Link>
              <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                <button className="tm-btn tm-btn-icon tm-btn-ghost tm-hero-button" type="button" aria-label="공유" onClick={() => runHeroAction(model.onShare, '링크를 복사했어요')}><ShareIcon size={20} /></button>
                <NotificationBellButton className="tm-btn tm-btn-icon tm-btn-ghost tm-hero-button" ariaLabel="알림 목록" onClick={model.onNotify} />
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
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
              <div className="tm-text-caption" style={{ color: 'var(--overlay-white-76)', marginTop: 6 }}>{match.host} 호스트 · {match.deadline}</div>
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
                <Link className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" href="/my/matches/joined" style={{ marginTop: 10 }}>
                  내 신청 현황 보기
                </Link>
              </>
            ) : null}
            {mode === 'approved' ? <StateCard tone="green" title="승인 완료" body="참가를 확정했어요. 경기 당일 늦지 않게 도착해 주세요." /> : null}
            {mode === 'closed' ? <StateCard tone="grey" title="모집 완료" body="이 매치는 신청이 마감됐어요. 다른 매치를 둘러봐 주세요." /> : null}
            {match.rules.length ? <Card pad={16} style={{ marginTop: 10 }}><div className="tm-text-body-lg">규칙</div><div style={{ display: 'grid', gap: 6, marginTop: 10 }}>{match.rules.map((rule) => <div key={rule} className="tm-text-body" style={{ color: 'var(--text-muted)' }}>{rule}</div>)}</div></Card> : null}
            <Card pad={16} style={{ marginTop: 10 }}>
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
                <Link className="tm-btn tm-btn-lg tm-btn-primary" href={match.manageHref ?? `/matches/${match.id}/edit`}>{cta}</Link>
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
              <Link className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" href="/my/matches/joined" style={{ marginTop: 10 }}>
                내 신청 현황 보기
              </Link>
            </>
          ) : null}
          {mode === 'approved' ? <StateCard tone="green" title="승인 완료" body="참가를 확정했어요. 경기 당일 늦지 않게 도착해 주세요." /> : null}
          {mode === 'closed' ? <StateCard tone="grey" title="모집 완료" body="이 매치는 신청이 마감됐어요. 다른 매치를 둘러봐 주세요." /> : null}
          {match.rules.length ? <Card pad={16} style={{ marginTop: 10 }}><div className="tm-text-body-lg">규칙</div><div style={{ display: 'grid', gap: 6, marginTop: 10 }}>{match.rules.map((rule) => <div key={rule} className="tm-text-body" style={{ color: 'var(--text-muted)' }}>{rule}</div>)}</div></Card> : null}
          <Card pad={16} style={{ marginTop: 10 }}>
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
        </div>
      </article>

      {/* Mobile-only fixed CTA — hidden on desktop (CSS: .tm-match-detail + .tm-fixed-cta) */}
      <div className="tm-fixed-cta tm-hide-desktop">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <span className="tm-text-caption">{mode === 'mine' ? '내가 만든 매치' : '신청 상태'}</span>
          <span className="tm-text-label">{model.statusLabel ?? match.actionLabel}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: showChat ? '104px 1fr' : '1fr', gap: 8 }}>
          {showChat ? (
            <Button loading={model.chatPending} disabled={!model.onChat} onClick={model.onChat} size="lg" type="button" variant="neutral">
              {model.chatLabel ?? '채팅'}
            </Button>
          ) : null}
          {mode === 'mine' ? (
            <Link className="tm-btn tm-btn-lg tm-btn-primary" href={match.manageHref ?? `/matches/${match.id}/edit`}>{cta}</Link>
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
    </AppChrome>
  );
}
export function MatchCreatePageView({ model }: { model: MatchCreateViewModel }) {
  if (model.step === 'complete') return <MatchComplete model={model} />;
  const edit = model.step === 'edit';
  const stepNo = edit ? 2 : stepToNumber(model.step);
  const primaryLabel = model.form?.submitLabel ?? (edit ? '변경사항 저장' : model.step === 'confirm' ? '매치 만들기' : '다음');
  const primaryAction = model.step === 'confirm' || edit ? model.form?.onSubmit : model.form?.onNext;
  const secondaryAction = model.form?.onBack;
  return (
    <AppChrome title={edit ? '매치 수정' : '매치 만들기'} activeTab="matches" bottomNav={false} backHref={edit ? (model.matchId ? `/matches/${model.matchId}` : '/matches') : '/matches'}>
      {/* Desktop page head */}
      <div className="tm-desktop-page-head tm-show-desktop">
        <Link className="tm-desktop-back" href={edit ? (model.matchId ? `/matches/${model.matchId}` : '/matches') : '/matches'} aria-label={edit ? '매치 상세로 돌아가기' : '매치 목록으로 돌아가기'}>
          <ChevronLeftIcon size={20} strokeWidth={2.2} aria-hidden="true" />
        </Link>
        <h1 className="tm-text-heading" style={{ margin: 0 }}>{edit ? '매치 수정' : '매치 만들기'}</h1>
      </div>
      <div className="tm-create-shell tm-match-create-shell">
        {/* 단계 전환 시 스크린리더에 현재 단계 공지 */}
        {!edit ? (
          <div className="sr-only" aria-live="polite" aria-atomic="true">
            {['종목 선택', '매치 정보', '장소와 시간', '작성 내용 확인'][stepNo - 1]} — {stepNo}단계 / 4단계
          </div>
        ) : null}
        <CreateProgress step={stepNo} edit={edit} />
        {model.form?.error ? <StateCard tone="orange" title="저장할 수 없어요" body={model.form.error} /> : null}
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
        {edit && model.form?.onCancel ? <button className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" type="button" style={{ marginTop: 8 }} disabled={model.form.submitting} onClick={model.form.onCancel}>매치 취소</button> : null}
      </div>
    </AppChrome>
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
  if (!sheet) return null;

  return (
    <>
      <Link className="tm-filter-scrim" href={sheet.closeHref} aria-label="필터 닫기" />
      <DraggableFilterSheet closeHref={sheet.closeHref} ariaLabel="매치 필터">
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
      </DraggableFilterSheet>
    </>
  );
}

function DraggableFilterSheet({
  closeHref,
  ariaLabel,
  children,
}: {
  closeHref: string;
  ariaLabel: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const startYRef = useRef(0);
  const draggingRef = useRef(false);
  const [offsetY, setOffsetY] = useState(0);

  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    startYRef.current = event.clientY;
    draggingRef.current = true;
    setOffsetY(0);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    if (!draggingRef.current) return;
    setOffsetY(Math.max(0, event.clientY - startYRef.current));
  };

  const handlePointerEnd = (event: PointerEvent<HTMLElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (offsetY > 72) {
      router.push(closeHref);
      return;
    }
    setOffsetY(0);
  };

  // a11y: ESC 키로 필터 시트 닫기 (드래그 동작과 독립적으로 동작)
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      router.push(closeHref);
    }
  };

  return (
    <div className="tm-filter-layer">
      {/* role="dialog" + aria-modal="true": 스크린리더가 시트를 대화상자로 인식하고
          배경 콘텐츠를 읽지 않도록 함. focus-trap은 드래그 인터랙션 충돌 위험으로 생략. */}
      <section
        className="tm-filter-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        style={{ transform: `translateY(${offsetY}px)` }}
      >
        {children}
      </section>
    </div>
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

function MatchCardItem({ match, index }: { match: MatchCardModel; index: number }) {
  return (
    <Link className="tm-match-list-card tm-pressable" href={`/matches/${match.id}`}>
      <div className="tm-match-list-media" style={{ backgroundImage: cssUrl(match.image) }}>
        <span className="tm-badge tm-badge-blue">{index === 0 ? '추천' : match.sport}</span>
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
        <div className="tm-text-caption" style={{ marginTop: 5 }}>
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
  const accent = tone === 'green' ? 'var(--green500)' : tone === 'grey' ? 'var(--text-muted)' : 'var(--orange600)';
  return (
    <Card pad={14} style={{ marginTop: 14, background: tint }}>
      {/* [P0/P1 아이콘+컬러] 아이콘을 타이틀과 함께 표시해 색상만으로 상태를 구분하지 않음 (WCAG 1.4.1) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <StatusIcon tone={tone} />
        <div className="tm-text-label" style={{ color: accent }}>{title}</div>
      </div>
      <div className="tm-text-caption" style={{ marginTop: 5 }}>{body}</div>
    </Card>
  );
}

function CreateProgress({ step, edit }: { step: number; edit: boolean }) {
  return (
    <div className="tm-create-progress">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
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
      {!edit ? <div className="tm-create-bars" aria-hidden="true">{[1, 2, 3, 4].map((item) => <span key={item} data-active={item <= step} />)}</div> : null}
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
            {sport === model.selectedSport ? <div className="tm-text-caption" style={{ marginTop: 5 }}>선택됨</div> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function InfoStep({ model, edit }: { model: MatchCreateViewModel; edit: boolean }) {
  const draft = model.draft;
  return (
    <div>
      <h1 className="tm-text-heading">매치 정보</h1>
      <CreateField label="제목" value={draft.title} placeholder="예: 주말 저녁 풋살 멤버 모집" onChange={(value) => model.form?.onFieldChange('title', value)} />
      <CreateField label="설명" value={draft.description} placeholder="예: 초보도 편하게 참여할 수 있는 친선 매치예요." multiline onChange={(value) => model.form?.onFieldChange('description', value)} />
      <ImageUploadField image={draft.image} onChange={(value) => model.form?.onFieldChange('image', value)} onUpload={model.form?.uploadImage} />
      <CapacityField value={draft.capacity} onChange={(value) => model.form?.onFieldChange('capacity', value)} />
      <LevelRangeField levels={model.levels} minLevel={draft.minLevel} maxLevel={draft.maxLevel} onChange={(field, value) => model.form?.onFieldChange(field, value)} />
      <GenderRuleSelector value={draft.gender} onChange={(value) => model.form?.onFieldChange('gender', value)} />
      <CreateField label="규칙" value={draft.rules} placeholder="예: 풋살화 착용, 지각 시 미리 연락" multiline onChange={(value) => model.form?.onFieldChange('rules', value)} />
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
    <Card pad={0} style={{ marginTop: 14, overflow: 'hidden' }}>
      <div className="tm-create-image-preview" style={{ backgroundImage: cssUrl(image) }}>
        <span className="tm-badge tm-badge-grey">대표 이미지</span>
      </div>
      <div style={{ padding: 14 }}>
        <label className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" style={{ opacity: uploading ? 0.6 : 1 }}>
          {uploading ? '업로드 중…' : fileName ? '이미지 변경' : '대표 이미지 선택'}
          <input className="sr-only" type="file" accept="image/*" disabled={uploading} onChange={handleChange} />
        </label>
        {uploadError ? <div className="tm-text-caption" role="alert" style={{ marginTop: 8, color: 'var(--orange500)' }}>{uploadError}</div> : null}
        {fileName && !uploading ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <span className="tm-text-caption" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</span>
            <button className="tm-btn tm-btn-sm tm-btn-ghost" type="button" onClick={() => { setFileName(''); onChange?.(''); }}>제거</button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function CapacityField({ value, onChange }: { value: number; onChange?: (value: number) => void }) {
  const options = Array.from({ length: 29 }, (_, index) => index + 2);
  const normalized = Math.min(30, Math.max(2, Number(value) || 2));

  return (
    <div className="tm-create-field">
      <div className="tm-text-label">최대 인원</div>
      <div className="tm-create-stepper">
        <button className="tm-create-stepper-button" type="button" aria-label="인원 줄이기" onClick={() => onChange?.(Math.max(2, normalized - 1))}>-</button>
        <select className="tm-create-input tm-create-select-control" value={normalized} aria-label="최대 인원 선택" onChange={(event) => onChange?.(Number(event.target.value))}>
          {options.map((item) => <option key={item} value={item}>{item}명</option>)}
        </select>
        <button className="tm-create-stepper-button" type="button" aria-label="인원 늘리기" onClick={() => onChange?.(Math.min(30, normalized + 1))}>+</button>
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
      <select className="tm-create-input tm-create-select-control" value={value} onChange={(event) => onChange?.(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function PlaceTimeStep({ model }: { model: MatchCreateViewModel }) {
  const draft = model.draft;
  return (
    <div>
      <h1 className="tm-text-heading">장소와 시간</h1>
      <RegionSelect value={model.form?.regionId ?? ''} regions={model.form?.regions ?? []} onChange={model.form?.onRegionChange} />
      <CreateField label="장소" value={draft.venue} placeholder="예: 한강공원 축구장, 동네 체육관 등" onChange={(value) => model.form?.onFieldChange('venue', value)} />
      <CreateField label="상세 주소" value={draft.address} placeholder="예: 서울 영등포구 여의동로 330" onChange={(value) => model.form?.onFieldChange('address', value)} />
      <CreateField label="날짜" value={draft.date} type="date" onChange={(value) => model.form?.onFieldChange('date', value)} />
      <div className="tm-create-two-col">
        <CreateField label="시작 시간" value={draft.startTime} type="time" onChange={(value) => model.form?.onFieldChange('startTime', value)} />
        <CreateField label="종료 시간" value={draft.endTime} type="time" onChange={(value) => model.form?.onFieldChange('endTime', value)} />
      </div>
      <div className="tm-create-two-col">
        <CreateField label="신청 마감일" value={draft.deadlineDate} type="date" onChange={(value) => model.form?.onFieldChange('deadlineDate', value)} />
        <CreateField label="신청 마감시간" value={draft.deadlineTime} type="time" onChange={(value) => model.form?.onFieldChange('deadlineTime', value)} />
      </div>
      <div className="tm-text-caption" style={{ marginTop: 6 }}>둘 다 비워두면 경기 시작 전까지 신청을 받아요.</div>
    </div>
  );
}

function RegionSelect({ value, regions, onChange }: { value: string; regions: Array<{ id: string; name: string }>; onChange?: (regionId: string) => void }) {
  return (
    <label className="tm-create-field">
      <div className="tm-text-label">지역</div>
      <select className="tm-create-input tm-create-select-control" value={value} onChange={(event) => onChange?.(event.target.value)}>
        <option value="">시/군/구 선택</option>
        {regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}
      </select>
      <div className="tm-text-caption" style={{ marginTop: 6 }}>지역은 검색·추천에 쓰이고, 장소와 주소는 아래에 직접 입력해 주세요.</div>
    </label>
  );
}

function ConfirmStep({ model }: { model: MatchCreateViewModel }) {
  const draft = model.draft;
  const regionName = model.form?.regions.find((region) => region.id === model.form?.regionId)?.name ?? '지역 선택 필요';
  const deadlineText = draft.deadlineDate && draft.deadlineTime ? `${draft.deadlineDate} ${draft.deadlineTime}` : '경기 시작 전까지';
  return <div><h1 className="tm-text-heading">입력한 내용을 확인해 주세요</h1><Card pad={0} style={{ marginTop: 16, overflow: 'hidden' }}><div className="tm-create-image-preview" style={{ backgroundImage: cssUrl(draft.image) }} /><div style={{ padding: 16 }}><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><span className="tm-badge tm-badge-blue">{model.selectedSport}</span><span className="tm-badge tm-badge-grey">{draft.minLevel}-{draft.maxLevel}</span><span className="tm-badge tm-badge-grey">{draft.gender}</span></div><div className="tm-text-subhead" style={{ marginTop: 10 }}>{draft.title}</div><div className="tm-text-caption" style={{ marginTop: 6 }}>{draft.description}</div></div></Card><Card pad={16} style={{ marginTop: 12 }}><InfoRow label="지역" value={regionName} sub="검색·추천에 사용돼요" /><InfoRow label="일시" value={`${draft.date} ${draft.startTime}-${draft.endTime}`} /><InfoRow label="신청 마감" value={deadlineText} /><InfoRow label="장소" value={draft.venue} sub={draft.address} /><InfoRow label="인원" value={`최대 ${draft.capacity}명`} /><InfoRow label="이미지" value="대표 이미지" sub="목록과 상세 화면에 표시돼요" /></Card></div>;
}

function MatchComplete({ model }: { model: MatchCreateViewModel }) {
  const [shareMsg, setShareMsg] = useState('');
  // 생성된 매치 상세 URL. matchId가 없으면(정적 데모 경로) 목록으로 fallback.
  const detailHref = model.matchId ? `/matches/${model.matchId}` : '/matches';

  const handleShare = async () => {
    const url = typeof window !== 'undefined' ? new URL(detailHref, window.location.origin).toString() : detailHref;
    const title = model.draft.title || '새 매치';
    // navigator.share 지원 환경(모바일)에서는 네이티브 공유 시트 사용
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, url });
        // null 반환: 네이티브 시트가 UX 직접 처리
        return;
      } catch {
        // 취소(AbortError) 또는 미지원 → 클립보드 fallback
      }
    }
    // 클립보드 복사 fallback
    try {
      await navigator.clipboard.writeText(url);
      setShareMsg('링크를 복사했어요');
    } catch {
      setShareMsg('링크 복사에 실패했어요');
    }
    window.setTimeout(() => setShareMsg(''), 1800);
  };

  return (
    <AppChrome title="매치 만들기 완료" activeTab="matches" bottomNav={false} backHref="/matches">
      {/* Desktop page head */}
      <div className="tm-desktop-page-head tm-show-desktop">
        <Link className="tm-desktop-back" href="/matches" aria-label="매치 목록으로 돌아가기">
          <ChevronLeftIcon size={20} strokeWidth={2.2} aria-hidden="true" />
        </Link>
        <h1 className="tm-text-heading" style={{ margin: 0 }}>매치 만들기 완료</h1>
      </div>
      <div className="tm-create-shell tm-match-create-shell">
        {/* [P2 마이크로인터랙션] 완료 체크 애니메이션 — globals.css .tm-complete-check (reduced-motion 자동 처리) */}
        <CompletionCheckIcon />
        <EmptyState title="매치를 만들었어요" sub="팀원들에게 링크를 공유해 참여 의사를 확인해 보세요." />
        <Card pad={16} style={{ marginTop: 22, background: 'var(--blue50)', borderColor: 'var(--tint-blue-border)' }}>
          <div className="tm-text-body-lg">매치 공유</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>팀원들에게 링크와 일정을 알려보세요</div>
        </Card>
        {shareMsg ? <div className="tm-text-caption" role="status" style={{ marginTop: 12, textAlign: 'center', color: 'var(--text-caption)' }}>{shareMsg}</div> : null}
      </div>
      <div className="tm-fixed-cta">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
          <Link className="tm-btn tm-btn-lg tm-btn-neutral" href={detailHref}>상세 보기</Link>
          <button className="tm-btn tm-btn-lg tm-btn-primary" type="button" onClick={() => { void handleShare(); }}>공유하기</button>
        </div>
      </div>
    </AppChrome>
  );
}

function CreateField({ label, value, placeholder, suffix, multiline, type = 'text', onChange }: { label: string; value?: string; placeholder?: string; suffix?: string; multiline?: boolean; type?: string; onChange?: (value: string) => void }) {
  // date/time 인풋은 lang="ko"를 부여해 OS locale에 상관없이
  // 가능한 경우 한국어 포맷(yyyy.mm.dd 또는 HH:MM)으로 표시를 유도한다.
  // CSS(.tm-create-native-input[type="date" i] 등)에서 appearance:none +
  // ::-webkit-calendar-picker-indicator 처리로 OS 스피너/아이콘을 제거한다.
  const isDateLike = type === 'date' || type === 'time';
  return (
    <label className="tm-create-field">
      <div className="tm-text-label">{label}</div>
      <div className={`tm-create-input ${multiline ? 'tm-create-input-multiline' : ''}`}>
        {onChange ? (
          multiline ? (
            <textarea className="tm-create-native-input" value={value ?? ''} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
          ) : (
            <input
              className="tm-create-native-input"
              type={type}
              lang={isDateLike ? 'ko' : undefined}
              value={value ?? ''}
              placeholder={placeholder}
              onChange={(event) => onChange(event.target.value)}
            />
          )
        ) : (
          <span className="tm-text-body" style={{ color: value ? 'var(--text-strong)' : 'var(--text-caption)' }}>{value || placeholder}</span>
        )}
        {suffix ? <span className="tm-text-caption">{suffix}</span> : null}
      </div>
    </label>
  );
}

function GenderRuleSelector({ value, onChange }: { value: string; onChange?: (value: string) => void }) {
  return (
    <div className="tm-create-field">
      <div className="tm-text-label">성별 조건</div>
      <div className="tm-team-form-chip-row">
        {['성별 무관', '남', '여'].map((option) => (
          <button key={option} className={`tm-chip ${value === option ? 'tm-chip-active' : ''}`} type="button" aria-pressed={value === option} onClick={() => onChange?.(option)}>
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function stepToNumber(step: MatchCreateViewModel['step']) {
  if (step === 'sport') return 1;
  if (step === 'info') return 2;
  if (step === 'place-time') return 3;
  return 4;
}

function nextCreateHref(step: MatchCreateViewModel['step']) {
  if (step === 'sport') return '/matches/new';
  if (step === 'info') return '/matches/new/place-time';
  if (step === 'place-time') return '/matches/new/confirm';
  if (step === 'confirm') return '/matches/new/complete';
  // 'complete'·'edit' 단계에선 이 함수가 호출되지 않음(onSubmit/onCancel 핸들러가 직접 라우팅).
  // 만약 도달하면 안전하게 목록으로 복귀.
  return '/matches';
}
