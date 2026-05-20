import Link from 'next/link';
import type { ReactNode } from 'react';
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
        <div className="tm-sport-chip-row">{model.chips.map((chip) => <button key={chip.label} className={`tm-chip ${chip.active ? 'tm-chip-active' : ''}`} type="button">{chip.label}</button>)}</div>
        <div className="tm-team-summary-bar">
          <div className="tm-text-label">{model.summary.scope}</div>
          <div className="tm-text-caption tab-num">{model.summary.total}팀 · 모집중 {model.summary.recruiting} · 내 주변 {model.summary.nearby}</div>
        </div>
        <div className="tm-section-row">
          <div>
            <div className="tm-text-label">팀 둘러보기</div>
            <div className="tm-text-caption" style={{ marginTop: 2 }}>검색/필터 조건을 유지한 팀 목록입니다.</div>
          </div>
          <span className="tm-badge tm-badge-blue">검색/필터</span>
        </div>
        <div className="tm-team-card-stack">{model.teams.map((team, index) => <TeamCard key={team.id} team={team} selected={index === 0} />)}</div>
      </div>
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
            <div className="tm-team-card-stack">{model.teams.map((team, index) => <TeamCard key={team.id} team={team} selected={index === 0} />)}</div>
          </>
        ) : (
          <>
            <EmptyState title={model.title} sub={model.description} />
            {model.state === 'error' ? (
              <Card pad={16} style={{ marginTop: 18, background: 'var(--grey50)' }}>
                <div className="tm-text-label">아직 재시도 API가 연결되지 않았어요</div>
                <div className="tm-text-caption" style={{ marginTop: 6, lineHeight: 1.55 }}>
                  지금은 목록으로 돌아가 상태를 확인할 수 있고, 실제 재시도 mutation은 API 바인딩 후 연결합니다.
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
            {model.chips.map((chip) => <button key={chip.label} className={`tm-chip ${chip.active ? 'tm-chip-active' : ''}`} type="button">{chip.label}</button>)}
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
  const cta = mode === 'mine' ? '팀 관리' : mode === 'pending' ? '신청 상태 보기' : mode === 'closed' ? '모집 알림 받기' : '가입 가능 여부 확인';
  return (
    <AppChrome title="팀 상세" activeTab="teams" bottomNav={false} backHref="/teams">
      <article className="tm-team-detail-body">
        <Card pad={18} className="tm-team-detail-hero-card">
          <TeamLogo team={team} large />
          <h1 className="tm-text-heading" style={{ color: 'var(--static-white)', marginTop: 14 }}>{team.name}</h1>
          <div className="tm-text-caption" style={{ color: 'rgba(255,255,255,.72)', marginTop: 4 }}>{team.sport} · {team.region} · 매너 {team.manner}</div>
        </Card>
        <SectionTitle title="팀 기본 정보" sub="필수값과 선택값을 구분해 확인합니다." />
        <Card pad={16}>
          <InfoRow label="팀명" value={team.name} required />
          <InfoChips label="종목 (복수 선택 가능)" items={team.sports} required />
          <InfoRow label="팀 소개" value={team.description} />
          <InfoRow label="시/도" value={team.city} required />
          <InfoRow label="구/군" value={team.county} />
          <InfoRow label="레벨" value={team.level} />
          <InfoRow label="모집 여부" value={`${team.statusLabel} · ${team.activity}`} />
          <InfoRow label="신뢰 신호" value={team.trustNote} />
          <InfoRow label="정기 일정" value={team.schedule} />
        </Card>
        <SectionTitle title="SNS 및 링크" sub="저장된 연락처와 외부 링크만 표시합니다." />
        <Card pad={16}>
          <InfoRow label="연락처" value={team.contact} />
          {team.links.map((link) => <InfoRow key={link.label} label={link.label} value={link.value} muted={link.value.includes('없음')} />)}
        </Card>
        <SectionTitle title="이미지" sub="업로드 이미지와 예시 이미지를 분리합니다." />
        <div className="tm-team-image-grid">
          {team.images.map((image) => <ImageSlot key={image.title} {...image} />)}
        </div>
        <Card pad={16} style={{ marginTop: 14 }}>
          <div className="tm-section-row" style={{ marginTop: 0 }}>
            <div>
              <div className="tm-text-body-lg">주요 멤버</div>
              <div className="tm-text-caption" style={{ marginTop: 2 }}>팀장/운영진과 최근 활동 멤버</div>
            </div>
            <Link className="tm-btn tm-btn-sm tm-btn-neutral" href="/teams/team-1/members">멤버</Link>
          </div>
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>{team.membersList.map((member) => <ListItem key={member.name} title={member.name} sub={`${member.role} · ${member.meta}`} trailing={member.status} />)}</div>
        </Card>
      </article>
      <div className="tm-fixed-cta"><div className="tm-text-caption" style={{ marginBottom: 8 }}>{locked ? '상태를 확인한 뒤 다음 행동을 선택합니다.' : '신청 전 팀 정보와 내 프로필 공개 범위를 확인합니다.'}</div><button className={`tm-btn tm-btn-lg ${locked ? 'tm-btn-neutral' : 'tm-btn-primary'} tm-btn-block`} type="button">{cta}</button></div>
    </AppChrome>
  );
}

export function TeamFormPageView({ model }: { model: TeamFormViewModel }) {
  const edit = model.mode === 'edit';
  const team = model.team;
  return (
    <AppChrome title={edit ? '팀 수정' : '팀 만들기'} activeTab="teams" bottomNav={false}>
      <div className="tm-create-shell">
        <h1 className="tm-text-heading">{edit ? '팀 정보를 수정해요' : '새 팀을 만들어요'}</h1>
        <p className="tm-text-body" style={{ marginTop: 8 }}>목록과 상세에 저장되는 정보만 노출하고, 예시 이미지는 제출 데이터에 포함하지 않습니다.</p>
        <CreateField label="팀 이름" value={team.name} />
        <div className="tm-create-field">
          <div className="tm-text-label">종목 (복수 선택 가능)</div>
          <div className="tm-team-form-chip-row">{['축구', '풋살', '농구', '배드민턴', '테니스'].map((sport) => <span key={sport} className={`tm-chip ${team.sports.includes(sport) ? 'tm-chip-active' : ''}`}>{sport}</span>)}</div>
        </div>
        <div className="tm-create-two-col"><CreateField label="시/도" value={team.city} /><CreateField label="구/군" value={team.county} /></div>
        <CreateField label="팀 소개" value={team.description} multiline />
        <div className="tm-create-two-col"><CreateField label="레벨" value={team.level} /><CreateField label="정원" value={`${team.capacity}`} suffix="명" /></div>
        <CreateField label="활동 방식" value={team.activity} />
        <CreateField label="연락처" value={team.contact} />
        {team.links.map((link) => <CreateField key={link.label} label={link.label} value={link.value} />)}
        <div className="tm-team-image-grid" style={{ marginTop: 14 }}>
          <ImageSlot title="로고 이미지" count={edit ? 1 : 0} />
          <ImageSlot title="커버 이미지" count={edit ? 1 : 0} />
          <ImageSlot title="예시 이미지" count={2} example />
        </div>
        <Card pad={14} style={{ marginTop: 14, background: edit ? 'var(--orange50)' : 'var(--blue50)' }}><div className="tm-text-label">{edit ? '변경사항 저장' : '생성 후 상태'}</div><div className="tm-text-caption" style={{ marginTop: 5 }}>{edit ? '팀장 또는 운영진 권한 확인 후 저장됩니다. 현재 화면은 저장 API 연결 전 입력 유지 상태입니다.' : '생성 직후 팀장은 관리자 권한을 갖고 멤버 초대를 시작합니다. 현재 화면은 저장 API 연결 전 준비 상태입니다.'}</div></Card>
      </div>
      <div className="tm-fixed-cta"><div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}><Link className="tm-btn tm-btn-lg tm-btn-neutral" href={edit ? '/teams/team-1' : '/teams'}>{edit ? '취소' : '이전'}</Link><button className="tm-btn tm-btn-lg tm-btn-neutral" type="button" disabled>{edit ? '저장 준비중' : '생성 준비중'}</button></div></div>
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
          {model.members.map((member) => <MemberCard key={member.name} title={member.name} sub={`${member.role} · ${member.meta}`} status={member.status} locked={member.locked} />)}
        </MemberSection>
        <MemberSection title="가입 신청" sub="아직 팀원이 아닌 신청자는 별도 그룹에서 승인/거절합니다.">
          {model.requests.map((request) => <MemberCard key={request.name} title={request.name} sub={request.meta} status={request.status} pending />)}
        </MemberSection>
      </div>
    </AppChrome>
  );
}

function TeamSearchBar({ model }: { model: TeamListViewModel }) {
  return (
    <div className="tm-list-searchbar">
      <Link className="tm-list-search-input" href="/teams/search" aria-label="팀 검색">
        <span className="tm-list-search-text">{model.query || model.placeholder}</span>
        <SearchIcon size={19} strokeWidth={2} />
      </Link>
      <Link className="tm-list-filter-button" href="/teams/filter" aria-label={`필터 ${model.filterCount}개 적용`}>
        <FilterIcon size={21} strokeWidth={2} />
        <span className="tm-list-filter-count tab-num">{model.filterCount}</span>
      </Link>
    </div>
  );
}

function TeamCard({ team, selected }: { team: TeamModel; selected?: boolean }) {
  return (
    <Link className={`tm-team-card tm-pressable ${selected ? 'tm-team-card-selected' : ''}`} href={`/teams/${team.id}`}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <TeamLogo team={team} />
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div className="tm-text-body-lg line-clamp-2">{team.name}</div><span className={`tm-badge ${team.status === 'closed' ? 'tm-badge-grey' : team.status === 'reviewing' ? 'tm-badge-orange' : 'tm-badge-blue'}`}>{team.statusLabel}</span></div><div className="tm-text-caption" style={{ marginTop: 4 }}>{team.sport} · {team.region} · {team.members}명</div><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>{team.tags.map((tag) => <span key={tag} className="tm-badge tm-badge-grey">{tag}</span>)}</div></div>
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

function InfoRow({ label, value, required, muted }: { label: string; value: string; required?: boolean; muted?: boolean }) {
  return <div className="tm-team-info-row"><div className="tm-text-caption" style={{ color: required ? 'var(--text-strong)' : 'var(--text-caption)', fontWeight: required ? 800 : 600 }}>{label}{required ? '*' : ''}</div><div className="tm-text-body" style={{ color: muted ? 'var(--text-muted)' : 'var(--text-strong)' }}>{value}</div></div>;
}

function InfoChips({ label, items, required }: { label: string; items: string[]; required?: boolean }) {
  return (
    <div className="tm-team-info-block">
      <div className="tm-text-caption" style={{ color: required ? 'var(--text-strong)' : 'var(--text-caption)', fontWeight: required ? 800 : 600, marginBottom: 8 }}>{label}{required ? '*' : ''}</div>
      <div className="tm-team-form-chip-row">{items.map((item) => <span key={item} className="tm-chip tm-chip-active">{item}</span>)}</div>
      <div className="tm-text-micro" style={{ color: 'var(--blue500)', marginTop: 8 }}>{items.length}개 종목 선택됨</div>
    </div>
  );
}

function ImageSlot({ title, count, max, example }: { title: string; count: number; max?: number; example?: boolean }) {
  const slots = Array.from({ length: Math.max(count, 1) });
  return (
    <div className="tm-team-image-slot">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <div className="tm-text-label">{title}</div>
        <span className={`tm-badge ${example ? 'tm-badge-orange' : 'tm-badge-blue'}`}>{example ? '예시 이미지' : '기존 이미지'}</span>
      </div>
      <div className="tm-team-thumb-row">
        {slots.map((_, index) => <div key={index} className={`tm-team-thumb ${example ? 'tm-team-thumb-example' : ''}`}>{count === 0 ? '업로드 전' : example ? `예시 이미지 ${index + 1}` : `업로드된 이미지 ${index + 1}`}</div>)}
        <button className="tm-btn tm-btn-sm tm-btn-neutral" type="button">추가</button>
      </div>
      <div className="tm-text-micro" style={{ marginTop: 8, color: 'var(--text-caption)' }}>{max ? `${count}/${max} · ` : ''}선택된 파일 없음</div>
      <div className="tm-text-micro" style={{ marginTop: 4, color: 'var(--text-caption)' }}>{example ? '예시 이미지는 제출 데이터에 포함되지 않아요.' : '업로드한 이미지만 저장됩니다.'}</div>
    </div>
  );
}

function MemberSection({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return <section className="tm-member-section"><div className="tm-text-label">{title}</div><div className="tm-text-caption" style={{ marginTop: 3 }}>{sub}</div><div style={{ display: 'grid', gap: 10, marginTop: 10 }}>{children}</div></section>;
}

function MemberCard({ title, sub, status, pending, locked }: { title: string; sub: string; status: string; pending?: boolean; locked?: boolean }) {
  return (
    <Card pad={14}>
      <ListItem title={title} sub={sub} trailing={status} />
      <div className="tm-member-actions">
        <button className="tm-btn tm-btn-sm tm-btn-neutral" type="button" disabled={locked}>{locked ? '권한 고정' : pending ? '승인 대기' : '권한 변경'}</button>
        {pending ? <button className="tm-btn tm-btn-sm tm-btn-neutral" type="button" disabled>거절 대기</button> : null}
      </div>
    </Card>
  );
}

function CreateField({ label, value, suffix, multiline }: { label: string; value: string; suffix?: string; multiline?: boolean }) {
  return <div className="tm-create-field"><div className="tm-text-label">{label}</div><div className={`tm-create-input ${multiline ? 'tm-create-input-multiline' : ''}`}><span className="tm-text-body" style={{ color: 'var(--text-strong)' }}>{value}</span>{suffix ? <span className="tm-text-caption">{suffix}</span> : null}</div></div>;
}
