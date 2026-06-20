'use client';

import Link from 'next/link';
import type { ChangeEvent, PointerEvent, ReactNode } from 'react';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppChrome } from '@/components/v1-ui/shell';
import { Card, EmptyState, ListItem } from '@/components/v1-ui/primitives';
import { BellIcon, ChevronLeftIcon, FilterIcon, PlusIcon, SearchIcon, ShareIcon } from '@/components/v1-ui/icons';
import { cssUrl } from '@/lib/assets';
import { MatchTypeSegment } from '@/components/v1-ui/match-type-segment';
import type {
  MatchCardModel,
  MatchCreateViewModel,
  MatchDetailViewModel,
  MatchListViewModel,
  MatchStateViewModel,
} from './matches.types';

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
          <div className="tm-text-caption tab-num">{model.summary.count}개 · 오늘 {model.summary.today} · 모집중 {model.summary.urgent}</div>
        </div>
        <div className="tm-match-card-stack">
          {model.matches.length ? (
            model.matches.map((match, index) => <MatchCardItem key={match.id} match={match} index={index} />)
          ) : (
            <EmptyState title="조건에 맞는 매치가 없어요" sub="다른 종목을 선택하거나 전체 매치로 돌아가면 모집 중인 매치를 볼 수 있어요." />
          )}
        </div>
      </div>
      {model.filterSheet?.open ? <MatchFilterSheet model={model} /> : null}
    </AppChrome>
  );
}

export function MatchStatePageView({ model }: { model: MatchStateViewModel }) {
  if (model.state === 'filter') return <MatchFilterPageView model={model} />;
  if (model.state === 'participants') return <MatchParticipantsPageView />;

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

function MatchFilterPageView({ model }: { model: MatchStateViewModel }) {
  return (
    <AppChrome title="필터" activeTab="matches" bottomNav={false} backHref="/matches">
      {/* Desktop page head */}
      <div className="tm-desktop-page-head tm-show-desktop">
        <Link className="tm-desktop-back" href="/matches" aria-label="매치 목록으로 돌아가기">
          <ChevronLeftIcon size={20} strokeWidth={2.2} aria-hidden="true" />
        </Link>
        <h1 className="tm-text-heading" style={{ margin: 0 }}>필터</h1>
      </div>
      <div className="tm-create-shell tm-match-create-shell">
        <section>
          <h2 className="tm-text-heading">매치 조건</h2>
          <p className="tm-text-body" style={{ marginTop: 8, lineHeight: 1.55 }}>{model.description}</p>
        </section>
        <Card pad={16}>
          <div className="tm-text-body-lg">종목</div>
          <div className="tm-sport-chip-row" style={{ marginTop: 12 }}>
            {model.sports.map((sport) => <button key={sport.label} className={`tm-chip ${sport.active ? 'tm-chip-active' : ''}`} type="button">{sport.label}</button>)}
          </div>
        </Card>
        <Card pad={16}>
          <div className="tm-text-body-lg">현재 적용된 조건</div>
          <div className="tm-my-list-stack" style={{ marginTop: 12 }}>
            <ListItem title="지역" sub="서울 전체" trailing="변경 가능" />
            <ListItem title="날짜" sub="이번 주" trailing="변경 가능" />
            <ListItem title="모집 상태" sub="모집중 우선" trailing="2개" />
          </div>
        </Card>
      </div>
      <div className="tm-fixed-cta">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
          <Link className="tm-btn tm-btn-lg tm-btn-neutral" href="/matches">초기화</Link>
          <Link className="tm-btn tm-btn-lg tm-btn-primary" href="/matches">{model.matches.length}개 결과 보기</Link>
        </div>
      </div>
    </AppChrome>
  );
}

function MatchParticipantsPageView() {
  const participants = [
    { name: '김정민', meta: '호스트 · 매너 4.9', status: '승인완료' },
    { name: '박서준', meta: '초보 · 최근 3경기', status: '승인완료' },
    { name: '이하나', meta: '중수 · 빠른 응답', status: '승인중' },
  ];

  return (
    <AppChrome title="참가자" activeTab="matches" bottomNav={false} backHref="/matches/match-1">
      {/* Desktop page head */}
      <div className="tm-desktop-page-head tm-show-desktop">
        <Link className="tm-desktop-back" href="/matches/match-1" aria-label="매치 상세로 돌아가기">
          <ChevronLeftIcon size={20} strokeWidth={2.2} aria-hidden="true" />
        </Link>
        <h1 className="tm-text-heading" style={{ margin: 0 }}>참가자</h1>
      </div>
      <div className="tm-match-list">
        <Card pad={16} style={{ background: 'var(--blue50)', borderColor: 'rgba(49,130,246,.24)' }}>
          <div className="tm-text-body-lg">주말 풋살 한판!</div>
          <div className="tm-text-caption" style={{ marginTop: 5 }}>승인 완료 2명 · 승인중 1명 · 정원 10명</div>
        </Card>
        <div className="tm-my-list-stack" style={{ marginTop: 14 }}>
          {participants.map((person) => <ListItem key={person.name} title={person.name} sub={person.meta} trailing={person.status} />)}
        </div>
        <Card pad={14} style={{ marginTop: 16, background: 'var(--grey50)' }}>
          <div className="tm-text-label">참가자 승인은 매치 상세 페이지에서 관리할 수 있어요</div>
          <div className="tm-text-caption" style={{ marginTop: 5 }}>참가자 승인 상태와 모집 정원을 한곳에서 확인할 수 있어요.</div>
        </Card>
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
  if (status === 'full') return 'tm-badge-grey';
  return 'tm-badge-grey';
}

function matchStatusBadgeLabel(mode: MatchDetailViewModel['mode'], status: MatchDetailViewModel['match']['status']) {
  if (mode === 'pending') return '승인중';
  if (mode === 'approved') return '승인완료';
  if (mode === 'mine') return '내 매치';
  if (status === 'full') return '모집 완료';
  return '모집 중';
}

export function MatchDetailPageView({ model }: { model: MatchDetailViewModel }) {
  const { match, mode } = model;
  const [heroMessage, setHeroMessage] = useState('');
  const locked = mode === 'pending' || mode === 'approved' || match.status === 'full';
  const canRunAction = Boolean(model.onApply);
  const cta = model.applyLabel ?? (mode === 'mine' ? '매치 관리' : mode === 'approved' ? '승인 완료' : mode === 'pending' ? '신청 취소' : match.status === 'full' ? '신청 마감' : '참가 신청');
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
        setHeroMessage('일시적인 오류가 생겼어요. 잠시 후 다시 시도해 주세요.');
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
                <button className="tm-btn tm-btn-icon tm-btn-ghost tm-hero-button" type="button" aria-label="알림 목록" onClick={model.onNotify}><BellIcon size={20} /></button>
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                <span className="tm-badge tm-badge-blue">{match.sport}</span>
                <span className="tm-badge tm-badge-grey">{match.level}</span>
                <span className="tm-badge tm-badge-grey">{match.gender}</span>
                <span className={`tm-badge ${matchStatusBadgeClass(mode, match.status)}`}>{matchStatusBadgeLabel(mode, match.status)}</span>
              </div>
              <h2 className="tm-match-detail-title">{match.title}</h2>
              <div className="tm-text-caption" style={{ color: 'rgba(255,255,255,.76)', marginTop: 6 }}>{match.host} 호스트 · {match.deadline}</div>
              {heroMessage ? <div className="tm-text-caption" role="status" style={{ color: 'rgba(255,255,255,.86)', marginTop: 8 }}>{heroMessage}</div> : null}
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
            <InfoRow label="인원" value={`${match.current}/${match.capacity}명`} sub={`${Math.max(match.capacity - match.current, 0)}자리 남음 (호스트 1명 포함)`} />
            <InfoRow label="레벨" value={match.level} />
            <InfoRow label="성별 조건" value={match.gender} />
            {mode === 'pending' ? <StateCard tone="orange" title="승인 대기" body="호스트가 신청을 확인하고 있어요." /> : null}
            {mode === 'approved' ? <StateCard tone="green" title="승인 완료" body="매치 참가가 확정되었어요. 경기 당일 늦지 않게 방문해 주세요." /> : null}
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
                <button className="tm-btn tm-btn-lg tm-btn-neutral" type="button" disabled={!model.onChat || model.chatPending} onClick={model.onChat}>
                  {model.chatPending ? '연결 중' : model.chatLabel ?? '채팅'}
                </button>
              ) : null}
              {mode === 'mine' ? (
                <Link className="tm-btn tm-btn-lg tm-btn-primary" href={match.manageHref ?? `/matches/${match.id}/edit`}>{cta}</Link>
              ) : (
                <button className={`tm-btn tm-btn-lg ${ctaTone}`} type="button" disabled={!canRunAction || model.applyPending} onClick={() => runHeroAction(model.onApply, mode === 'pending' ? '신청이 취소되었어요.' : '신청이 완료되었어요.')}>
                  {model.applyPending ? '처리 중' : cta}
                </button>
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
          <InfoRow label="인원" value={`${match.current}/${match.capacity}명`} sub={`${Math.max(match.capacity - match.current, 0)}자리 남음 (호스트 1명 포함)`} />
          <InfoRow label="레벨" value={match.level} />
          <InfoRow label="성별 조건" value={match.gender} />
          {mode === 'pending' ? <StateCard tone="orange" title="승인 대기" body="호스트가 신청을 확인하고 있어요." /> : null}
          {mode === 'approved' ? <StateCard tone="green" title="승인 완료" body="매치 참가가 확정되었어요. 경기 당일 늦지 않게 방문해 주세요." /> : null}
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
            <button className="tm-btn tm-btn-lg tm-btn-neutral" type="button" disabled={!model.onChat || model.chatPending} onClick={model.onChat}>
              {model.chatPending ? '연결 중' : model.chatLabel ?? '채팅'}
            </button>
          ) : null}
          {mode === 'mine' ? (
            <Link className="tm-btn tm-btn-lg tm-btn-primary" href={match.manageHref ?? `/matches/${match.id}/edit`}>{cta}</Link>
          ) : (
            <button className={`tm-btn tm-btn-lg ${ctaTone}`} type="button" disabled={!canRunAction || model.applyPending} onClick={() => runHeroAction(model.onApply, mode === 'pending' ? '신청이 취소되었어요.' : '신청이 완료되었어요.')}>
              {model.applyPending ? '처리 중' : cta}
            </button>
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
    <AppChrome title={edit ? '매치 수정' : '매치 만들기'} activeTab="matches" bottomNav={false} backHref={edit ? '/matches/match-1' : '/matches'}>
      {/* Desktop page head */}
      <div className="tm-desktop-page-head tm-show-desktop">
        <Link className="tm-desktop-back" href={edit ? '/matches/match-1' : '/matches'} aria-label={edit ? '매치 상세로 돌아가기' : '매치 목록으로 돌아가기'}>
          <ChevronLeftIcon size={20} strokeWidth={2.2} aria-hidden="true" />
        </Link>
        <h1 className="tm-text-heading" style={{ margin: 0 }}>{edit ? '매치 수정' : '매치 만들기'}</h1>
      </div>
      <div className="tm-create-shell tm-match-create-shell">
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
              <Link key={option.value} className={`tm-chip ${option.active ? 'tm-chip-active' : ''}`} href={option.href}>{option.label}</Link>
            ))}
          </div>
        </div>
        <div className="tm-filter-section">
          <div className="tm-text-label">성별 조건</div>
          <div className="tm-filter-chip-wrap">
            {sheet.genderOptions.map((option) => (
              <Link key={option.value} className={`tm-chip ${option.active ? 'tm-chip-active' : ''}`} href={option.href}>{option.label}</Link>
            ))}
          </div>
        </div>
        <div className="tm-filter-section">
          <div className="tm-text-label">레벨</div>
          <div className="tm-filter-chip-wrap">
            {sheet.levelOptions.map((option) => (
              <Link key={option.value} className={`tm-chip ${option.active ? 'tm-chip-active' : ''}`} href={option.href}>{option.label}</Link>
            ))}
          </div>
        </div>
        {/* TODO: view format toggle (list / grid) — planned for later
        <div className="tm-filter-section">
          <div className="tm-text-label">보기 방식</div>
          <div className="tm-filter-view-grid">
            {sheet.viewOptions.map((option) => (
              <Link key={option.value} className={`tm-filter-view-option ${option.active ? 'tm-filter-view-option-active' : ''}`} href={option.href}>
                <span className="tm-text-label">{option.label}</span>
                <span className="tm-text-micro">{option.description}</span>
              </Link>
            ))}
          </div>
        </div>
        */}
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

  return (
    <div className="tm-filter-layer">
      <section
        className="tm-filter-sheet"
        aria-label={ariaLabel}
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
          <Link key={sport.label} className={className} href={sport.href}>
            {content}
          </Link>
        ) : (
          <button key={sport.label} className={className} type="button">
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
        <span className="tm-match-count-badge tab-num">{match.current}/{match.capacity}</span>
      </div>
      <div className="tm-match-list-card-body">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span className="tm-badge tm-badge-grey">{match.sport}</span>
          <span className="tm-badge tm-badge-grey">{match.level}</span>
          <span className="tm-badge tm-badge-grey">{match.gender}</span>
          <span className="tm-badge tm-badge-orange">{match.deadline}</span>
        </div>
        <div className="tm-text-body-lg" style={{ marginTop: 10 }}>{match.title}</div>
        <div className="tm-text-caption" style={{ marginTop: 5 }}>{match.date} {match.time} · {match.venue}</div>
        <div className="tm-match-list-footer">
          <span className="tm-text-caption">{match.region} · {match.host}</span>
          <span className="tm-text-label">{match.actionLabel}</span>
        </div>
      </div>
    </Link>
  );
}

function InfoRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="tm-info-row">
      <div className="tm-text-caption">{label}</div>
      <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
        <div className="tm-text-label">{value}</div>
        {sub ? <div className="tm-text-micro" style={{ marginTop: 3, color: 'var(--text-caption)' }}>{sub}</div> : null}
      </div>
    </div>
  );
}

function StateCard({ tone, title, body }: { tone: 'orange' | 'green'; title: string; body: string }) {
  return <Card pad={14} style={{ marginTop: 14, background: tone === 'green' ? 'rgba(3,178,108,.08)' : 'rgba(254,152,0,.10)' }}><div className="tm-text-label" style={{ color: tone === 'green' ? 'var(--green500)' : 'var(--orange500)' }}>{title}</div><div className="tm-text-caption" style={{ marginTop: 5 }}>{body}</div></Card>;
}

function CreateProgress({ step, edit }: { step: number; edit: boolean }) {
  return (
    <div className="tm-create-progress">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <span className={`tm-badge ${edit ? 'tm-badge-orange' : 'tm-badge-blue'}`}>{edit ? '수정' : `${step}/4단계`}</span>
        <span className="tm-text-caption">{edit ? '기존 값 유지 · 변경사항만 저장' : ['종목 선택', '매치 정보', '장소와 시간', '작성 내용 확인'][step - 1]}</span>
      </div>
      {!edit ? <div className="tm-create-bars">{[1, 2, 3, 4].map((item) => <span key={item} data-active={item <= step} />)}</div> : null}
    </div>
  );
}

function SportStep({ model }: { model: MatchCreateViewModel }) {
  return <div><h1 className="tm-text-heading">어떤 종목인가요?</h1><p className="tm-text-body" style={{ marginTop: 8 }}>함께 할 종목을 선택해 주세요.</p><div className="tm-create-sport-grid">{model.sports.map((sport) => <button key={sport} className={`tm-card tm-pressable ${sport === model.selectedSport ? 'tm-create-selected' : ''}`} style={{ padding: 16, textAlign: 'left' }} type="button" onClick={() => model.form?.onSelectSport(sport)}><div className="tm-text-body-lg">{sport}</div><div className="tm-text-caption" style={{ marginTop: 5 }}>{sport === model.selectedSport ? '선택됨' : '선택 가능'}</div></button>)}</div></div>;
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
        <button className="tm-create-stepper-button" type="button" onClick={() => onChange?.(Math.max(2, normalized - 1))}>-</button>
        <select className="tm-create-input tm-create-select-control" value={normalized} onChange={(event) => onChange?.(Number(event.target.value))}>
          {options.map((item) => <option key={item} value={item}>{item}명</option>)}
        </select>
        <button className="tm-create-stepper-button" type="button" onClick={() => onChange?.(Math.min(30, normalized + 1))}>+</button>
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
      <div className="tm-text-caption" style={{ marginTop: 6 }}>비워두면 경기 시작 전까지 신청을 받아요.</div>
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
        <EmptyState title="매치가 만들어졌어요" sub="매치를 만들었어요! 팀원들에게 먼저 공유해 참여 의사를 확인해 보세요." />
        <Card pad={16} style={{ marginTop: 22, background: 'var(--blue50)', borderColor: 'rgba(49,130,246,.24)' }}>
          <div className="tm-text-body-lg">FC 발빠른놈들 팀 채팅</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>24명에게 매치 링크와 일정을 공유해요</div>
        </Card>
        {['내 팀에 공유', '초대 링크 복사', '관심 멤버에게 보내기'].map((item, index) => <Card key={item} pad={14} className={index === 0 ? 'tm-create-selected' : ''} style={{ marginTop: 10 }}><div className="tm-text-label">{item}</div><div className="tm-text-caption" style={{ marginTop: 5 }}>{model.draft.title} 일정 정보를 공유해요.</div></Card>)}
      </div>
      <div className="tm-fixed-cta"><div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}><Link className="tm-btn tm-btn-lg tm-btn-neutral" href="/matches/match-1">상세 보기</Link><button className="tm-btn tm-btn-lg tm-btn-primary" type="button">내 팀에 공유</button></div></div>
    </AppChrome>
  );
}

function CreateField({ label, value, placeholder, suffix, multiline, type = 'text', onChange }: { label: string; value?: string; placeholder?: string; suffix?: string; multiline?: boolean; type?: string; onChange?: (value: string) => void }) {
  return (
    <label className="tm-create-field">
      <div className="tm-text-label">{label}</div>
      <div className={`tm-create-input ${multiline ? 'tm-create-input-multiline' : ''}`}>
        {onChange ? (
          multiline ? (
            <textarea className="tm-create-native-input" value={value ?? ''} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
          ) : (
            <input className="tm-create-native-input" type={type} value={value ?? ''} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
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
          <button key={option} className={`tm-chip ${value === option ? 'tm-chip-active' : ''}`} type="button" onClick={() => onChange?.(option)}>
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
  return '/matches/match-1';
}
