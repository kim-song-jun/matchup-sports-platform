'use client';

import Link from 'next/link';
import type { ChangeEvent, KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppChrome } from '@/components/v1-ui/shell';
import { ActionPanel, Card, EmptyState, ListItem, MetricCard, PageHeader } from '@/components/v1-ui/primitives';
import { BellIcon, ChevronLeftIcon, FilterIcon, PlusIcon, SearchIcon, ShareIcon } from '@/components/v1-ui/icons';
import { cssUrl } from '@/lib/assets';
import type {
  MatchCardModel,
  MatchCreateViewModel,
  MatchDetailViewModel,
  MatchListViewModel,
  MatchStateViewModel,
} from './matches.types';

export function MatchListPageView({ model }: { model: MatchListViewModel }) {
  const filterOpen = Boolean(model.filterSheet?.open);

  return (
    <AppChrome
      title="매치"
      activeTab="matches"
      topBar={false}
      wide
      modalOpen={filterOpen}
      floatingSlot={<MatchCreateFloatingButton />}
    >
      <div aria-hidden={filterOpen ? true : undefined} inert={filterOpen ? true : undefined}>
        <MatchSearchBar query={model.query} filterCount={model.filterCount} search={model.search} filterHref={model.filterHref} />
        <div className="tm-match-list tm-matches-open-design tm-matches-desktop-workbench" data-testid="matches-open-design">
          <div className="tm-list-grid">
            <aside className="tm-filter-rail" aria-label="매치 필터" data-testid="matches-filter-rail">
              <div className="tm-filter-rail-title">매치 필터</div>
              <div className="tm-filter-rail-list">
                {model.sports.map((sport) => (
                  <FilterRailLink key={sport.label} href={sport.href ?? '/matches'} active={sport.active} count={sport.count}>
                    {sport.label}
                  </FilterRailLink>
                ))}
                <Link className="tm-btn tm-btn-sm tm-btn-secondary tm-btn-block" href={model.filterHref ?? '/matches?filter=1'}>상세 필터</Link>
              </div>
            </aside>
            <div>
              <PageHeader
                eyebrow="개인 매치"
                title="오늘 참여 가능한 매치"
                description="종목, 지역, 모집 상태를 비교하고 원하는 매치로 바로 이동합니다."
                action={<Link className="tm-btn tm-btn-sm tm-btn-primary" href="/matches/new">매치 만들기</Link>}
              />
              <div className="tm-responsive-card-grid" style={{ marginTop: 16 }}>
                <MetricCard label="운영 요약" value={`${model.summary.count}개`} delta={`오늘 ${model.summary.today}개`} tone="up" />
                <MetricCard label="모집 흐름" value={`${model.summary.urgent}개`} delta="승인제 신청 기준" />
              </div>
              <SportSelector sports={model.sports} />
              <div className="tm-match-summary-row">
                <div className="tm-text-label">{model.summary.label}</div>
                <div className="tm-text-caption tab-num">{model.summary.count}개 · 오늘 {model.summary.today} · 마감 {model.summary.urgent}</div>
              </div>
              <div className="tm-match-card-stack">
                {model.matches.length ? (
                  model.matches.map((match, index) => <MatchCardItem key={match.id} match={match} index={index} />)
                ) : (
                  <EmptyState title="조건에 맞는 매치가 없어요" sub="다른 종목을 선택하거나 전체 매치로 돌아가면 모집 중인 매치를 볼 수 있습니다." />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {filterOpen ? <MatchFilterSheet model={model} /> : null}
    </AppChrome>
  );
}

export function MatchStatePageView({ model }: { model: MatchStateViewModel }) {
  if (model.state === 'filter') return <MatchFilterPageView model={model} />;
  if (model.state === 'participants') return <MatchParticipantsPageView />;
  const joined = model.state === 'joined';

  return (
    <AppChrome title={model.title} activeTab="matches" bottomNav={false} backHref="/matches" wide={joined}>
      <div className={`tm-match-list tm-match-state-lane ${joined ? 'tm-match-joined-desktop-workbench' : ''}`} data-testid="match-state-open-design">
        <EmptyState title={model.title} sub={model.description} />
        {model.state === 'empty' ? (
          <Link className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" href="/matches" style={{ marginTop: 14 }}>필터 초기화</Link>
        ) : null}
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
      <div className="tm-create-shell tm-match-filter-open-design tm-match-create-open-design">
        <section>
          <h1 className="tm-text-heading">매치 조건</h1>
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
      <div className="tm-fixed-cta tm-match-filter-action">
        <div className="tm-fixed-cta-row tm-fixed-cta-row-weighted">
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
      <div className="tm-match-list tm-match-state-lane" data-testid="match-participants-open-design">
        <Card pad={16} style={{ background: 'var(--blue50)', borderColor: 'rgba(49,130,246,.24)' }}>
          <div className="tm-text-body-lg">주말 풋살 한판!</div>
          <div className="tm-text-caption" style={{ marginTop: 5 }}>승인 완료 2명 · 승인중 1명 · 정원 10명</div>
        </Card>
        <div className="tm-my-list-stack" style={{ marginTop: 14 }}>
          {participants.map((person) => <ListItem key={person.name} title={person.name} sub={person.meta} trailing={person.status} />)}
        </div>
        <Card pad={14} style={{ marginTop: 16, background: 'var(--grey50)' }}>
          <div className="tm-text-label">참가자 관리는 상세/수정 플로우에서 연결됩니다</div>
          <div className="tm-text-caption" style={{ marginTop: 5 }}>참가자 승인 상태와 모집 정원을 한곳에서 확인할 수 있습니다.</div>
          <Link className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" href="/matches/match-1" style={{ marginTop: 14 }}>상세로 돌아가기</Link>
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
  if (status === 'full') return '모집완료';
  return '모집중';
}

export function MatchDetailPageView({ model }: { model: MatchDetailViewModel }) {
  const { match, mode } = model;
  const locked = mode === 'pending' || mode === 'approved' || match.status === 'full';
  const canRunAction = Boolean(model.onApply);
  const cta = model.applyLabel ?? (mode === 'mine' ? '매치 관리' : mode === 'approved' ? '승인 완료' : mode === 'pending' ? '신청 취소' : match.status === 'full' ? '신청 마감' : '참가 신청');
  const ctaTone = mode === 'pending' ? 'tm-btn-warning' : mode === 'approved' ? 'tm-btn-success' : locked ? 'tm-btn-neutral' : 'tm-btn-primary';
  const showChat = mode === 'approved' && Boolean(model.onChat);

  return (
    <AppChrome title="" activeTab="matches" bottomNav={false} topBar={false} wide>
      <article className="tm-match-detail tm-match-detail-open-design tm-match-detail-desktop-stage" data-testid="match-detail-open-design">
        <div className="tm-match-detail-hero" style={{ backgroundImage: cssUrl(match.image) }}>
          <div className="tm-match-detail-overlay">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Link className="tm-btn tm-btn-icon tm-btn-ghost tm-hero-button" href="/matches" aria-label="뒤로가기">
                <ChevronLeftIcon size={22} strokeWidth={2.2} />
              </Link>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="tm-btn tm-btn-icon tm-btn-ghost tm-hero-button" type="button" aria-label="공유" onClick={model.onShare}><ShareIcon size={20} /></button>
                <button className="tm-btn tm-btn-icon tm-btn-ghost tm-hero-button" type="button" aria-label="알림" onClick={model.onNotify}><BellIcon size={20} /></button>
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                <span className="tm-badge tm-badge-blue">{match.sport}</span>
                <span className="tm-badge tm-badge-grey">{match.level}</span>
                <span className="tm-badge tm-badge-grey">{match.gender}</span>
                <span className={`tm-badge ${matchStatusBadgeClass(mode, match.status)}`}>{matchStatusBadgeLabel(mode, match.status)}</span>
              </div>
              <h1 className="tm-match-detail-title">{match.title}</h1>
              <div className="tm-text-caption" style={{ color: 'rgba(255,255,255,.76)', marginTop: 6 }}>{match.host} 호스트 · {match.deadline}</div>
            </div>
          </div>
        </div>
        <div className="tm-match-detail-body">
          <div className="tm-detail-grid">
            <div>
              <InfoRow label="날짜와 시간" value={`${match.date} ${match.time}`} />
              <InfoRow label="장소" value={match.venue} sub={match.address} />
              <InfoRow label="인원" value={`${match.current}/${match.capacity}명`} sub={`${Math.max(match.capacity - match.current, 0)}자리 남음`} />
              <InfoRow label="성별 조건" value={match.gender} />
              {mode === 'pending' ? <StateCard tone="orange" title="승인 대기" body="호스트가 신청을 확인하고 있습니다." /> : null}
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
            <aside>
              <MetricCard label="모집 현황" value={`${match.current}/${match.capacity}명`} delta={match.actionLabel} tone={match.status === 'open' ? 'up' : 'neutral'} />
              <ActionPanel
                title={mode === 'mine' ? '호스트 관리' : '신청 전 확인'}
                description={mode === 'mine' ? '수정과 참가자 관리는 호스트 권한을 기준으로 열립니다.' : '신청은 승인제 상태를 기준으로 처리됩니다.'}
                action={<Link className="tm-btn tm-btn-sm tm-btn-secondary" href={mode === 'mine' ? match.manageHref ?? `/matches/${match.id}/edit` : '/matches'}>{mode === 'mine' ? '수정하기' : '목록 보기'}</Link>}
              />
            </aside>
          </div>
        </div>
      </article>
      <div className="tm-fixed-cta tm-match-detail-fixed-cta">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <span className="tm-text-caption">{mode === 'mine' ? '내가 만든 매치' : '신청 상태'}</span>
          <span className="tm-text-label">{model.statusLabel ?? match.actionLabel}</span>
        </div>
        <div className="tm-fixed-cta-row tm-fixed-cta-row-chat" data-has-chat={showChat ? 'true' : 'false'}>
          {showChat ? (
            <button className="tm-btn tm-btn-lg tm-btn-neutral" type="button" disabled={!model.onChat || model.chatPending} onClick={model.onChat}>
              {model.chatPending ? '연결 중' : model.chatLabel ?? '채팅'}
            </button>
          ) : null}
          {mode === 'mine' ? (
            <Link className="tm-btn tm-btn-lg tm-btn-primary" href={match.manageHref ?? `/matches/${match.id}/edit`}>{cta}</Link>
          ) : (
            <button className={`tm-btn tm-btn-lg ${ctaTone}`} type="button" disabled={!canRunAction || model.applyPending} onClick={model.onApply}>
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
  const backHref = model.backHref ?? (edit ? '/matches/match-1' : '/matches');
  return (
    <AppChrome title={edit ? '매치 수정' : '매치 만들기'} activeTab="matches" bottomNav={false} backHref={backHref}>
      <div className="tm-create-shell tm-match-create-open-design tm-match-create-desktop-lane" data-testid="match-create-open-design">
        <CreateProgress step={stepNo} edit={edit} />
        {model.form?.error ? <StateCard tone="orange" title="저장할 수 없어요" body={model.form.error} /> : null}
        {model.form?.lockedReason ? <StateCard tone="orange" title="수정이 제한된 매치입니다" body={model.form.lockedReason} /> : null}
        {model.step === 'sport' ? <SportStep model={model} /> : null}
        {model.step === 'info' || model.step === 'edit' ? <InfoStep model={model} edit={edit} /> : null}
        {model.step === 'place-time' ? <PlaceTimeStep model={model} /> : null}
        {model.step === 'confirm' ? <ConfirmStep model={model} /> : null}
      </div>
      <div className="tm-fixed-cta tm-create-fixed-cta tm-match-create-action">
        <div className="tm-fixed-cta-row tm-fixed-cta-row-weighted tm-match-create-cta-row">
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
        {edit && model.form?.onCancel ? <button className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block tm-match-create-cancel-button" type="button" style={{ marginTop: 8 }} disabled={model.form.submitting} onClick={model.form.onCancel}>매치 취소</button> : null}
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
            {!search.isLoading && search.recentItems.length === 0 ? <div className="tm-list-search-empty">최근 검색어가 없습니다</div> : null}
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

function FilterRailLink({ children, href, active, count }: { children: ReactNode; href: string; active?: boolean; count: number }) {
  return (
    <Link className="tm-filter-pill" href={href} data-active={active}>
      <span>{children}</span>
      <span className="tm-filter-pill-count">{count}</span>
    </Link>
  );
}

function MatchFilterSheet({ model }: { model: MatchListViewModel }) {
  const sheet = model.filterSheet;
  if (!sheet) return null;

  return (
    <>
      <Link className="tm-filter-scrim" href={sheet.closeHref} aria-hidden="true" tabIndex={-1} />
      <DraggableFilterSheet closeHref={sheet.closeHref} ariaLabel="매치 필터">
        <div className="tm-filter-sheet-handle" />
        <div className="tm-filter-sheet-head">
          <div>
            <div className="tm-text-subhead">필터</div>
            <div className="tm-text-caption" style={{ marginTop: 2 }}>정렬 조건을 조정합니다</div>
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
        {/* 보기 형식은 추후 추가 예정입니다.
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
  const sheetRef = useRef<HTMLElement | null>(null);
  const startYRef = useRef(0);
  const draggingRef = useRef(false);
  const [offsetY, setOffsetY] = useState(0);

  useEffect(() => {
    sheetRef.current?.focus();
  }, []);

  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.target instanceof Element && event.target.closest('a,button,input,textarea,select,label')) return;
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

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'),
    ).filter((element) => {
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
    });
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === event.currentTarget)) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="tm-filter-layer">
      <section
        className="tm-filter-sheet"
        aria-label={ariaLabel}
        aria-modal="true"
        autoFocus
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        ref={sheetRef}
        role="dialog"
        style={{ transform: `translateY(${offsetY}px)` }}
        tabIndex={-1}
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
  const detailHref = `/matches/${match.id}`;
  const applyHref = `${detailHref}?intent=apply`;

  return (
    <article className="tm-match-list-card tm-pressable">
      <Link className="tm-match-list-media tm-match-list-media-link" href={detailHref} aria-label={`${match.title} 이미지로 상세 보기`} style={{ backgroundImage: cssUrl(match.image) }}>
        <span className="tm-badge tm-badge-blue">{index === 0 ? '추천' : match.sport}</span>
        <span className="tm-match-count-badge tab-num">{match.current}/{match.capacity}</span>
      </Link>
      <div className="tm-match-list-card-body">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span className="tm-badge tm-badge-grey">{match.sport}</span>
          <span className="tm-badge tm-badge-grey">{match.level}</span>
          <span className="tm-badge tm-badge-grey">{match.gender}</span>
          <span className="tm-badge tm-badge-orange">{match.deadline}</span>
        </div>
        <Link className="tm-match-list-title-link tm-text-body-lg" href={detailHref} style={{ marginTop: 10 }}>{match.title}</Link>
        <div className="tm-text-caption" style={{ marginTop: 5 }}>{match.date} {match.time} · {match.venue}</div>
        <div className="tm-match-list-footer">
          <span className="tm-text-caption">{match.region} · {match.host}</span>
          <span className="tm-text-label">{match.actionLabel}</span>
        </div>
        <div className="tm-match-card-actions">
          <Link href={applyHref} aria-label={`${match.title} 참가 신청`}>참가 신청</Link>
          <Link href={detailHref} aria-label={`${match.title} 상세 보기`}>상세 보기</Link>
        </div>
      </div>
    </article>
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
        <span className={`tm-badge ${edit ? 'tm-badge-orange' : 'tm-badge-blue'}`}>{edit ? '수정' : `Step ${step}/4`}</span>
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
      <CreateField label="설명" value={draft.description} placeholder="예: 초보도 편하게 참여할 수 있는 친선 매치입니다." multiline onChange={(value) => model.form?.onFieldChange('description', value)} />
      <ImageUploadField image={draft.image} onChange={(value) => model.form?.onFieldChange('image', value)} />
      <CapacityField value={draft.capacity} onChange={(value) => model.form?.onFieldChange('capacity', value)} />
      <LevelRangeField levels={model.levels} minLevel={draft.minLevel} maxLevel={draft.maxLevel} onChange={(field, value) => model.form?.onFieldChange(field, value)} />
      <GenderRuleSelector value={draft.gender} onChange={(value) => model.form?.onFieldChange('gender', value)} />
      <CreateField label="규칙" value={draft.rules} placeholder="예: 풋살화 착용, 지각 시 미리 연락" multiline onChange={(value) => model.form?.onFieldChange('rules', value)} />
      {edit ? <StateCard tone="orange" title="변경사항 저장" body="저장에 실패하면 입력한 내용을 유지한 채 다시 시도할 수 있습니다." /> : null}
    </div>
  );
}

function ImageUploadField({ image, onChange }: { image: string; onChange?: (value: string) => void }) {
  const [fileName, setFileName] = useState('');
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') onChange?.(reader.result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <Card pad={0} style={{ marginTop: 14, overflow: 'hidden' }}>
      <div className="tm-create-image-preview" style={{ backgroundImage: cssUrl(image) }}>
        <span className="tm-badge tm-badge-grey">대표 이미지</span>
      </div>
      <div style={{ padding: 14 }}>
        <label className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block">
          {fileName ? '이미지 변경' : '이미지 업로드'}
          <input className="sr-only" type="file" accept="image/*" onChange={handleChange} />
        </label>
        {fileName ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <span className="tm-text-caption" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</span>
            <button className="tm-btn tm-btn-sm tm-btn-ghost" type="button" onClick={() => { setFileName(''); onChange?.('/mock/generated/futsal-rooftop.webp'); }}>제거</button>
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
      <div className="tm-text-caption" style={{ marginTop: 6 }}>지역은 검색과 추천 기준이고, 장소와 상세 주소는 직접 입력합니다.</div>
    </label>
  );
}

function ConfirmStep({ model }: { model: MatchCreateViewModel }) {
  const draft = model.draft;
  const regionName = model.form?.regions.find((region) => region.id === model.form?.regionId)?.name ?? '지역 선택 필요';
  return <div><h1 className="tm-text-heading">작성된 내용을 확인해주세요</h1><Card pad={0} style={{ marginTop: 16, overflow: 'hidden' }}><div className="tm-create-image-preview" style={{ backgroundImage: cssUrl(draft.image) }} /><div style={{ padding: 16 }}><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><span className="tm-badge tm-badge-blue">{model.selectedSport}</span><span className="tm-badge tm-badge-grey">{draft.minLevel}-{draft.maxLevel}</span><span className="tm-badge tm-badge-grey">{draft.gender}</span></div><div className="tm-text-subhead" style={{ marginTop: 10 }}>{draft.title}</div><div className="tm-text-caption" style={{ marginTop: 6 }}>{draft.description}</div></div></Card><Card pad={16} style={{ marginTop: 12 }}><InfoRow label="지역" value={regionName} sub="검색과 추천에 사용됩니다" /><InfoRow label="일시" value={`${draft.date} ${draft.startTime}-${draft.endTime}`} /><InfoRow label="장소" value={draft.venue} sub={draft.address} /><InfoRow label="인원" value={`최대 ${draft.capacity}명`} /><InfoRow label="이미지" value="대표 이미지" sub="목록과 상세 화면에 표시됩니다" /></Card></div>;
}

function MatchComplete({ model }: { model: MatchCreateViewModel }) {
  return (
    <AppChrome title="매치 만들기 완료" activeTab="matches" bottomNav={false} backHref="/matches">
      <div className="tm-create-shell tm-match-complete-open-design tm-match-create-open-design" data-testid="match-complete-open-design">
        <EmptyState title="매치가 만들어졌어요" sub="개인매치도 먼저 내 팀에게 공유해서 팀원 참여 가능 여부를 확인할 수 있습니다." />
        <Card pad={16} style={{ marginTop: 22, background: 'var(--blue50)', borderColor: 'rgba(49,130,246,.24)' }}>
          <div className="tm-text-body-lg">FC 발빠른놈들 팀 채팅</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>24명에게 개인매치 링크와 일정 정보를 공유</div>
        </Card>
        {['내 팀에 공유', '초대 링크 복사', '관심 멤버에게 보내기'].map((item, index) => <Card key={item} pad={14} className={index === 0 ? 'tm-create-selected' : ''} style={{ marginTop: 10 }}><div className="tm-text-label">{item}</div><div className="tm-text-caption" style={{ marginTop: 5 }}>{model.draft.title} 일정 정보를 공유합니다.</div></Card>)}
      </div>
      <div className="tm-fixed-cta tm-create-fixed-cta tm-match-create-action"><div className="tm-fixed-cta-row tm-fixed-cta-row-weighted"><Link className="tm-btn tm-btn-lg tm-btn-neutral" href="/matches">목록 보기</Link><button className="tm-btn tm-btn-lg tm-btn-primary" type="button" disabled>공유 준비 중</button></div></div>
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
