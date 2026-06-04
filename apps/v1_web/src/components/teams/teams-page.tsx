'use client';

import Link from 'next/link';
import type { PointerEvent, ReactNode } from 'react';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppChrome } from '@/components/v1-ui/shell';
import { Card, EmptyState, KPIStat, ListItem } from '@/components/v1-ui/primitives';
import { FilterIcon, PlusIcon, SearchIcon } from '@/components/v1-ui/icons';
import type {
  TeamDetailViewModel,
  TeamFormViewModel,
  TeamListViewModel,
  TeamMembersViewModel,
  TeamModel,
  TeamStateViewModel,
} from './teams.types';

export function TeamListPageView({ model }: { model: TeamListViewModel }) {
  return (
    <AppChrome
      title="팀"
      activeTab="teams"
      topBar={false}
      floatingSlot={<Link className="tm-floating-fab" href="/teams/new" aria-label="팀 만들기"><PlusIcon size={26} strokeWidth={2.3} /></Link>}
    >
      <TeamSearchBar model={model} />
      <div className="tm-team-list">
        <div className="tm-sport-chip-row">{model.chips.map((chip) => chip.href ? <Link key={chip.label} className={`tm-chip ${chip.active ? 'tm-chip-active' : ''}`} href={chip.href}>{chip.label}{typeof chip.count === 'number' ? <span className="tab-num"> {chip.count}</span> : null}</Link> : <button key={chip.label} className={`tm-chip ${chip.active ? 'tm-chip-active' : ''}`} type="button">{chip.label}{typeof chip.count === 'number' ? <span className="tab-num"> {chip.count}</span> : null}</button>)}</div>
        <div className="tm-team-summary-bar">
          <div className="tm-text-label">{model.summary.scope}</div>
          <div className="tm-text-caption tab-num">{model.summary.total}팀 · 모집중 {model.summary.recruiting} · 내 주변 {model.summary.nearby}</div>
        </div>
        {model.teams.length ? <div className="tm-team-card-stack">{model.teams.map((team) => <TeamCard key={team.id} team={team} />)}</div> : <EmptyState title="조건에 맞는 팀이 없어요" sub="다른 종목을 선택하거나 필터를 초기화해 다시 확인해 주세요." />}
      </div>
      {model.filterSheet?.open ? <TeamFilterSheet model={model} /> : null}
    </AppChrome>
  );
}

export function TeamStatePageView({ model }: { model: TeamStateViewModel }) {
  if (model.state === 'filter') return <TeamFilterPageView model={model} />;

  return (
    <AppChrome title={model.title} activeTab="teams" bottomNav={false} backHref="/teams">
      <TeamSearchBar model={model} />
      <div className="tm-team-list">
        {model.state === 'search' ? (
          <>
            <div className="tm-team-summary-bar">
              <div className="tm-text-label">검색어 `{model.query}`</div>
              <div className="tm-text-caption tab-num">{model.summary.total}팀 · 모집중 {model.summary.recruiting}</div>
            </div>
            <div className="tm-team-card-stack">{model.teams.map((team) => <TeamCard key={team.id} team={team} />)}</div>
          </>
        ) : (
          <>
            <EmptyState title={model.title} sub={model.description} />
            {model.state === 'error' ? (
              <Card pad={16} style={{ marginTop: 18, background: 'var(--grey50)' }}>
                <div className="tm-text-label">목록으로 돌아가 다시 확인해 주세요</div>
                <div className="tm-text-caption" style={{ marginTop: 6, lineHeight: 1.55 }}>
                  새로고침 후에도 같은 문제가 반복되면 잠시 뒤 다시 시도해 주세요.
                </div>
                <Link className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" href="/teams" style={{ marginTop: 14 }}>목록으로 돌아가기</Link>
              </Card>
            ) : null}
          </>
        )}
      </div>
    </AppChrome>
  );
}

function TeamFilterPageView({ model }: { model: TeamStateViewModel }) {
  return (
    <AppChrome title="필터" activeTab="teams" bottomNav={false} backHref="/teams">
      <div className="tm-create-shell">
        <section>
          <h1 className="tm-text-heading">팀 조건</h1>
          <p className="tm-text-body" style={{ marginTop: 8, lineHeight: 1.55 }}>{model.description}</p>
        </section>
        <Card pad={16}>
          <div className="tm-text-body-lg">빠른 조건</div>
          <div className="tm-sport-chip-row" style={{ marginTop: 12 }}>
            {model.chips.map((chip) => chip.href ? <Link key={chip.label} className={`tm-chip ${chip.active ? 'tm-chip-active' : ''}`} href={chip.href}>{chip.label}{typeof chip.count === 'number' ? <span className="tab-num"> {chip.count}</span> : null}</Link> : <button key={chip.label} className={`tm-chip ${chip.active ? 'tm-chip-active' : ''}`} type="button">{chip.label}{typeof chip.count === 'number' ? <span className="tab-num"> {chip.count}</span> : null}</button>)}
          </div>
        </Card>
        <Card pad={16}>
          <div className="tm-text-body-lg">가입 조건</div>
          <div className="tm-my-list-stack" style={{ marginTop: 12 }}>
            <ListItem title="지역" sub="서울 전체" trailing="변경 가능" />
            <ListItem title="모집 상태" sub="모집중 우선" trailing="1개" />
            <ListItem title="활동 빈도" sub="주 1회 이상" trailing="1개" />
          </div>
        </Card>
      </div>
      <div className="tm-fixed-cta">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
          <Link className="tm-btn tm-btn-lg tm-btn-neutral" href="/teams">초기화</Link>
          <Link className="tm-btn tm-btn-lg tm-btn-primary" href="/teams">{model.teams.length}개 결과 보기</Link>
        </div>
      </div>
    </AppChrome>
  );
}

export function TeamDetailPageView({ model }: { model: TeamDetailViewModel }) {
  const { team, mode } = model;
  const locked = mode === 'pending' || mode === 'closed';
  const cta = model.ctaLabel ?? (mode === 'mine' ? '팀 관리' : mode === 'pending' ? '신청 상태 보기' : mode === 'closed' ? '모집 알림 받기' : '가입 신청');
  const ctaTone = mode === 'pending' ? 'tm-btn-warning' : mode === 'closed' ? 'tm-btn-neutral' : 'tm-btn-primary';
  return (
    <AppChrome title="팀 상세" activeTab="teams" bottomNav={false} backHref="/teams">
      <article className="tm-team-detail-body">
        <Card pad={18} className="tm-team-detail-hero-card">
          <TeamLogo team={team} large />
          <h1 className="tm-text-heading" style={{ color: 'var(--static-white)', marginTop: 14 }}>{team.name}</h1>
          <div className="tm-text-caption" style={{ color: 'rgba(255,255,255,.72)', marginTop: 4 }}>{team.sport} · {team.region}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
            <span className={`tm-badge ${teamDetailStatusBadgeClass(mode)}`}>{team.statusLabel}</span>
            <span className="tm-badge tm-badge-grey">{team.members}명</span>
          </div>
        </Card>
        <SectionTitle title="팀 기본 정보" sub="가입 전 필요한 정보를 확인해 주세요." />
        <Card pad={16}>
          <InfoRow label="팀명" value={team.name} />
          <InfoChips label="종목" items={team.sports} />
          <InfoRow label="팀 소개" value={team.description} />
          <InfoRow label="시/도" value={team.city} />
          <InfoRow label="구/군" value={team.county} />
          <InfoRow label="레벨" value={team.level} />
          <InfoRow label="성별 조건" value={team.genderRule} />
          <InfoRow label="모집 여부" value={`${team.statusLabel} · ${team.activity}`} />
          <InfoRow label="정기 일정" value={team.schedule} />
        </Card>
        <SectionTitle title="SNS 및 링크" sub="팀에서 공개한 연락처와 링크입니다." />
        <Card pad={16}>
          <InfoRow label="연락처" value={team.contact} />
          {team.links.map((link) => <InfoRow key={link.label} label={link.label} value={link.value} muted={link.value.includes('없음')} />)}
        </Card>
        <Card pad={16} style={{ marginTop: 14 }}>
          <div className="tm-section-row" style={{ marginTop: 0 }}>
            <div>
              <div className="tm-text-body-lg">주요 멤버</div>
              <div className="tm-text-caption" style={{ marginTop: 2 }}>팀장/운영진과 최근 활동 멤버</div>
            </div>
            <Link className="tm-btn tm-btn-sm tm-btn-neutral" href={`/teams/${team.id}/members`}>멤버</Link>
          </div>
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>{team.membersList.map((member) => <ListItem key={member.name} title={member.name} sub={`${member.role} · ${member.meta} · ${member.status}`} trailing={member.visibility} />)}</div>
        </Card>
      </article>
      <div className="tm-fixed-cta"><div className="tm-text-caption" style={{ marginBottom: 8 }}>{locked ? '상태를 확인한 뒤 다음 행동을 선택합니다.' : '신청 전 팀 정보와 내 프로필 공개 범위를 확인합니다.'}</div><button className={`tm-btn tm-btn-lg ${ctaTone} tm-btn-block`} type="button" disabled={!model.onCta || model.ctaPending} onClick={model.onCta}>{model.ctaPending ? '처리 중' : cta}</button></div>
    </AppChrome>
  );
}

function teamDetailStatusBadgeClass(mode: TeamDetailViewModel['mode']) {
  if (mode === 'pending') return 'tm-badge-orange';
  if (mode === 'mine') return 'tm-badge-green';
  if (mode === 'closed') return 'tm-badge-grey';
  return 'tm-badge-blue';
}

export function TeamFormPageView({ model }: { model: TeamFormViewModel }) {
  const edit = model.mode === 'edit';
  const team = model.team;
  const form = model.form;
  return (
    <AppChrome title={edit ? '팀 수정' : '팀 만들기'} activeTab="teams" bottomNav={false} backHref="/teams">
      <div className="tm-create-shell">
        {!edit ? <TeamCreateProgress /> : null}
        <h1 className="tm-text-heading">{edit ? '팀 정보를 수정해요' : '새 팀을 만들어요'}</h1>
        {form?.error ? <Card pad={14} style={{ marginTop: 14, background: 'var(--red50)' }}><div className="tm-text-label">저장할 수 없어요</div><div className="tm-text-caption" style={{ marginTop: 5 }}>{form.error}</div></Card> : null}
        <CreateField label="팀 이름" value={team.name} placeholder="예: 성수 풋살 크루" onChange={(value) => form?.onFieldChange('name', value)} />
        <div className="tm-create-field">
          <div className="tm-text-label">종목</div>
          <div className="tm-team-form-chip-row">{(form?.sports.map((sport) => sport.name) ?? ['축구', '풋살', '러닝', '수영']).map((sport) => <button key={sport} className={`tm-chip ${team.sports.includes(sport) ? 'tm-chip-active' : ''}`} type="button" onClick={() => form?.onSportChange(form.sports.find((item) => item.name === sport)?.id ?? '')}>{sport}</button>)}</div>
        </div>
        <RegionSelect value={form?.regionId ?? ''} regions={form?.regions ?? []} onChange={form?.onRegionChange} />
        <CreateField label="팀 소개" value={team.description} placeholder="예: 주 1회 꾸준히 함께 경기할 멤버를 찾습니다." multiline onChange={(value) => form?.onFieldChange('description', value)} />
        <div className="tm-create-two-col"><TeamLevelSelect value={team.level} onChange={(value) => form?.onFieldChange('level', value)} /><TeamCapacityField value={team.capacity} onChange={(value) => form?.onFieldChange('capacity', value)} /></div>
        <GenderRuleSelector value={team.genderRule} onChange={(value) => form?.onFieldChange('genderRule', value)} />
        <CreateField label="활동 방식" value={team.activity} placeholder="예: 평일 저녁 · 주 1회" onChange={(value) => form?.onFieldChange('activity', value)} />
        <CreateField label="연락처" value={team.contact} placeholder="예: 오픈채팅 링크 또는 이메일" onChange={(value) => form?.onFieldChange('contact', value)} />
        {team.links.map((link, index) => <CreateField key={link.label} label={link.label} value={link.value} placeholder={link.label === 'Instagram' ? '예: https://instagram.com/team-name' : '예: https://open.kakao.com/team-name'} onChange={(value) => {
          const next = [...team.links];
          next[index] = { ...link, value };
          form?.onFieldChange('links', next);
        }} />)}
      </div>
      <div className="tm-fixed-cta"><div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}><Link className="tm-btn tm-btn-lg tm-btn-neutral" href={edit ? '/teams' : '/teams'}>{edit ? '취소' : '이전'}</Link><button className="tm-btn tm-btn-lg tm-btn-primary" type="button" disabled={form?.submitting} onClick={form?.onSubmit}>{form?.submitting ? '저장 중' : edit ? '저장' : '팀 만들기'}</button></div></div>
    </AppChrome>
  );
}

export function TeamMembersPageView({ model }: { model: TeamMembersViewModel }) {
  return (
    <AppChrome title="멤버 관리" activeTab="teams" bottomNav={false}>
      <div className="tm-team-list">
        <h1 className="tm-text-heading">{model.teamName}</h1>
        <div className="tm-team-stat-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <Card pad={12}><KPIStat label="전체" value={model.summary.total} unit="명" /></Card>
          <Card pad={12}><KPIStat label="관리자" value={model.summary.managers} unit="명" /></Card>
          <Card pad={12}><KPIStat label="검토" value={model.summary.pending} unit="명" /></Card>
        </div>
        <Card pad={14} style={{ background: 'var(--grey50)', marginTop: 14 }}>
          <div className="tm-text-label">권한 규칙</div>
          <div className="tm-text-caption" style={{ marginTop: 5 }}>팀장과 관리자는 일반 멤버 권한을 변경할 수 있습니다. 팀장 위임은 별도 플로우가 필요합니다.</div>
        </Card>
        <MemberSection title="팀 멤버" sub="이미 팀에 속한 멤버의 역할과 권한을 관리합니다.">
          {model.members.map((member) => <MemberCard key={member.name} title={member.name} sub={`${member.role} · ${member.meta}`} status={member.status} locked={member.locked} onPromote={member.onPromote} onDemote={member.onDemote} onRemove={member.onRemove} actionPending={member.actionPending} />)}
        </MemberSection>
        <MemberSection title="가입 신청" sub="아직 팀원이 아닌 신청자는 별도 그룹에서 승인/거절합니다.">
          {model.requests.map((request) => <MemberCard key={request.name} title={request.name} sub={request.meta} status={request.status} pending onApprove={request.onApprove} onReject={request.onReject} actionPending={request.actionPending} />)}
        </MemberSection>
      </div>
    </AppChrome>
  );
}

function TeamSearchBar({ model }: { model: TeamListViewModel }) {
  return (
    <div className="tm-list-searchbar">
      <form
        className="tm-list-search-form"
        onBlur={(event) => {
          if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
            model.search?.onBlur();
          }
        }}
        onSubmit={(event) => {
          event.preventDefault();
          model.search?.onSubmit();
        }}
      >
        <div className={`tm-list-search-input tm-list-search-input-field ${model.search?.isOpen ? 'tm-list-search-input-active' : ''}`} aria-label="팀 검색">
          <input
            aria-label="팀 검색어"
            className="tm-list-search-field"
            onChange={(event) => model.search?.onChange(event.target.value)}
            onFocus={model.search?.onFocus}
            placeholder={model.search?.placeholder ?? model.placeholder}
            readOnly={!model.search}
            value={model.search?.value ?? model.query}
          />
          {model.search?.value ? (
            <button className="tm-list-search-clear" type="button" aria-label="검색어 지우기" onClick={model.search.onClear}>×</button>
          ) : null}
          <button className="tm-list-search-submit" type="submit" aria-label="검색">
            <SearchIcon size={19} strokeWidth={2} />
          </button>
        </div>
        {model.search?.isOpen ? (
          <div className="tm-list-search-dropdown">
            <div className="tm-list-search-dropdown-title">최근 검색</div>
            {model.search.isLoading ? <div className="tm-list-search-empty">불러오는 중</div> : null}
            {!model.search.isLoading && model.search.recentItems.length === 0 ? <div className="tm-list-search-empty">최근 검색어가 없습니다</div> : null}
            {model.search.recentItems.map((item) => (
              <button key={item.id} className="tm-list-search-recent" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => model.search?.onSelectRecent(item.query)}>
                <span>{item.query}</span>
                <SearchIcon size={16} strokeWidth={2} />
              </button>
            ))}
          </div>
        ) : null}
      </form>
      <Link className="tm-list-filter-button" href={model.filterHref ?? '/teams?filter=1'} aria-label="필터">
        <FilterIcon size={21} strokeWidth={2} />
        {model.filterCount > 0 ? <span className="tm-list-filter-count tab-num">{model.filterCount}</span> : null}
      </Link>
    </div>
  );
}

function TeamFilterSheet({ model }: { model: TeamListViewModel }) {
  const sheet = model.filterSheet;
  if (!sheet) return null;

  return (
    <>
      <Link className="tm-filter-scrim" href={sheet.closeHref} aria-label="필터 닫기" />
      <DraggableFilterSheet closeHref={sheet.closeHref} ariaLabel="팀 필터">
        <div className="tm-filter-sheet-handle" />
        <div className="tm-filter-sheet-head">
          <div>
            <div className="tm-text-subhead">필터</div>
            <div className="tm-text-caption" style={{ marginTop: 2 }}>정렬과 팀 조건을 sheet에서 조정합니다.</div>
          </div>
          <Link className="tm-btn tm-btn-sm tm-btn-ghost" href={sheet.resetHref} style={{ color: 'var(--text-caption)' }}>초기화</Link>
        </div>
        {[
          ['정렬', sheet.sortOptions],
          ['성별 조건', sheet.genderOptions],
          ['레벨', sheet.levelOptions],
        ].map(([title, options]) => (
          <div key={title as string} className="tm-filter-section">
            <div className="tm-text-label">{title as string}</div>
            <div className="tm-filter-chip-wrap">
              {(options as Array<{ label: string; value: string; href: string; active?: boolean }>).map((option) => (
                <Link key={option.value} className={`tm-chip ${option.active ? 'tm-chip-active' : ''}`} href={option.href}>{option.label}</Link>
              ))}
            </div>
          </div>
        ))}
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

function TeamCard({ team }: { team: TeamModel }) {
  return (
    <Link className="tm-team-card tm-pressable" href={`/teams/${team.id}`}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <TeamLogo team={team} />
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div className="tm-text-body-lg line-clamp-2">{team.name}</div><span className={`tm-badge ${team.status === 'closed' ? 'tm-badge-grey' : team.status === 'reviewing' ? 'tm-badge-orange' : 'tm-badge-blue'}`}>{team.statusLabel}</span></div><div className="tm-text-caption" style={{ marginTop: 4 }}>{team.sport} · {team.region} · {team.members}명</div><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>{[...team.tags, team.genderRule].map((tag) => <span key={tag} className="tm-badge tm-badge-grey">{tag}</span>)}</div></div>
      </div>
      <div className="tm-team-intro-box">
        <div className="tm-text-label">팀소개</div>
        <div className="tm-text-body" style={{ marginTop: 6, color: 'var(--text-muted)', lineHeight: 1.5 }}>{team.intro}</div>
      </div>
      <div className="tm-team-card-footer"><span className="tm-text-caption">{team.next}</span><span className={`tm-btn tm-btn-sm ${team.status === 'closed' ? 'tm-btn-neutral' : 'tm-btn-primary'}`}>{team.status === 'closed' ? '알림받기' : '팀 보기'}</span></div>
    </Link>
  );
}

function TeamLogo({ team, large }: { team: Pick<TeamModel, 'logo'>; large?: boolean }) {
  return <div className={`tm-team-logo ${large ? 'tm-team-logo-large' : ''}`}>{team.logo}</div>;
}

function SectionTitle({ title, sub }: { title: string; sub: string }) {
  return <div className="tm-section-title"><div className="tm-text-body-lg">{title}</div><div className="tm-text-caption" style={{ marginTop: 3 }}>{sub}</div></div>;
}

function InfoRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return <div className="tm-team-info-row"><div className="tm-text-caption" style={{ color: 'var(--text-caption)', fontWeight: 600 }}>{label}</div><div className="tm-text-body" style={{ color: muted ? 'var(--text-muted)' : 'var(--text-strong)' }}>{value}</div></div>;
}

function InfoChips({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="tm-team-info-block">
      <div className="tm-text-caption" style={{ color: 'var(--text-caption)', fontWeight: 600, marginBottom: 8 }}>{label}</div>
      <div className="tm-team-form-chip-row">{items.map((item) => <span key={item} className="tm-chip tm-chip-active">{item}</span>)}</div>
    </div>
  );
}

function TeamCreateProgress() {
  return (
    <div className="tm-create-progress">
      <div className="tm-text-caption">1단계 / 1단계</div>
      <div className="tm-create-bars"><span data-active="true" /></div>
    </div>
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

function TeamLevelSelect({ value, onChange }: { value: string; onChange?: (value: string) => void }) {
  const options = ['전체 레벨', '입문', '초보', '초보-중수', '중수', '중수-고수', '고수'];
  const normalized = options.includes(value) ? value : '전체 레벨';

  return (
    <label className="tm-create-field">
      <div className="tm-text-label">레벨</div>
      <select className="tm-create-input tm-create-select-control" value={normalized} onChange={(event) => onChange?.(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function TeamCapacityField({ value, onChange }: { value: number; onChange?: (value: number) => void }) {
  const options = Array.from({ length: 49 }, (_, index) => index + 2);
  const normalized = Math.min(50, Math.max(2, Number(value) || 2));

  return (
    <div className="tm-create-field">
      <div className="tm-text-label">정원</div>
      <div className="tm-create-stepper">
        <button className="tm-create-stepper-button" type="button" onClick={() => onChange?.(Math.max(2, normalized - 1))}>-</button>
        <select className="tm-create-input tm-create-select-control" value={normalized} onChange={(event) => onChange?.(Number(event.target.value))}>
          {options.map((item) => <option key={item} value={item}>{item}명</option>)}
        </select>
        <button className="tm-create-stepper-button" type="button" onClick={() => onChange?.(Math.min(50, normalized + 1))}>+</button>
      </div>
    </div>
  );
}

function MemberSection({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return <section className="tm-member-section"><div className="tm-text-label">{title}</div><div className="tm-text-caption" style={{ marginTop: 3 }}>{sub}</div><div style={{ display: 'grid', gap: 10, marginTop: 10 }}>{children}</div></section>;
}

function MemberCard({ title, sub, status, pending, locked, onPromote, onDemote, onRemove, onApprove, onReject, actionPending }: { title: string; sub: string; status: string; pending?: boolean; locked?: boolean; onPromote?: () => void; onDemote?: () => void; onRemove?: () => void; onApprove?: () => void; onReject?: () => void; actionPending?: boolean }) {
  return (
    <Card pad={14}>
      <ListItem title={title} sub={sub} trailing={status} />
      <div className="tm-member-actions">
        {pending ? <button className="tm-btn tm-btn-sm tm-btn-primary" type="button" disabled={!onApprove || actionPending} onClick={onApprove}>승인</button> : <button className="tm-btn tm-btn-sm tm-btn-neutral" type="button" disabled={locked || actionPending || (!onPromote && !onDemote)} onClick={onPromote ?? onDemote}>{locked ? '권한 고정' : onDemote ? '멤버로 변경' : '운영진 지정'}</button>}
        {pending ? <button className="tm-btn tm-btn-sm tm-btn-neutral" type="button" disabled={!onReject || actionPending} onClick={onReject}>거절</button> : <button className="tm-btn tm-btn-sm tm-btn-neutral" type="button" disabled={locked || !onRemove || actionPending} onClick={onRemove}>내보내기</button>}
      </div>
    </Card>
  );
}

function CreateField({ label, value, placeholder, suffix, multiline, type = 'text', onChange }: { label: string; value: string; placeholder?: string; suffix?: string; multiline?: boolean; type?: string; onChange?: (value: string) => void }) {
  return <label className="tm-create-field"><div className="tm-text-label">{label}</div><div className={`tm-create-input ${multiline ? 'tm-create-input-multiline' : ''}`}>{onChange ? (multiline ? <textarea className="tm-create-native-input" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /> : <input className="tm-create-native-input" type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />) : <span className="tm-text-body" style={{ color: value ? 'var(--text-strong)' : 'var(--text-caption)' }}>{value || placeholder}</span>}{suffix ? <span className="tm-text-caption">{suffix}</span> : null}</div></label>;
}

function RegionSelect({ value, regions, onChange }: { value: string; regions: Array<{ id: string; name: string }>; onChange?: (regionId: string) => void }) {
  return <label className="tm-create-field"><div className="tm-text-label">활동 지역</div><select className="tm-create-input tm-create-select-control" value={value} onChange={(event) => onChange?.(event.target.value)}><option value="">시/군/구 선택</option>{regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}</select><div className="tm-text-caption" style={{ marginTop: 6 }}>팀 추천과 지역 검색에 사용할 기준 지역입니다. 상세 활동 장소는 활동 방식에 적어주세요.</div></label>;
}
