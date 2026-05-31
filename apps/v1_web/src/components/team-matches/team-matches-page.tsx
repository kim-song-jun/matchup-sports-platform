'use client';

import Link from 'next/link';
import type { PointerEvent, ReactNode } from 'react';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppChrome } from '@/components/v1-ui/shell';
import { Card, EmptyState, ListItem } from '@/components/v1-ui/primitives';
import { BellIcon, ChevronLeftIcon, FilterIcon, PlusIcon, SearchIcon, ShareIcon } from '@/components/v1-ui/icons';
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
      title="팀매치"
      activeTab="teamMatches"
      topBar={false}
      floatingSlot={<TeamMatchCreateFloatingButton />}
    >
      <TeamMatchSearchBar filterCount={model.filterCount} search={model.search} query={model.query} filterHref={model.filterHref} />
      <div className="tm-match-list">
        <div className="tm-sport-chip-row">{model.sports.map((sport) => sport.href ? <Link key={sport.label} className={`tm-chip ${sport.active ? 'tm-chip-active' : ''}`} href={sport.href}>{sport.label} <span className="tab-num">{sport.count}</span></Link> : <button key={sport.label} className={`tm-chip ${sport.active ? 'tm-chip-active' : ''}`} type="button">{sport.label} <span className="tab-num">{sport.count}</span></button>)}</div>
        <div className="tm-match-summary-row"><div className="tm-text-label">서울 전체 · 팀매치</div><div className="tm-text-caption tab-num">{model.summary.count}개 · 오늘 {model.summary.today} · 마감 {model.summary.urgent}</div></div>
        {model.matches.length ? <div className="tm-match-card-stack">{model.matches.map((match, index) => <TeamMatchCard key={match.id} match={match} index={index} />)}</div> : <EmptyState title="조건에 맞는 팀매치가 없어요" sub="다른 종목을 선택하거나 필터를 초기화해 다시 확인해 주세요." />}
      </div>
      {model.filterSheet?.open ? <TeamMatchFilterSheet model={model} /> : null}
    </AppChrome>
  );
}

export function TeamMatchStatePageView({ model }: { model: TeamMatchStateViewModel }) {
  if (model.state === 'filter') return <TeamMatchFilterPageView model={model} />;

  return (
    <AppChrome title={model.title} activeTab="teamMatches" bottomNav={false} backHref="/team-matches">
      <div className="tm-match-list">
        <EmptyState title={model.title} sub={model.description} />
        {model.state === 'error' ? (
          <Card pad={16} style={{ marginTop: 18, background: 'var(--grey50)' }}>
            <div className="tm-text-label">목록으로 돌아가 다시 확인해 주세요</div>
            <div className="tm-text-caption" style={{ marginTop: 6, lineHeight: 1.55 }}>
              새로고침 후에도 같은 문제가 반복되면 잠시 뒤 다시 시도해 주세요.
            </div>
            <Link className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" href="/team-matches" style={{ marginTop: 14 }}>목록으로 돌아가기</Link>
          </Card>
        ) : null}
      </div>
    </AppChrome>
  );
}

function TeamMatchFilterPageView({ model }: { model: TeamMatchStateViewModel }) {
  return (
    <AppChrome title="필터" activeTab="teamMatches" bottomNav={false} backHref="/team-matches">
      <div className="tm-create-shell">
        <section>
          <h1 className="tm-text-heading">팀매치 조건</h1>
          <p className="tm-text-body" style={{ marginTop: 8, lineHeight: 1.55 }}>{model.description}</p>
        </section>
        <Card pad={16}>
          <div className="tm-text-body-lg">종목</div>
          <div className="tm-sport-chip-row" style={{ marginTop: 12 }}>
            {model.sports.map((sport) => sport.href ? <Link key={sport.label} className={`tm-chip ${sport.active ? 'tm-chip-active' : ''}`} href={sport.href}>{sport.label}</Link> : <button key={sport.label} className={`tm-chip ${sport.active ? 'tm-chip-active' : ''}`} type="button">{sport.label}</button>)}
          </div>
        </Card>
        <Card pad={16}>
          <div className="tm-text-body-lg">상대팀 조건</div>
          <div className="tm-my-list-stack" style={{ marginTop: 12 }}>
            <ListItem title="등급" sub="A-C 등급" trailing="변경 가능" />
            <ListItem title="경기 방식" sub="5:5, 6:6, 11:11" trailing="3개" />
            <ListItem title="비용" sub="무료초청 우선" trailing="1개" />
          </div>
        </Card>
      </div>
      <div className="tm-fixed-cta">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
          <Link className="tm-btn tm-btn-lg tm-btn-neutral" href="/team-matches">초기화</Link>
          <Link className="tm-btn tm-btn-lg tm-btn-primary" href="/team-matches">{model.matches.length}개 결과 보기</Link>
        </div>
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
  if (mode === 'pending') return '검토중';
  if (mode === 'approved') return '승인완료';
  if (mode === 'mine') return '신청팀';
  return '모집중';
}

function teamMatchOpponentSub(mode: TeamMatchDetailViewModel['mode']) {
  if (mode === 'pending') return '홈팀 검토 대기';
  if (mode === 'approved') return '참가 확정';
  if (mode === 'mine') return '승인 후 확정';
  return '신청 후 승인';
}

export function TeamMatchDetailPageView({ model }: { model: TeamMatchDetailViewModel }) {
  const { match, mode } = model;
  const locked = mode === 'pending' || mode === 'approved';
  const cta = model.applyLabel ?? (mode === 'mine' ? '매치 관리' : mode === 'approved' ? '승인완료' : mode === 'pending' ? '승인중' : '신청하기');
  const ctaTone = mode === 'pending' ? 'tm-btn-warning' : mode === 'approved' ? 'tm-btn-success' : locked ? 'tm-btn-neutral' : 'tm-btn-primary';
  const canRunAction = Boolean(model.onApply);
  return (
    <AppChrome title="" activeTab="teamMatches" bottomNav={false} topBar={false}>
      <article className="tm-match-detail">
        <div className="tm-team-vs-hero">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Link className="tm-btn tm-btn-icon tm-btn-ghost tm-hero-button" href="/team-matches" aria-label="뒤로가기">
              <ChevronLeftIcon size={22} strokeWidth={2.2} />
            </Link>
            <div style={{ display: 'flex', gap: 4 }}><button className="tm-btn tm-btn-icon tm-btn-ghost tm-hero-button" type="button" aria-label="공유"><ShareIcon size={20} /></button><button className="tm-btn tm-btn-icon tm-btn-ghost tm-hero-button" type="button" aria-label="알림"><BellIcon size={20} /></button></div>
          </div>
          <div className="tm-team-vs-row">
            <div><div className="tm-text-caption" style={{ color: 'rgba(255,255,255,.68)' }}>홈팀</div><div className="tm-text-subhead" style={{ color: 'var(--static-white)' }}>{match.hostTeam}</div><div className="tm-text-micro" style={{ color: 'rgba(255,255,255,.72)' }}>매너 {match.manner} · 승 {match.wins}</div></div>
            <div className="tm-text-label" style={{ color: 'rgba(255,255,255,.76)' }}>VS</div>
            <div style={{ textAlign: 'right' }}><div className="tm-text-caption" style={{ color: 'rgba(255,255,255,.68)' }}>상대팀</div><div className="tm-text-subhead" style={{ color: 'var(--static-white)' }}>{teamMatchOpponentLabel(mode)}</div><div className="tm-text-micro" style={{ color: 'rgba(255,255,255,.72)' }}>{teamMatchOpponentSub(mode)}</div></div>
          </div>
        </div>
        <div className="tm-match-detail-body">
          <InfoRow label="날짜와 시간" value={`${match.date} ${match.time}`} />
          <InfoRow label="장소" value={match.venue} sub={match.address} />
          <InfoRow label="경기정보" value={`${match.sport} · ${match.format}`} sub={`${match.grade}등급 · 유니폼 ${match.uniform}`} />
          <InfoRow label="성별 조건" value={match.gender} />
          <InfoRow label="참가비" value={`${match.opponentCost.toLocaleString('ko-KR')}원`} sub={match.opponentCost === 0 ? '무료초청 · 실제 청구 없음' : `총 비용 ${match.cost.toLocaleString('ko-KR')}원`} />
          {mode === 'pending' ? <StateCard tone="orange" title="신청 확인을 완료했어요" body="홈팀 검토가 끝나면 알림으로 알려드릴게요." /> : null}
          {mode === 'approved' ? <StateCard tone="green" title="승인완료" body="팀매치 참가가 확정되었습니다. 경기 전 안내를 계속 확인할 수 있습니다." /> : null}
          <Link className="tm-card tm-pressable tm-team-info-link" href="/teams/team-1"><div className="tm-text-body-lg">팀 정보 보러가기</div><div className="tm-text-caption" style={{ marginTop: 6 }}>팀 상세조회로 이동해 매너, 전적, 멤버 구성을 확인합니다.</div></Link>
          <Card pad={16} style={{ marginTop: 10 }}><div className="tm-text-body-lg">신청팀</div><div style={{ display: 'grid', gap: 8, marginTop: 12 }}>{match.applicantTeams.map((team) => <div key={team.name}><ListItem title={team.name} sub={team.meta} trailing={team.status} />{team.onApprove || team.onReject ? <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}><button className="tm-btn tm-btn-sm tm-btn-primary" type="button" disabled={team.actionPending} onClick={team.onApprove}>승인</button><button className="tm-btn tm-btn-sm tm-btn-neutral" type="button" disabled={team.actionPending} onClick={team.onReject}>거절</button></div> : null}</div>)}</div></Card>
        </div>
      </article>
      <div className="tm-fixed-cta"><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}><span className="tm-text-caption">{mode === 'mine' ? '내가 만든 팀매치' : locked ? '신청 상태' : '채팅 후 신청 가능'}</span><span className="tm-text-label tab-num">{match.opponentCost.toLocaleString('ko-KR')}원</span></div><div style={{ display: 'grid', gridTemplateColumns: mode === 'mine' ? '1fr' : '104px 1fr', gap: 8 }}>{mode !== 'mine' ? <Link className="tm-btn tm-btn-lg tm-btn-neutral" href="/chat/room-1">채팅</Link> : null}{mode === 'mine' ? <Link className="tm-btn tm-btn-lg tm-btn-primary" href={`/team-matches/${match.id}/edit`}>{cta}</Link> : <button className={`tm-btn tm-btn-lg ${ctaTone}`} disabled={!canRunAction || model.applyPending} type="button" onClick={model.onApply}>{model.applyPending ? '처리 중' : cta}</button>}</div></div>
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
    <AppChrome title={edit ? '팀매치 수정' : '팀매치 만들기'} activeTab="teamMatches" bottomNav={false} backHref={edit ? '/team-matches/team-match-1' : '/team-matches'}>
      <div className="tm-create-shell">
        <CreateProgress step={step} edit={edit} />
        {model.form?.error ? <StateCard tone="orange" title="저장할 수 없어요" body={model.form.error} /> : null}
        {model.form?.lockedReason ? <StateCard tone="orange" title="수정이 제한된 팀매치입니다" body={model.form.lockedReason} /> : null}
        {model.step === 'team' ? <TeamStep model={model} /> : null}
        {model.step === 'sport' ? <SportStep model={model} /> : null}
        {model.step === 'info' || edit ? <InfoStep model={model} edit={edit} /> : null}
        {model.step === 'condition' ? <ConditionStep model={model} /> : null}
        {model.step === 'place-time' ? <PlaceTimeStep model={model} /> : null}
        {model.step === 'confirm' ? <ConfirmStep model={model} /> : null}
      </div>
      <div className="tm-fixed-cta tm-create-fixed-cta"><div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>{secondaryAction ? <button className="tm-btn tm-btn-lg tm-btn-neutral" type="button" onClick={secondaryAction}>{edit ? '변경 취소' : model.step === 'team' ? '취소' : '이전'}</button> : <Link className="tm-btn tm-btn-lg tm-btn-neutral" href={model.step === 'team' ? '/team-matches' : '/team-matches/new/team'}>{edit ? '변경 취소' : model.step === 'team' ? '취소' : '이전'}</Link>}{primaryAction ? <button className="tm-btn tm-btn-lg tm-btn-primary" type="button" disabled={model.form?.submitting || Boolean(model.form?.lockedReason)} onClick={primaryAction}>{model.form?.submitting ? '저장 중' : primaryLabel}</button> : <Link className="tm-btn tm-btn-lg tm-btn-primary" href={nextHref(model.step)}>{primaryLabel}</Link>}</div>{edit && model.form?.onCancel ? <button className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" type="button" style={{ marginTop: 8 }} disabled={model.form.submitting} onClick={model.form.onCancel}>팀매치 취소</button> : null}</div>
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

function TeamMatchCard({ match, index }: { match: TeamMatchModel; index: number }) {
  return <Link className="tm-team-match-card tm-pressable" href={`/team-matches/${match.id}`}><div className="tm-team-match-vs"><div><div className="tm-text-caption">홈팀</div><div className="tm-text-subhead">{match.hostTeam}</div></div><span>VS</span><div style={{ textAlign: 'right' }}><div className="tm-text-caption">상대팀</div><div className="tm-text-subhead">모집중</div></div></div><div style={{ padding: 14 }}><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><span className="tm-badge tm-badge-blue">{match.sport}</span><span className="tm-badge tm-badge-grey">{match.grade}등급</span><span className="tm-badge tm-badge-grey">{match.format}</span><span className="tm-badge tm-badge-grey">{match.gender}</span>{match.opponentCost === 0 ? <span className="tm-badge tm-badge-blue">무료초청</span> : null}</div><div className="tm-text-body-lg" style={{ marginTop: 10 }}>{match.title}</div><div className="tm-text-caption" style={{ marginTop: 5 }}>{match.date} {match.time} · {match.venue}</div><div className="tm-match-list-footer"><span className="tm-text-caption">매너 {match.manner} · 승 {match.wins}</span><span className="tm-text-label tab-num">{match.opponentCost.toLocaleString('ko-KR')}원</span></div></div></Link>;
}

function TeamStep({ model }: { model: TeamMatchCreateViewModel }) {
  return <div><h1 className="tm-text-heading">어떤 팀의 매치인가요?</h1><p className="tm-text-body" style={{ marginTop: 8 }}>팀매치는 선택한 내 팀의 권한, 종목, 팀 정보로 생성됩니다.</p><div style={{ display: 'grid', gap: 10, marginTop: 20 }}>{model.teams.map((team) => <button key={team.name} className={`tm-card tm-pressable ${team.selected ? 'tm-create-selected' : ''}`} style={{ padding: 16, textAlign: 'left' }} type="button" onClick={() => model.form?.onSelectTeam(team.name)}><div className="tm-text-body-lg">{team.name}</div><div className="tm-text-caption" style={{ marginTop: 4 }}>{team.sport} · {team.members}명 · {team.role}</div></button>)}</div><Card pad={14} style={{ marginTop: 14, background: 'var(--grey50)' }}><div className="tm-text-label">권한 기준</div><div className="tm-text-caption" style={{ marginTop: 6 }}>팀장 또는 매치 생성 권한이 있는 관리자만 다음 단계로 이동할 수 있습니다.</div></Card></div>;
}

function SportStep({ model }: { model: TeamMatchCreateViewModel }) {
  return <div><h1 className="tm-text-heading">어떤 종목인가요?</h1><p className="tm-text-body" style={{ marginTop: 8 }}>상대 팀과 함께 진행할 종목을 선택해 주세요.</p><div className="tm-create-sport-grid">{model.sports.map((sport) => <button key={sport} className={`tm-card tm-pressable ${sport === model.selectedSport ? 'tm-create-selected' : ''}`} style={{ padding: 16, textAlign: 'left' }} type="button" onClick={() => model.form?.onSelectSport(sport)}><div className="tm-text-body-lg">{sport}</div><div className="tm-text-caption" style={{ marginTop: 5 }}>{sport === model.selectedSport ? '선택됨' : '선택 가능'}</div></button>)}</div></div>;
}

function InfoStep({ model, edit }: { model: TeamMatchCreateViewModel; edit: boolean }) {
  const d = model.draft;
  return <div><h1 className="tm-text-heading">매치 정보</h1><CreateField label="매치 제목" value={d.title} onChange={(value) => model.form?.onFieldChange('title', value)} /><CreateField label="설명" value={d.description} multiline onChange={(value) => model.form?.onFieldChange('description', value)} /><div className="tm-team-create-preview"><div className="tm-text-subhead" style={{ color: 'var(--static-white)' }}>우리 팀 VS 상대팀</div></div>{edit ? <><CreateField label="실력등급" value={d.grade} onChange={(value) => model.form?.onFieldChange('grade', value)} /><CreateField label="경기방식" value={d.format} onChange={(value) => model.form?.onFieldChange('format', value)} /><CreateField label="경기 스타일" value={d.style} onChange={(value) => model.form?.onFieldChange('style', value)} /><CreateField label="유니폼 색상" value={d.uniform} onChange={(value) => model.form?.onFieldChange('uniform', value)} /><GenderRuleSelector value={d.gender} onChange={(value) => model.form?.onFieldChange('gender', value)} /><div className="tm-create-two-col"><CreateField label="총비용" value={`${d.cost}`} suffix="원" type="number" onChange={(value) => model.form?.onFieldChange('cost', Number(value))} /><CreateField label="상대팀 부담금" value={`${d.opponentCost}`} suffix="원" type="number" onChange={(value) => model.form?.onFieldChange('opponentCost', Number(value))} /></div><StateCard tone="orange" title="수정 모드" body="팀 주장/관리자만 저장할 수 있고 실패 시 입력값을 유지합니다." /></> : null}</div>;
}

function ConditionStep({ model }: { model: TeamMatchCreateViewModel }) {
  const d = model.draft;
  return <div><h1 className="tm-text-heading">경기조건</h1><p className="tm-text-body" style={{ marginTop: 8 }}>상대팀이 신청 전에 확인해야 하는 등급, 방식, 비용 정보를 정리합니다.</p><CreateField label="실력등급" value={d.grade} onChange={(value) => model.form?.onFieldChange('grade', value)} /><CreateField label="경기방식" value={d.format} onChange={(value) => model.form?.onFieldChange('format', value)} /><CreateField label="경기 스타일" value={d.style} onChange={(value) => model.form?.onFieldChange('style', value)} /><CreateField label="유니폼 색상" value={d.uniform} onChange={(value) => model.form?.onFieldChange('uniform', value)} /><GenderRuleSelector value={d.gender} onChange={(value) => model.form?.onFieldChange('gender', value)} /><div className="tm-create-two-col"><CreateField label="총비용" value={`${d.cost}`} suffix="원" type="number" onChange={(value) => model.form?.onFieldChange('cost', Number(value))} /><CreateField label="상대팀 부담금" value={`${d.opponentCost}`} suffix="원" type="number" onChange={(value) => model.form?.onFieldChange('opponentCost', Number(value))} /></div><Card pad={14} style={{ marginTop: 14, background: 'var(--grey50)' }}><div className="tm-text-label">무료초청 표시</div><div className="tm-text-caption" style={{ marginTop: 5 }}>상대팀 부담금이 0원이면 목록과 상세에 무료초청 배지가 노출됩니다.</div></Card></div>;
}

function PlaceTimeStep({ model }: { model: TeamMatchCreateViewModel }) {
  const d = model.draft;
  return <div><h1 className="tm-text-heading">장소와 시간</h1><RegionSelect value={model.form?.regionId ?? ''} regions={model.form?.regions ?? []} onChange={model.form?.onRegionChange} /><Card pad={16} className="tm-create-selected" style={{ marginTop: 16 }}><div className="tm-text-body-lg">{d.venue}</div><div className="tm-text-caption" style={{ marginTop: 4 }}>{d.address}</div></Card><CreateField label="장소" value={d.venue} onChange={(value) => model.form?.onFieldChange('venue', value)} /><CreateField label="상세 주소" value={d.address} onChange={(value) => model.form?.onFieldChange('address', value)} /><CreateField label="날짜" value={d.date} type="date" onChange={(value) => model.form?.onFieldChange('date', value)} /><div className="tm-create-two-col"><CreateField label="시작 시간" value={d.startTime} type="time" onChange={(value) => model.form?.onFieldChange('startTime', value)} /><CreateField label="종료 시간" value={d.endTime} type="time" onChange={(value) => model.form?.onFieldChange('endTime', value)} /></div></div>;
}

function RegionSelect({ value, regions, onChange }: { value: string; regions: Array<{ id: string; name: string }>; onChange?: (regionId: string) => void }) {
  return <label className="tm-create-field"><div className="tm-text-label">지역</div><select className="tm-create-input tm-create-select-control" value={value} onChange={(event) => onChange?.(event.target.value)}><option value="">시/군/구 선택</option>{regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}</select><div className="tm-text-caption" style={{ marginTop: 6 }}>지역은 검색과 추천 기준이고, 장소와 상세 주소는 직접 입력합니다.</div></label>;
}

function ConfirmStep({ model }: { model: TeamMatchCreateViewModel }) {
  const d = model.draft;
  const regionName = model.form?.regions.find((region) => region.id === model.form?.regionId)?.name ?? '지역 선택 필요';
  return <div><h1 className="tm-text-heading">작성된 내용을 확인해주세요</h1><Card pad={0} style={{ marginTop: 16, overflow: 'hidden' }}><div className="tm-team-create-preview"><div className="tm-text-subhead" style={{ color: 'var(--static-white)' }}>{model.selectedTeam} VS 상대팀</div></div><div style={{ padding: 16 }}><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><span className="tm-badge tm-badge-blue">{model.selectedSport}</span><span className="tm-badge tm-badge-grey">{d.grade}</span><span className="tm-badge tm-badge-grey">{d.format}</span><span className="tm-badge tm-badge-grey">{d.gender}</span><span className="tm-badge tm-badge-blue">무료초청</span></div><div className="tm-text-subhead" style={{ marginTop: 10 }}>{d.title}</div><div className="tm-text-caption" style={{ marginTop: 6 }}>{d.description}</div></div></Card><Card pad={16} style={{ marginTop: 12 }}><InfoRow label="지역" value={regionName} sub="검색과 추천에 사용됩니다" /><InfoRow label="경기조건" value={`${d.grade} · ${d.format} · ${d.style}`} sub={`${d.uniform} · ${d.gender}`} /><InfoRow label="비용" value={`총 ${d.cost.toLocaleString('ko-KR')}원 · 상대팀 ${d.opponentCost.toLocaleString('ko-KR')}원`} /><InfoRow label="일시" value={`${d.date} ${d.startTime}-${d.endTime}`} /><InfoRow label="장소" value={d.venue} sub={d.address} /></Card></div>;
}

function TeamMatchComplete({ model }: { model: TeamMatchCreateViewModel }) {
  return <AppChrome title="팀매치 만들기 완료" activeTab="teamMatches" bottomNav={false} backHref="/team-matches"><div className="tm-create-shell"><EmptyState title="팀매치가 만들어졌어요" sub="먼저 우리 팀에게 공유해서 참가 가능 여부와 운영 준비를 확인할 수 있습니다." /><Card pad={16} style={{ marginTop: 22, background: 'var(--blue50)' }}><div className="tm-text-body-lg">{model.selectedTeam} 팀 채팅</div><div className="tm-text-caption" style={{ marginTop: 4 }}>14명에게 팀매치 링크와 경기조건을 공유</div></Card>{['팀 채팅에 공유', '초대 링크 복사', '상대팀 후보에게 보내기'].map((item, index) => <Card key={item} pad={14} className={index === 0 ? 'tm-create-selected' : ''} style={{ marginTop: 10 }}><div className="tm-text-label">{item}</div><div className="tm-text-caption" style={{ marginTop: 5 }}>{model.draft.title} 경기조건을 공유합니다.</div></Card>)}</div><div className="tm-fixed-cta tm-create-fixed-cta"><div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}><Link className="tm-btn tm-btn-lg tm-btn-neutral" href="/team-matches/team-match-1">상세 보기</Link><button className="tm-btn tm-btn-lg tm-btn-primary" type="button">팀 채팅에 공유</button></div></div></AppChrome>;
}

function InfoRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="tm-info-row"><div className="tm-text-caption">{label}</div><div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}><div className="tm-text-label">{value}</div>{sub ? <div className="tm-text-micro" style={{ marginTop: 3, color: 'var(--text-caption)' }}>{sub}</div> : null}</div></div>;
}

function StateCard({ tone, title, body }: { tone: 'orange' | 'green'; title: string; body: string }) {
  return <Card pad={14} style={{ marginTop: 14, background: tone === 'green' ? 'rgba(3,178,108,.08)' : 'rgba(254,152,0,.10)' }}><div className="tm-text-label" style={{ color: tone === 'green' ? 'var(--green500)' : 'var(--orange500)' }}>{title}</div><div className="tm-text-caption" style={{ marginTop: 5 }}>{body}</div></Card>;
}

function CreateProgress({ step, edit }: { step: number; edit: boolean }) {
  return <div className="tm-create-progress"><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><span className={`tm-badge ${edit ? 'tm-badge-orange' : 'tm-badge-blue'}`}>{edit ? '수정' : `Step ${step}/6`}</span><span className="tm-text-caption">{edit ? '기존 값 유지 · 변경사항만 저장' : ['팀 선택', '종목 선택', '매치 정보', '경기조건', '장소와 시간', '작성 내용 확인'][step - 1]}</span></div>{!edit ? <div className="tm-create-bars tm-create-bars-6">{[1, 2, 3, 4, 5, 6].map((item) => <span key={item} data-active={item <= step} />)}</div> : null}</div>;
}

function CreateField({ label, value, suffix, multiline, type = 'text', onChange }: { label: string; value?: string; suffix?: string; multiline?: boolean; type?: string; onChange?: (value: string) => void }) {
  return <label className="tm-create-field"><div className="tm-text-label">{label}</div><div className={`tm-create-input ${multiline ? 'tm-create-input-multiline' : ''}`}>{onChange ? (multiline ? <textarea className="tm-create-native-input" value={value ?? ''} onChange={(event) => onChange(event.target.value)} /> : <input className="tm-create-native-input" type={type} value={value ?? ''} onChange={(event) => onChange(event.target.value)} />) : <span className="tm-text-body" style={{ color: value ? 'var(--text-strong)' : 'var(--text-caption)' }}>{value || '입력'}</span>}{suffix ? <span className="tm-text-caption">{suffix}</span> : null}</div></label>;
}

function GenderRuleSelector({ value, onChange }: { value: string; onChange?: (value: string) => void }) {
  return <div className="tm-create-field"><div className="tm-text-label">성별 조건</div><div className="tm-team-form-chip-row">{['성별 무관', '남', '여'].map((option) => <button key={option} className={`tm-chip ${value === option ? 'tm-chip-active' : ''}`} type="button" onClick={() => onChange?.(option)}>{option}</button>)}</div></div>;
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
  return '/team-matches/team-match-1';
}
