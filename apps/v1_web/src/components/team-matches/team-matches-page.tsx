'use client';

import Link from 'next/link';
import type { ChangeEvent, KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppChrome } from '@/components/v1-ui/shell';
import { Card, EmptyState } from '@/components/v1-ui/primitives';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { ChevronLeftIcon, FilterIcon, PlusIcon, SearchIcon, ShareIcon } from '@/components/v1-ui/icons';
import { MatchTypeSegment } from '@/components/v1-ui/match-type-segment';
import { NotificationBellButton } from '@/components/v1-ui/notification-bell';
import { TeamAvatar } from '@/components/v1-ui/team-avatar';
import { cssUrl } from '@/lib/assets';
import type {
  TeamMatchCreateViewModel,
  TeamMatchDetailViewModel,
  TeamMatchListViewModel,
  TeamMatchModel,
  TeamMatchStateViewModel,
} from './team-matches.types';

export function TeamMatchListPageView({ model }: { model: TeamMatchListViewModel }) {
  return (
    <AppChrome
      title="매치"
      activeTab="matches"
      topBar={false}
      floatingSlot={<TeamMatchCreateFloatingButton />}
    >
      {/* 데스크톱 전용 인라인 헤더 — FAB가 데스크톱에서 숨겨지므로 대체 CTA 제공 */}
      <div className="tm-team-match-desktop-header tm-show-desktop">
        <h1 className="tm-team-match-desktop-header-title">팀매치</h1>
        <Link className="tm-team-match-desktop-create-btn" href="/team-matches/new/team" aria-label="팀매치 만들기">
          <PlusIcon size={18} strokeWidth={2.5} aria-hidden="true" />
          팀매치 만들기
        </Link>
      </div>
      <TeamMatchSearchBar filterCount={model.filterCount} search={model.search} query={model.query} filterHref={model.filterHref} />
      <MatchTypeSegment active="team" />
      <div className="tm-match-list">
        <div className="tm-sport-chip-row">{model.sports.map((sport) => sport.href ? <Link key={sport.label} className={`tm-chip ${sport.active ? 'tm-chip-active' : ''}`} href={sport.href} aria-current={sport.active ? 'page' : undefined}>{sport.label} <span className="tab-num">{sport.count}</span></Link> : <button key={sport.label} className={`tm-chip ${sport.active ? 'tm-chip-active' : ''}`} type="button" aria-pressed={sport.active}>{sport.label} <span className="tab-num">{sport.count}</span></button>)}</div>
        {/* P1: 통계 숫자 tabular-nums + weight 차등 (2:1 원칙) */}
        <div className="tm-match-summary-row">
          <div className="tm-text-label">서울 전체 · 팀매치</div>
          <div className="tm-text-caption tab-num">
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{model.summary.count}</span>개 · 오늘 {model.summary.today} · 모집 중 <strong style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{model.summary.urgent}</strong>
          </div>
        </div>
        {/* #5: 로딩 중엔 PageSkeleton, 완료 후 비어 있으면 EmptyState — 빈/로딩 구분 */}
        {model.isLoading
          ? <PageSkeleton />
          : model.matches.length
            ? <div className="tm-match-card-stack">{model.matches.map((match) => <TeamMatchCard key={match.id} match={match} />)}</div>
            : <EmptyState title="조건에 맞는 팀매치가 없어요" sub="다른 종목을 선택하거나 필터를 초기화해 다시 확인해 주세요." />
        }
      </div>
      {model.filterSheet?.open ? <TeamMatchFilterSheet model={model} /> : null}
    </AppChrome>
  );
}

export function TeamMatchStatePageView({ model }: { model: TeamMatchStateViewModel }) {
  return (
    <AppChrome title={model.title} activeTab="matches" bottomNav={false} backHref="/team-matches">
      <div className="tm-match-list">
        <EmptyState title={model.title} sub={model.description} />
        {model.state === 'error' ? (
          <Card pad={16} style={{ marginTop: 18, background: 'var(--grey50)' }}>
            <div className="tm-text-label">목록에서 다시 확인해 주세요</div>
            <div className="tm-text-caption" style={{ marginTop: 6, lineHeight: 1.55 }}>
              새로고침 후에도 같은 문제가 반복되면 잠시 뒤 다시 시도해 보세요.
            </div>
            <Link className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" href="/team-matches" style={{ marginTop: 14 }}>목록으로 돌아가기</Link>
          </Card>
        ) : null}
      </div>
    </AppChrome>
  );
}

function TeamMatchCreateFloatingButton() {
  return (
    <Link className="tm-floating-fab" href="/team-matches/new/team" aria-label="팀매치 만들기">
      <PlusIcon size={25} strokeWidth={2.2} />
    </Link>
  );
}

function teamMatchOpponentLabel(mode: TeamMatchDetailViewModel['mode']) {
  if (mode === 'pending') return '검토 중';
  if (mode === 'approved') return '승인 완료';
  if (mode === 'mine') return '신청팀';
  return '모집 중';
}

function teamMatchOpponentSub(mode: TeamMatchDetailViewModel['mode']) {
  if (mode === 'pending') return '홈팀 검토 중';
  if (mode === 'approved') return '참가 확정';
  if (mode === 'mine') return '승인 후 확정';
  return '신청 후 승인';
}

export function TeamMatchDetailPageView({ model }: { model: TeamMatchDetailViewModel }) {
  const { match, mode } = model;
  const locked = mode === 'pending' || mode === 'approved';
  const cta = model.applyLabel ?? (mode === 'mine' ? '매치 관리' : mode === 'approved' ? '승인 완료' : mode === 'pending' ? '신청 취소' : '신청하기');
  const canRunAction = Boolean(model.onApply);
  /* ctaTone: 행동 불가(신청 불가 등 onApply=undefined + 리다이렉트도 없는 상태)는
   * neutral+disabled 조합으로 표시 — primary 파란 버튼처럼 보여 클릭 오인 방지(T1). */
  const ctaTone = mode === 'pending' ? 'tm-btn-warning' : mode === 'approved' ? 'tm-btn-success' : locked ? 'tm-btn-neutral' : canRunAction ? 'tm-btn-primary' : 'tm-btn-neutral tm-btn-disabled';
  // 채팅 버튼: approved/host(mine)는 활성, pending(승인 대기)은 disabled + '승인 완료 후 이용' 안내.
  // default(비참여자)에는 미노출.
  const chatEnabled = Boolean(model.onChat);
  const showChat = mode === 'approved' || mode === 'mine' || mode === 'pending';
  const timeRange = match.endTime ? `${match.time}-${match.endTime}` : match.time;
  const [heroMessage, setHeroMessage] = useState('');

  const heroActionBusyRef = useRef(false);
  const runHeroAction = (action: (() => void | Promise<unknown>) | undefined, successMessage: string) => {
    // 로딩 중 재클릭 시 중복 제출 방지 — disabled/loading prop은 리렌더 이후에나 반영되므로
    // 동기적인 ref 락으로 한 번 더 막는다.
    if (!action || heroActionBusyRef.current) return;
    heroActionBusyRef.current = true;
    // action()을 .then() 콜백 안에서 호출 — 동기 throw도 promise rejection으로 변환되어
    // .catch/.finally가 항상 실행되고 락이 풀린다(Promise.resolve(action())은 인자 평가가
    // Promise.resolve 호출보다 먼저라 동기 throw 시 .finally를 건너뛰어 락이 영구 고정됨).
    void Promise.resolve()
      .then(() => action())
      .then(() => {
        setHeroMessage(successMessage);
        window.setTimeout(() => setHeroMessage(''), 2000);
      })
      .catch(() => {
        setHeroMessage('처리하지 못했어요. 잠시 후 다시 시도해 주세요.');
        window.setTimeout(() => setHeroMessage(''), 2000);
      })
      .finally(() => {
        heroActionBusyRef.current = false;
      });
  };

  /* Chat button — rendered only when showChat is true (approved/mine/pending).
   * disabled + notice when chatEnabled is false (pending, not yet approved). */
  const chatButton = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <button className="tm-btn tm-btn-lg tm-btn-neutral" type="button" disabled={!chatEnabled || model.chatPending} onClick={model.onChat}>
        {model.chatPending ? '연결 중' : model.chatLabel ?? '채팅'}
      </button>
      {!chatEnabled ? (
        <div className="tm-text-micro" style={{ textAlign: 'center', color: 'var(--text-caption)' }}>승인 완료 후 이용할 수 있어요</div>
      ) : null}
    </div>
  );

  /* Host-team card — rendered in left column (mobile) and right column (desktop).
   * Desktop 우측 컬럼에 이동해 40% 보이드를 채움(T1). 모바일은 기존 위치 유지. */
  const hostTeamCard = (
    <Link className="tm-card tm-pressable tm-host-team-card" href={match.hostTeamHref ?? '/teams'} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16 }}>
      {/* 팀 로고 아바타 — 원본은 48px였으나 TeamAvatar 표준 사이즈 중 가장 근접한 md(40px)로 통일 */}
      <TeamAvatar seed={match.hostTeamId ?? match.hostTeam} name={match.hostTeam} logoUrl={match.hostTeamLogoUrl} size="md" />
      {/* 팀 정보 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>홈팀 정보</div>
        <div className="tm-text-body-lg" style={{ marginTop: 2 }}>{match.hostTeam}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 5 }}>
          <span className="tm-badge tm-badge-blue">{match.sport}</span>
          <span className="tm-badge tm-badge-grey">{match.grade}등급</span>
          {match.hostTeamTrustState && match.hostTeamTrustState !== 'none' ? (
            <span className="tm-badge tm-badge-blue">{trustStateLabel(match.hostTeamTrustState)}</span>
          ) : null}
        </div>
      </div>
      {/* 팀 보기는 보조 CTA — apply가 단일 primary; 파란 fill 중복 방지(R-K5) */}
      <span className="tm-btn tm-btn-sm tm-btn-neutral" style={{ flexShrink: 0 }}>팀 보기</span>
    </Link>
  );

  /* Shared CTA buttons — rendered in both mobile fixed bar and desktop sticky card */
  const ctaButtons = (
    <>
      {showChat ? chatButton : null}
      {mode === 'mine' ? (
        <Link className="tm-btn tm-btn-lg tm-btn-primary" href={match.manageHref ?? `/team-matches/${match.id}/edit`}>{cta}</Link>
      ) : (
        /* P2: 완료 메시지 능동형 전환 ("신청이 취소되었어요" → "신청을 취소했어요") */
        <button className={`tm-btn tm-btn-lg ${ctaTone}`} disabled={!canRunAction || model.applyPending} type="button" onClick={() => runHeroAction(model.onApply, mode === 'pending' ? '신청을 취소했어요.' : '신청을 완료했어요.')}>
          {model.applyPending ? '처리 중' : cta}
        </button>
      )}
    </>
  );

  return (
    <AppChrome title="" activeTab="matches" bottomNav={false} topBar={false}>
      {/* Desktop page header: back link + title (mobile topbar is hidden on desktop) */}
      <div className="tm-desktop-page-head tm-show-desktop">
        <Link className="tm-desktop-back" href="/team-matches" aria-label="팀매치 목록으로 돌아가기">
          <ChevronLeftIcon size={22} strokeWidth={2.2} />
        </Link>
        <h1 className="tm-text-heading">{match.title || '팀매치 상세'}</h1>
      </div>

      {/* Desktop 2-column layout wrapper */}
      <div className="tm-team-match-detail-desktop">
        {/* LEFT: VS hero + info */}
        <div className="tm-team-match-detail-left">
          <article className="tm-match-detail">
            <div className="tm-team-vs-hero">
              {/* Mobile-only back + action buttons inside hero (hidden on desktop) */}
              <div className="tm-hide-desktop" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Link className="tm-btn tm-btn-icon tm-btn-ghost tm-hero-button" href="/team-matches" aria-label="뒤로가기">
                  <ChevronLeftIcon size={22} strokeWidth={2.2} />
                </Link>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="tm-btn tm-btn-icon tm-btn-ghost tm-hero-button" type="button" aria-label="공유" onClick={() => runHeroAction(model.onShare, '링크를 복사했어요')}><ShareIcon size={20} /></button>
                  <NotificationBellButton className="tm-btn tm-btn-icon tm-btn-ghost tm-hero-button" ariaLabel="알림" onClick={model.onNotify} />
                </div>
              </div>
              {/* Desktop-only share + notify actions inside hero */}
              <div className="tm-team-match-hero-actions tm-show-desktop">
                <button className="tm-btn tm-btn-icon tm-btn-ghost tm-hero-button" type="button" aria-label="공유" onClick={() => runHeroAction(model.onShare, '링크를 복사했어요')}><ShareIcon size={20} /></button>
                <NotificationBellButton className="tm-btn tm-btn-icon tm-btn-ghost tm-hero-button" ariaLabel="알림" onClick={model.onNotify} />
              </div>
              <div className="tm-team-vs-row">
                <div>
                  <div className="tm-text-caption" style={{ color: 'var(--overlay-white-68)' }}>홈팀</div>
                  <div className="tm-text-subhead" style={{ color: 'var(--static-white)' }}>{match.hostTeam}</div>
                  <div className="tm-text-micro" style={{ color: 'var(--overlay-white-72)' }}>매너 {match.manner} · 승 {match.wins}</div>
                </div>
                <div className="tm-text-label" style={{ color: 'var(--overlay-white-76)' }}>vs</div>
                <div style={{ textAlign: 'right' }}>
                  <div className="tm-text-caption" style={{ color: 'var(--overlay-white-68)' }}>상대팀</div>
                  <div className="tm-text-subhead" style={{ color: 'var(--static-white)' }}>{teamMatchOpponentLabel(mode)}</div>
                  <div className="tm-text-micro" style={{ color: 'var(--overlay-white-72)' }}>{teamMatchOpponentSub(mode)}</div>
                </div>
              </div>
              {/* P2: 완료 피드백 .tm-complete-check 마이크로인터랙션 */}
              {heroMessage ? <div className="tm-text-caption tm-complete-check" role="status" style={{ color: 'var(--overlay-white-86)', marginTop: 8 }}>{heroMessage}</div> : null}
            </div>
            <div className="tm-match-detail-body">
              {/* ── 그룹 1: 일정 · 장소 ── */}
              <div className="tm-info-group">
                <div className="tm-info-group-label">일정 · 장소</div>
                <InfoRow label="날짜와 시간" value={`${match.date} ${timeRange}`} />
                <InfoRow label="장소" value={match.venue} sub={match.address} />
                <InfoRow label="지역" value={match.region} />
              </div>
              {/* ── 그룹 2: 경기 조건 ── */}
              <div className="tm-info-group">
                <div className="tm-info-group-label">경기 조건</div>
                <InfoRow label="종목" value={match.sport} />
                <InfoRow label="실력등급" value={`${match.grade}등급`} />
                <InfoRow label="경기방식" value={match.format} />
                <InfoRow label="경기 스타일" value={match.style} />
                <InfoRow label="유니폼 색상" value={match.uniform} />
                <InfoRow label="성별 조건" value={match.gender} />
              </div>
              {/* ── 그룹 3: 비용 — 상대팀 부담금 수치 승격 ── */}
              <div className="tm-info-group">
                <div className="tm-info-group-label">비용</div>
                {/* 상대팀 부담금은 신청 결정의 핵심 — primary 위치로 승격(R-D1) */}
                {/* P1: 숫자(subhead/20px/700) : 단위(body/15px) = 2:1 비율 + tabular-nums */}
                <div className="tm-info-cost-hero">
                  <div className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>상대팀 부담금</div>
                  <div className="tm-info-cost-amount">
                    {match.opponentCost === 0 ? (
                      <>
                        <span className="tm-info-cost-value">무료</span>
                        <span className="tm-badge tm-badge-blue" style={{ marginLeft: 8 }}>무료초청</span>
                      </>
                    ) : (
                      <span className="tab-num" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
                        <span style={{ fontSize: 'var(--font-size-subhead)', fontWeight: 700, color: 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}>
                          {match.opponentCost.toLocaleString('ko-KR')}
                        </span>
                        <span style={{ fontSize: 'var(--font-size-body)', fontWeight: 500, color: 'var(--text-muted)' }}>원</span>
                      </span>
                    )}
                  </div>
                  {match.opponentCost === 0 ? (
                    <div className="tm-text-micro" style={{ marginTop: 2, color: 'var(--text-caption)' }}>실제 청구 없어요</div>
                  ) : null}
                </div>
                {/* P1: 총비용도 숫자:단위 2:1 */}
                <div className="tm-info-row">
                  <div className="tm-text-caption">총비용</div>
                  <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
                    <span className="tab-num" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 1 }}>
                      <span className="tm-text-label" style={{ fontVariantNumeric: 'tabular-nums' }}>{match.cost.toLocaleString('ko-KR')}</span>
                      <span className="tm-text-caption" style={{ fontWeight: 500, color: 'var(--text-muted)' }}>원</span>
                    </span>
                  </div>
                </div>
              </div>
              {/* P2: 능동형 카피 적용 */}
              {mode === 'pending' ? <StateCard tone="orange" title="신청을 접수했어요" body="홈팀이 검토를 마치면 알림으로 알려드릴게요." /> : null}
              {mode === 'approved' ? <StateCard tone="green" title="승인 완료" body="팀매치 참가가 확정됐어요. 경기 전 안내는 채팅에서 확인할 수 있어요." /> : null}
              {match.description ? (
                <Card pad={16} style={{ marginTop: 10 }}>
                  <div className="tm-text-body-lg">설명</div>
                  <div className="tm-text-body" style={{ marginTop: 8, lineHeight: 1.55, color: 'var(--text-muted)' }}>{match.description}</div>
                </Card>
              ) : null}
              {/* 홈팀 카드: 모바일은 왼쪽 컬럼 하단, 데스크톱은 우측 컬럼(tm-hide-desktop)으로 이동 */}
              <div className="tm-hide-desktop" style={{ marginTop: 14 }}>{hostTeamCard}</div>
              {mode === 'mine' ? (
                <Card pad={16} style={{ marginTop: 10 }}>
                  <div className="tm-text-body-lg">신청팀</div>
                  {match.applicantActionError ? (
                    <div className="tm-text-micro" role="alert" style={{ color: 'var(--red500)', marginTop: 6 }}>{match.applicantActionError}</div>
                  ) : null}
                  {model.hostActions?.length ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                      {model.hostActions.map((action) => (
                        <button
                          key={action.label}
                          className={`tm-btn tm-btn-sm ${hostActionClass(action.tone)}`}
                          type="button"
                          disabled={action.pending}
                          onClick={() => runHeroAction(action.onClick, `${action.label} 처리를 완료했어요.`)}
                        >
                          {action.pending ? '처리 중' : action.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                    {match.applicantTeams.map((team) => (
                      <div key={team.applicationId ?? team.name} style={{ border: '1px solid var(--grey100)', borderRadius: 12, padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div className="tm-text-label">{team.name}</div>
                            <div className="tm-text-micro" style={{ marginTop: 3, color: 'var(--text-caption)' }}>{team.meta}</div>
                          </div>
                          {/* P0/P1: 상태 색상+아이콘+텍스트 병행 (WCAG 1.4.1) */}
                          <span className={`tm-badge ${team.status === '승인 완료' ? 'tm-badge-green' : team.status === '미승인' ? 'tm-badge-red' : 'tm-badge-orange'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            {team.status === '승인 완료' ? (
                              <svg width="9" height="7" viewBox="0 0 9 7" aria-hidden="true" style={{ flexShrink: 0 }}><path d="M1 3.5L3.5 6L8 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
                            ) : team.status === '미승인' ? (
                              <svg width="7" height="7" viewBox="0 0 7 7" aria-hidden="true" style={{ flexShrink: 0 }}><path d="M1 1L6 6M6 1L1 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" /></svg>
                            ) : (
                              <svg width="7" height="7" viewBox="0 0 7 7" aria-hidden="true" style={{ flexShrink: 0 }}><circle cx="3.5" cy="3.5" r="3.5" fill="currentColor" /></svg>
                            )}
                            {team.status}
                          </span>
                        </div>
                        {(team.onApprove ?? team.onReject) ? (
                          // #4: 순서 [거절(좌/danger)] [승인(우/primary)] — 위험 행동을 왼쪽 ghost red, 확정 행동을 오른쪽 primary로
                          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                            {team.onReject ? (
                              <button
                                className="tm-btn tm-btn-sm tm-btn-danger"
                                type="button"
                                disabled={team.actionPending}
                                onClick={() => { void team.onReject?.(); }}
                                aria-label={`${team.name} 거절`}
                              >
                                거절
                              </button>
                            ) : null}
                            {team.onApprove ? (
                              <button
                                className="tm-btn tm-btn-sm tm-btn-primary"
                                type="button"
                                disabled={team.actionPending}
                                onClick={() => { void team.onApprove?.(); }}
                                aria-label={`${team.name} 승인`}
                              >
                                {team.actionPending ? '처리 중' : '승인'}
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </Card>
              ) : null}
            </div>
          </article>
        </div>

        {/* RIGHT: desktop sticky column — host-team compact + CTA card */}
        <div className="tm-team-match-detail-right tm-show-desktop">
          {/* 홈팀 카드: 데스크톱 우측 컬럼 상단 — 40% 보이드 채움(T1) */}
          <div className="tm-team-match-right-host">{hostTeamCard}</div>
          <div className="tm-team-match-cta-card">
            <div className="tm-team-match-cta-meta">
              <span className="tm-text-caption">{mode === 'mine' ? '내가 만든 팀매치' : '신청 상태'}</span>
              <span className="tm-text-label">{model.statusLabel ?? `${match.opponentCost.toLocaleString('ko-KR')}원`}</span>
            </div>
            <div className="tm-team-match-cta-actions">
              {ctaButtons}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile fixed CTA — hidden on desktop (desktop card above replaces it) */}
      <div className="tm-fixed-cta tm-team-match-mobile-cta">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <span className="tm-text-caption">{mode === 'mine' ? '내가 만든 팀매치' : '신청 상태'}</span>
          <span className="tm-text-label">{model.statusLabel ?? `${match.opponentCost.toLocaleString('ko-KR')}원`}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: showChat ? '120px 1fr' : '1fr', gap: 8 }}>
          {ctaButtons}
        </div>
      </div>
    </AppChrome>
  );
}

export function TeamMatchCreatePageView({ model }: { model: TeamMatchCreateViewModel }) {
  if (model.step === 'complete') return <TeamMatchComplete model={model} />;
  const edit = model.step === 'edit';
  const step = edit ? 3 : stepToNumber(model.step);
  const primaryLabel = model.form?.submitLabel ?? (edit ? '변경사항 저장' : model.step === 'confirm' ? '팀매치 만들기' : '다음');
  const primaryAction = model.step === 'confirm' || edit ? model.form?.onSubmit : model.form?.onNext;
  const secondaryAction = model.form?.onBack;
  return (
    <AppChrome title={edit ? '팀매치 수정' : '팀매치 만들기'} activeTab="matches" bottomNav={false} backHref={model.backHref ?? '/team-matches'}>
      <div className={`tm-create-shell ${edit ? 'tm-create-shell-edit' : ''}`}>
        <CreateProgress step={step} edit={edit} />
        {model.form?.error ? <StateCard tone="orange" title="저장할 수 없어요" body={model.form.error} /> : null}
        {model.form?.lockedReason ? <StateCard tone="orange" title="수정이 제한된 팀매치예요" body={model.form.lockedReason} /> : null}
        {model.step === 'team' ? <TeamStep model={model} /> : null}
        {model.step === 'sport' ? <SportStep model={model} /> : null}
        {model.step === 'info' || edit ? <InfoStep model={model} edit={edit} /> : null}
        {model.step === 'condition' ? <ConditionStep model={model} /> : null}
        {model.step === 'place-time' ? <PlaceTimeStep model={model} /> : null}
        {model.step === 'confirm' ? <ConfirmStep model={model} /> : null}
      </div>
      <div className="tm-fixed-cta tm-create-fixed-cta"><div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>{secondaryAction ? <button className="tm-btn tm-btn-lg tm-btn-neutral" type="button" onClick={secondaryAction}>{edit ? '변경 취소' : model.step === 'team' ? '취소' : '이전'}</button> : <Link className="tm-btn tm-btn-lg tm-btn-neutral" href={prevHref(model.step)}>{edit ? '변경 취소' : model.step === 'team' ? '취소' : '이전'}</Link>}{primaryAction ? <button className="tm-btn tm-btn-lg tm-btn-primary" type="button" disabled={model.form?.submitting || Boolean(model.form?.lockedReason)} onClick={primaryAction}>{model.form?.submitting ? '저장 중' : primaryLabel}</button> : <Link className="tm-btn tm-btn-lg tm-btn-primary" href={nextHref(model.step)}>{primaryLabel}</Link>}</div>{edit && model.form?.onCancel ? <button className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" type="button" style={{ marginTop: 8 }} disabled={model.form.submitting} onClick={model.form.onCancel}>팀매치 취소</button> : null}</div>
    </AppChrome>
  );
}

function TeamMatchSearchBar({ filterCount, search, query, filterHref = '/team-matches?filter=1' }: { filterCount: number; search?: TeamMatchListViewModel['search']; query: string; filterHref?: string }) {
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
        <div className={`tm-list-search-input tm-list-search-input-field ${search?.isOpen ? 'tm-list-search-input-active' : ''}`} aria-label="팀매치 검색">
          <input
            aria-label="팀매치 검색어"
            className="tm-list-search-field"
            onChange={(event) => search?.onChange(event.target.value)}
            onFocus={search?.onFocus}
            placeholder={search?.placeholder ?? '지역, 팀 이름, 경기조건 검색'}
            value={search?.value ?? query}
          />
          {search?.value ? (
            <button className="tm-list-search-clear" type="button" aria-label="검색어 지우기" onClick={search.onClear}>×</button>
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

function TeamMatchFilterSheet({ model }: { model: TeamMatchListViewModel }) {
  const sheet = model.filterSheet;
  if (!sheet) return null;

  return (
    <>
      <Link className="tm-filter-scrim" href={sheet.closeHref} aria-label="필터 닫기" />
      <DraggableFilterSheet closeHref={sheet.closeHref} ariaLabel="팀매치 필터">
        <div className="tm-filter-sheet-handle" />
        <div className="tm-filter-sheet-head">
          <div>
            <div className="tm-text-subhead">필터</div>
            <div className="tm-text-caption" style={{ marginTop: 2 }}>원하는 조건으로 정렬하거나 필터를 설정할 수 있어요</div>
          </div>
          <Link className="tm-btn tm-btn-sm tm-btn-ghost" href={sheet.resetHref} style={{ color: 'var(--text-caption)' }}>초기화</Link>
        </div>
        <div className="tm-filter-section">
          <div className="tm-text-label">정렬</div>
          <div className="tm-filter-chip-wrap">
            {sheet.sortOptions.map((option) => (
              <Link key={option.value} className={`tm-chip ${option.active ? 'tm-chip-active' : ''}`} href={option.href} aria-current={option.active ? 'page' : undefined}>{option.label}</Link>
            ))}
          </div>
        </div>
        <div className="tm-filter-section">
          <div className="tm-text-label">성별 조건</div>
          <div className="tm-filter-chip-wrap">
            {sheet.genderOptions.map((option) => (
              <Link key={option.value} className={`tm-chip ${option.active ? 'tm-chip-active' : ''}`} href={option.href} aria-current={option.active ? 'page' : undefined}>{option.label}</Link>
            ))}
          </div>
        </div>
        <div className="tm-filter-section">
          <div className="tm-text-label">레벨</div>
          <div className="tm-filter-chip-wrap">
            {sheet.levelOptions.map((option) => (
              <Link key={option.value} className={`tm-chip ${option.active ? 'tm-chip-active' : ''}`} href={option.href} aria-current={option.active ? 'page' : undefined}>{option.label}</Link>
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

function TeamMatchCard({ match }: { match: TeamMatchModel }) {
  /* #20: 상대팀 부담금은 핵심 결정요소 — tm-text-body-lg(17px/700)+blue로 격상.
   *      P1: 숫자:단위 2:1 비율 + tabular-nums. 매너·승 통계는 caption 유지. */
  const statusLabel = match.status === 'mine' ? '내 매치' : match.status === 'pending' ? '승인 대기' : match.status === 'approved' ? '승인 완료' : match.status === 'closed' ? '마감' : '모집 중';
  const statusClass = match.status === 'mine' ? 'tm-badge-green' : match.status === 'pending' ? 'tm-badge-orange' : match.status === 'approved' ? 'tm-badge-blue' : match.status === 'closed' ? 'tm-badge-grey' : 'tm-badge-blue';
  return (
    <Link className="tm-team-match-card tm-pressable" href={`/team-matches/${match.id}`}>
      <div className="tm-team-match-vs">
        <div>
          <div className="tm-text-caption">홈팀</div>
          <div className="tm-text-subhead">{match.hostTeam}</div>
        </div>
        <span aria-hidden="true">vs</span>
        <div style={{ textAlign: 'right' }}>
          <div className="tm-text-caption">상대팀</div>
          {/* P0/P1: 상태를 색상+아이콘+텍스트 병행 (WCAG 1.4.1) */}
          <div className={`tm-badge ${statusClass}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <svg width="7" height="7" viewBox="0 0 7 7" aria-hidden="true" style={{ flexShrink: 0 }}><circle cx="3.5" cy="3.5" r="3.5" fill="currentColor" /></svg>
            {statusLabel}
          </div>
        </div>
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span className="tm-badge tm-badge-blue">{match.sport}</span>
          <span className="tm-badge tm-badge-grey">{match.grade}등급</span>
          <span className="tm-badge tm-badge-grey">{match.format}</span>
          <span className="tm-badge tm-badge-grey">{match.gender}</span>
          {match.opponentCost === 0 ? <span className="tm-badge tm-badge-blue">무료초청</span> : null}
        </div>
        <div className="tm-text-body-lg" style={{ marginTop: 10 }}>{match.title}</div>
        <div className="tm-text-caption" style={{ marginTop: 5 }}>{match.date} {match.time} · {match.venue}</div>
        <div className="tm-match-list-footer">
          <span className="tm-text-caption">매너 <span style={{ fontVariantNumeric: 'tabular-nums' }}>{match.manner}</span> · 승 <span style={{ fontVariantNumeric: 'tabular-nums' }}>{match.wins}</span></span>
          {/* P1: 숫자는 body-lg(17px/700), 단위 "원"은 caption(12px) — 2:1 비율 */}
          {match.opponentCost === 0 ? (
            <span className="tm-text-body-lg tab-num" style={{ color: 'var(--blue500)' }}>무료</span>
          ) : (
            <span className="tab-num" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 1 }}>
              <span style={{ fontSize: 'var(--font-size-body-lg)', fontWeight: 700, color: 'var(--blue500)', fontVariantNumeric: 'tabular-nums' }}>{match.opponentCost.toLocaleString('ko-KR')}</span>
              <span style={{ fontSize: 'var(--font-size-body-sm)', fontWeight: 500, color: 'var(--blue500)' }}>원</span>
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function TeamStep({ model }: { model: TeamMatchCreateViewModel }) {
  const hasTeams = model.teams.length > 0;
  const hasCreatableTeams = model.teams.some((team) => !team.disabled);
  return (
    <div>
      <h1 className="tm-text-heading">어떤 팀의 매치인가요?</h1>
      <p className="tm-text-body" style={{ marginTop: 8 }}>선택한 팀의 종목·등급·권한 정보를 기반으로 팀매치를 만들어요.</p>
      {model.isLoadingTeams ? (
        <div style={{ display: 'grid', gap: 10, marginTop: 20 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="tm-review-skeleton" style={{ height: 72 }} aria-hidden="true" />
          ))}
        </div>
      ) : !hasTeams ? (
        <EmptyState title="팀매치를 만들 수 있는 팀이 없어요" sub="소속된 팀이 없거나 팀 정보를 불러오지 못했어요." />
      ) : (
        <div style={{ display: 'grid', gap: 10, marginTop: 20 }}>
          {model.teams.map((team) => (
            <button
              key={team.name}
              className={`tm-card ${team.disabled ? '' : 'tm-pressable'} ${team.selected ? 'tm-create-selected' : ''}`}
              style={{ padding: 16, textAlign: 'left', opacity: team.disabled ? 0.55 : 1, cursor: team.disabled ? 'default' : 'pointer' }}
              type="button"
              aria-pressed={team.selected}
              disabled={team.disabled}
              onClick={() => { if (!team.disabled) model.form?.onSelectTeam(team.name); }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div className="tm-text-body-lg">{team.name}</div>
                {team.disabled ? (
                  <span className="tm-badge tm-badge-grey" style={{ flexShrink: 0 }}>매치 생성 권한 없음</span>
                ) : null}
              </div>
              <div className="tm-text-caption" style={{ marginTop: 4 }}>{team.sport} · {team.members}명 · {team.role}</div>
            </button>
          ))}
        </div>
      )}
      {/* 팀이 없는 경우 EmptyState만 표시하고 권한 카드는 생략한다.
          팀은 있으나 권한이 없는 경우에만 권한 카드를 표시한다. */}
      {!model.isLoadingTeams && hasTeams ? (() => {
        const blocked = !hasCreatableTeams;
        return (
          <Card pad={14} style={{ marginTop: 14, background: blocked ? 'var(--orange50)' : 'var(--grey50)' }}>
            <div className="tm-text-label" style={blocked ? { color: 'var(--orange500)' } : undefined}>권한 기준</div>
            <div className="tm-text-caption" style={{ marginTop: 6 }}>
              {blocked
                ? '팀장이거나 매치 생성 권한이 있어야 다음으로 진행할 수 있어요. 해당 권한이 있는 팀으로 다시 시도해 주세요.'
                : '팀장이거나 매치 생성 권한이 있는 관리자만 다음으로 진행할 수 있어요.'}
            </div>
          </Card>
        );
      })() : null}
    </div>
  );
}

function SportStep({ model }: { model: TeamMatchCreateViewModel }) {
  return <div><h1 className="tm-text-heading">어떤 종목인가요?</h1><p className="tm-text-body" style={{ marginTop: 8 }}>상대 팀과 함께 진행할 종목을 선택해 주세요.</p><div className="tm-create-sport-grid">{model.sports.map((sport) => <button key={sport} className={`tm-card tm-pressable ${sport === model.selectedSport ? 'tm-create-selected' : ''}`} style={{ padding: 16, textAlign: 'left' }} type="button" aria-pressed={sport === model.selectedSport} onClick={() => model.form?.onSelectSport(sport)}><div className="tm-text-body-lg">{sport}</div><div className="tm-text-caption" style={{ marginTop: 5 }}>{sport === model.selectedSport ? '선택됨' : '탭해서 선택'}</div></button>)}</div></div>;
}

function InfoStep({ model, edit }: { model: TeamMatchCreateViewModel; edit: boolean }) {
  const d = model.draft;
  return <div><h1 className="tm-text-heading">매치 정보</h1><CreateField label="매치 제목" value={d.title} placeholder="예: 토요일 저녁 풋살 상대팀 구합니다" onChange={(value) => model.form?.onFieldChange('title', value)} /><CreateField label="설명" value={d.description} placeholder="예: 친선 위주로 즐겁게 경기할 팀을 찾고 있어요." multiline onChange={(value) => model.form?.onFieldChange('description', value)} /><ImageUploadField image={d.imageUrl} onChange={(value) => model.form?.onFieldChange('imageUrl', value)} onUpload={model.form?.uploadImage} />{edit ? <><CreateField label="실력등급" value={d.grade} placeholder="예: B, 중급, 생활체육" onChange={(value) => model.form?.onFieldChange('grade', value)} /><CreateField label="경기방식" value={d.format} placeholder="예: 5:5 풋살, 11:11 축구" onChange={(value) => model.form?.onFieldChange('format', value)} /><CreateField label="경기 스타일" value={d.style} placeholder="예: 친선 · 매너 중시" onChange={(value) => model.form?.onFieldChange('style', value)} /><CreateField label="유니폼 색상" value={d.uniform} placeholder="예: 흰색 상의" onChange={(value) => model.form?.onFieldChange('uniform', value)} /><GenderRuleSelector value={d.gender} onChange={(value) => model.form?.onFieldChange('gender', value)} /><div className="tm-create-two-col"><CreateField label="총비용" value={`${d.cost}`} suffix="원" type="number" onChange={(value) => model.form?.onFieldChange('cost', Number(value))} /><CreateField label="상대팀 부담금" value={`${d.opponentCost}`} suffix="원" type="number" onChange={(value) => model.form?.onFieldChange('opponentCost', Number(value))} /></div><StateCard tone="orange" title="수정 중" body="팀장 또는 관리자만 저장할 수 있어요. 저장에 실패해도 입력한 내용은 유지돼요." /></> : null}</div>;
}

function ConditionStep({ model }: { model: TeamMatchCreateViewModel }) {
  const d = model.draft;
  return <div><h1 className="tm-text-heading">경기조건</h1><p className="tm-text-body" style={{ marginTop: 8 }}>상대팀이 신청 전에 확인할 등급, 방식, 비용 조건을 입력해 주세요.</p><CreateField label="실력등급" value={d.grade} placeholder="예: B, 중급, 생활체육" onChange={(value) => model.form?.onFieldChange('grade', value)} /><CreateField label="경기방식" value={d.format} placeholder="예: 5:5 풋살, 11:11 축구" onChange={(value) => model.form?.onFieldChange('format', value)} /><CreateField label="경기 스타일" value={d.style} placeholder="예: 친선 · 매너 중시" onChange={(value) => model.form?.onFieldChange('style', value)} /><CreateField label="유니폼 색상" value={d.uniform} placeholder="예: 흰색 상의" onChange={(value) => model.form?.onFieldChange('uniform', value)} /><GenderRuleSelector value={d.gender} onChange={(value) => model.form?.onFieldChange('gender', value)} /><div className="tm-create-two-col"><CreateField label="총비용" value={`${d.cost}`} suffix="원" type="number" onChange={(value) => model.form?.onFieldChange('cost', Number(value))} /><CreateField label="상대팀 부담금" value={`${d.opponentCost}`} suffix="원" type="number" onChange={(value) => model.form?.onFieldChange('opponentCost', Number(value))} /></div><Card pad={14} style={{ marginTop: 14, background: 'var(--grey50)' }}><div className="tm-text-label">무료초청 표시</div><div className="tm-text-caption" style={{ marginTop: 5 }}>상대팀 부담금이 0원이면 목록과 상세에 '무료초청' 배지가 표시돼요.</div></Card></div>;
}

function PlaceTimeStep({ model }: { model: TeamMatchCreateViewModel }) {
  const d = model.draft;
  return <div><h1 className="tm-text-heading">장소와 시간</h1><RegionSelect value={model.form?.regionId ?? ''} regions={model.form?.regions ?? []} onChange={model.form?.onRegionChange} /><CreateField label="상세 주소" value={d.venue} placeholder="예: 잠실 풋살파크 A구장, 3층 2번 코트" onChange={(value) => model.form?.onFieldChange('venue', value)} /><CreateField label="날짜" value={d.date} type="date" onChange={(value) => model.form?.onFieldChange('date', value)} /><div className="tm-create-two-col"><CreateField label="시작 시간" value={d.startTime} type="time" onChange={(value) => model.form?.onFieldChange('startTime', value)} /><CreateField label="종료 시간" value={d.endTime} type="time" onChange={(value) => model.form?.onFieldChange('endTime', value)} /></div></div>;
}

function RegionSelect({ value, regions, onChange }: { value: string; regions: Array<{ id: string; name: string; shortName?: string; parentName?: string }>; onChange?: (regionId: string) => void }) {
  const selectedRegion = regions.find((region) => region.id === value);
  const [selectedParent, setSelectedParent] = useState(selectedRegion?.parentName ?? '');
  const parentNames = Array.from(new Set(regions.map((region) => region.parentName).filter((name): name is string => Boolean(name))));
  const districts = selectedParent ? regions.filter((region) => region.parentName === selectedParent) : [];

  useEffect(() => {
    if (selectedRegion?.parentName) setSelectedParent(selectedRegion.parentName);
  }, [selectedRegion?.parentName]);

  if (parentNames.length === 0) {
    return <label className="tm-create-field"><div className="tm-text-label">지역</div><select className="tm-create-input tm-create-select-control" value={value} onChange={(event) => onChange?.(event.target.value)}><option value="">시/군/구 선택</option>{regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}</select><div className="tm-text-caption" style={{ marginTop: 6 }}>지역은 검색·추천 기준으로 사용돼요. 상세주소는 아래에 직접 입력해 주세요.</div></label>;
  }

  return (
    <div className="tm-create-field">
      <div className="tm-text-label">지역</div>
      <div className="tm-create-two-col">
        <select
          className="tm-create-input tm-create-select-control"
          value={selectedParent}
          aria-label="시/도 선택"
          onChange={(event) => {
            setSelectedParent(event.target.value);
            onChange?.('');
          }}
        >
          <option value="">시/도 선택</option>
          {parentNames.map((parentName) => <option key={parentName} value={parentName}>{parentName}</option>)}
        </select>
        <select
          className="tm-create-input tm-create-select-control"
          value={value}
          aria-label="시/군/구 선택"
          disabled={!selectedParent}
          onChange={(event) => onChange?.(event.target.value)}
        >
          <option value="">시/군/구 선택</option>
          {districts.map((region) => <option key={region.id} value={region.id}>{region.shortName ?? region.name}</option>)}
        </select>
      </div>
      <div className="tm-text-caption" style={{ marginTop: 6 }}>지역은 검색·추천 기준으로 사용돼요. 상세주소는 아래에 직접 입력해 주세요.</div>
    </div>
  );
}

function ConfirmStep({ model }: { model: TeamMatchCreateViewModel }) {
  const d = model.draft;
  const regionName = model.form?.regions.find((region) => region.id === model.form?.regionId)?.name ?? '지역 선택 필요';
  // 상대팀 부담금 0원일 때만 '무료초청' 뱃지 표시 (목록·상세와 동일 조건 #20)
  const isFreeInvite = d.opponentCost === 0;
  return <div><h1 className="tm-text-heading">입력한 내용을 확인해 주세요</h1><Card pad={0} style={{ marginTop: 16, overflow: 'hidden' }}><div className="tm-team-create-preview" style={{ backgroundImage: cssUrl(d.imageUrl) }}><div className="tm-text-subhead" style={{ color: 'var(--static-white)' }}>{model.selectedTeam} vs 상대팀</div></div><div style={{ padding: 16 }}><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><span className="tm-badge tm-badge-blue">{model.selectedSport}</span><span className="tm-badge tm-badge-grey">{d.grade}</span><span className="tm-badge tm-badge-grey">{d.format}</span><span className="tm-badge tm-badge-grey">{d.gender}</span>{isFreeInvite ? <span className="tm-badge tm-badge-blue">무료초청</span> : null}</div><div className="tm-text-subhead" style={{ marginTop: 10 }}>{d.title}</div><div className="tm-text-caption" style={{ marginTop: 6 }}>{d.description}</div></div></Card><Card pad={16} style={{ marginTop: 12 }}><InfoRow label="지역" value={regionName} sub="검색과 추천에 사용돼요" /><InfoRow label="경기조건" value={`${d.grade} · ${d.format} · ${d.style}`} sub={`${d.uniform} · ${d.gender}`} /><InfoRow label="비용" value={`총 ${d.cost.toLocaleString('ko-KR')}원 · 상대팀 ${d.opponentCost.toLocaleString('ko-KR')}원`} /><InfoRow label="일시" value={`${d.date} ${d.startTime}-${d.endTime}`} /><InfoRow label="상세 주소" value={d.venue} /></Card></div>;
}

function TeamMatchComplete({ model }: { model: TeamMatchCreateViewModel }) {
  const [shareMsg, setShareMsg] = useState('');

  const handleShare = async () => {
    const title = model.draft.title || '팀매치';
    const url = typeof window !== 'undefined' ? new URL('/team-matches', window.location.origin).toString() : '/team-matches';
    // navigator.share 지원 환경(모바일)에서는 네이티브 공유 시트 사용
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // 취소(AbortError) 또는 미지원 → 클립보드 fallback
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareMsg('링크를 복사했어요');
    } catch {
      setShareMsg('링크 복사에 실패했어요');
    }
    window.setTimeout(() => setShareMsg(''), 1800);
  };

  return (
    <AppChrome title="팀매치 만들기 완료" activeTab="matches" bottomNav={false} backHref="/team-matches">
      <div className="tm-create-shell">
        {/* P2: 완료 지점에 .tm-complete-check 마이크로인터랙션 (globals.css 키프레임, reduced-motion 안전) */}
        <div className="tm-complete-check">
          <EmptyState title="팀매치를 만들었어요" sub="팀원들에게 먼저 공유해서 참가 가능 여부와 경기 준비를 함께 확인해 보세요." />
        </div>
        <Card pad={16} style={{ marginTop: 22, background: 'var(--blue50)' }}>
          <div className="tm-text-body-lg">{model.selectedTeam} 팀매치 공유</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>팀원들에게 팀매치 링크와 경기조건을 공유해요</div>
        </Card>
        {shareMsg ? <div className="tm-text-caption tm-complete-check" role="status" style={{ marginTop: 12, textAlign: 'center', color: 'var(--text-caption)' }}>{shareMsg}</div> : null}
      </div>
      <div className="tm-fixed-cta tm-create-fixed-cta">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
          <Link className="tm-btn tm-btn-lg tm-btn-neutral" href="/team-matches">목록으로</Link>
          <button className="tm-btn tm-btn-lg tm-btn-primary" type="button" onClick={() => { void handleShare(); }}>공유하기</button>
        </div>
      </div>
    </AppChrome>
  );
}

function hostActionClass(tone: NonNullable<TeamMatchDetailViewModel['hostActions']>[number]['tone']) {
  if (tone === 'primary') return 'tm-btn-primary';
  if (tone === 'danger') return 'tm-btn-danger';
  return 'tm-btn-neutral';
}

function InfoRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="tm-info-row"><div className="tm-text-caption">{label}</div><div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}><div className="tm-text-label">{value}</div>{sub ? <div className="tm-text-micro" style={{ marginTop: 3, color: 'var(--text-caption)' }}>{sub}</div> : null}</div></div>;
}

function StateCard({ tone, title, body }: { tone: 'orange' | 'green'; title: string; body: string }) {
  /* 배경색은 디자인 토큰 사용 — raw rgba 금지(v1-coding-patterns §2) */
  return <Card pad={14} style={{ marginTop: 14, background: tone === 'green' ? 'var(--tint-green)' : 'var(--tint-orange)' }}><div className="tm-text-label" style={{ color: tone === 'green' ? 'var(--green500)' : 'var(--orange500)' }}>{title}</div><div className="tm-text-caption" style={{ marginTop: 5 }}>{body}</div></Card>;
}

function ImageUploadField({ image, onChange, onUpload }: { image: string; onChange?: (value: string) => void; onUpload?: (file: File) => Promise<string> }) {
  const [fileName, setFileName] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setFileName(file.name);
    setUploadError(null);

    if (!onUpload) return;

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
  };

  return (
    <Card pad={0} style={{ marginTop: 14, overflow: 'hidden' }}>
      <div className="tm-create-image-preview" style={{ backgroundImage: cssUrl(image) }}>
        <span className="tm-badge tm-badge-grey">배경 이미지</span>
      </div>
      <div style={{ padding: 14 }}>
        <label className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" style={{ opacity: uploading ? 0.6 : 1 }}>
          {uploading ? '업로드 중...' : fileName || image ? '이미지 변경' : '배경 이미지 선택'}
          <input className="sr-only" type="file" accept="image/*" disabled={uploading} onChange={handleChange} />
        </label>
        <div className="tm-text-caption" style={{ marginTop: 8 }}>목록과 상세 화면의 상단 배경으로 보여요.</div>
        {uploadError ? <div className="tm-text-caption" role="alert" style={{ marginTop: 8, color: 'var(--orange500)' }}>{uploadError}</div> : null}
        {(fileName || image) && !uploading ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <span className="tm-text-caption" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName || '선택한 이미지'}</span>
            <button className="tm-btn tm-btn-sm tm-btn-ghost" type="button" onClick={() => { setFileName(''); onChange?.(''); }}>제거</button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function CreateProgress({ step, edit }: { step: number; edit: boolean }) {
  const stepLabel = ['팀 선택', '종목 선택', '매치 정보', '경기조건', '장소와 시간', '작성 내용 확인'][step - 1];
  return (
    <div className="tm-create-progress">
      {/* edit 모드: 배지 + 안내 텍스트를 space-between으로 양쪽 정렬.
          일반 단계: 배지 + 단계명을 flex-start gap으로 나란히 정렬 — 레이아웃 패턴 §3 */}
      <div style={{ display: 'flex', justifyContent: edit ? 'space-between' : 'flex-start', alignItems: 'center', gap: 10 }}>
        <span className={`tm-badge ${edit ? 'tm-badge-orange' : 'tm-badge-blue'}`}>{edit ? '수정' : `${step}/6단계`}</span>
        <span className="tm-text-caption">{edit ? '변경한 항목만 저장돼요' : stepLabel}</span>
      </div>
      {/* 단계 진행 바: role="progressbar"로 스크린리더가 진행 상태를 읽을 수 있도록 함 */}
      {!edit ? (
        <div
          className="tm-create-bars tm-create-bars-6"
          role="progressbar"
          aria-valuenow={step}
          aria-valuemin={1}
          aria-valuemax={6}
          aria-label={`팀매치 만들기 진행 상태: ${step}단계 중 6단계 (${stepLabel})`}
        >
          {[1, 2, 3, 4, 5, 6].map((item) => <span key={item} data-active={item <= step} aria-hidden="true" />)}
        </div>
      ) : null}
    </div>
  );
}

function CreateField({ label, value, placeholder, suffix, multiline, type = 'text', onChange }: { label: string; value?: string; placeholder?: string; suffix?: string; multiline?: boolean; type?: string; onChange?: (value: string) => void }) {
  return <label className="tm-create-field"><div className="tm-text-label">{label}</div><div className={`tm-create-input ${multiline ? 'tm-create-input-multiline' : ''}`}>{onChange ? (multiline ? <textarea className="tm-create-native-input" value={value ?? ''} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /> : <input className="tm-create-native-input" type={type} value={value ?? ''} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />) : <span className="tm-text-body" style={{ color: value ? 'var(--text-strong)' : 'var(--text-caption)' }}>{value || placeholder || '입력'}</span>}{suffix ? <span className="tm-text-caption">{suffix}</span> : null}</div></label>;
}

function GenderRuleSelector({ value, onChange }: { value: string; onChange?: (value: string) => void }) {
  return <div className="tm-create-field"><div className="tm-text-label">성별 조건</div><div className="tm-team-form-chip-row">{['성별 무관', '남', '여'].map((option) => <button key={option} className={`tm-chip ${value === option ? 'tm-chip-active' : ''}`} type="button" aria-pressed={value === option} onClick={() => onChange?.(option)}>{option}</button>)}</div></div>;
}

function stepToNumber(step: TeamMatchCreateViewModel['step']) {
  if (step === 'team') return 1;
  if (step === 'sport') return 2;
  if (step === 'info') return 3;
  if (step === 'condition') return 4;
  if (step === 'place-time') return 5;
  return 6;
}

function nextHref(step: TeamMatchCreateViewModel['step']) {
  if (step === 'team') return '/team-matches/new/sport';
  if (step === 'sport') return '/team-matches/new/info';
  if (step === 'info') return '/team-matches/new/condition';
  if (step === 'condition') return '/team-matches/new/place-time';
  if (step === 'place-time') return '/team-matches/new/confirm';
  if (step === 'confirm') return '/team-matches/new/complete';
  return '/team-matches';
}

/* prevHref: "이전" 버튼의 Link fallback — model.form?.onBack 이 없는 정적 렌더에서 사용.
 * 단순히 team 아닌 경우를 모두 /new/team 으로 보내면 중간 단계에서 step 1 로 뛰어넘는
 * 버그가 발생한다(form.onBack 이 항상 있는 client 코드에서도 이 fallback 이 노출될 수 있음). */
function prevHref(step: TeamMatchCreateViewModel['step']) {
  if (step === 'sport') return '/team-matches/new/team';
  if (step === 'info') return '/team-matches/new/sport';
  if (step === 'condition') return '/team-matches/new/info';
  if (step === 'place-time') return '/team-matches/new/condition';
  if (step === 'confirm') return '/team-matches/new/place-time';
  return '/team-matches';
}

function trustStateLabel(trustState: string) {
  if (trustState === 'verified') return '인증팀';
  if (trustState === 'gold') return '골드';
  if (trustState === 'silver') return '실버';
  if (trustState === 'bronze') return '브론즈';
  return trustState;
}
