'use client';

import Link from 'next/link';
import type { PointerEvent, ReactNode } from 'react';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppChrome } from '@/components/v1-ui/shell';
import { Card, EmptyState, KPIStat, ListItem } from '@/components/v1-ui/primitives';
import { ChevronLeftIcon, FilterIcon, PlusIcon, SearchIcon, ShareIcon } from '@/components/v1-ui/icons';
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
      floatingSlot={<Link className="tm-floating-fab tm-hide-desktop" href="/teams/new" aria-label="팀 만들기"><PlusIcon size={26} strokeWidth={2.3} /></Link>}
    >
      {/* Desktop-only page header with inline create CTA */}
      <div className="tm-team-desktop-header tm-show-desktop">
        <h1 className="tm-team-desktop-header-title">팀</h1>
        <Link className="tm-team-desktop-create-btn" href="/teams/new">
          <PlusIcon size={18} strokeWidth={2.5} aria-hidden="true" />
          팀 만들기
        </Link>
      </div>
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
      {/* Desktop back header for search/empty/error states */}
      <div className="tm-desktop-page-head tm-show-desktop">
        <Link className="tm-desktop-back" href="/teams" aria-label="팀 목록으로">
          <ChevronLeftIcon size={22} strokeWidth={2.2} aria-hidden="true" />
        </Link>
        <h1 className="tm-text-heading">{model.title}</h1>
      </div>
      {model.state === 'restricted' ? null : <TeamSearchBar model={model} />}
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
              <Card pad={16} className="tm-team-state-error-card" style={{ marginTop: 18, background: 'var(--grey50)' }}>
                <div className="tm-text-label">팀 목록으로 돌아가 다시 확인해 주세요</div>
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
      {/* Desktop back header */}
      <div className="tm-desktop-page-head tm-show-desktop">
        <Link className="tm-desktop-back" href="/teams" aria-label="팀 목록으로">
          <ChevronLeftIcon size={22} strokeWidth={2.2} aria-hidden="true" />
        </Link>
        <h1 className="tm-text-heading">팀 조건 필터</h1>
      </div>
      <div className="tm-create-shell tm-team-filter-shell">
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
      <div className="tm-fixed-cta tm-team-filter-cta">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
          <Link className="tm-btn tm-btn-lg tm-btn-neutral" href="/teams">초기화</Link>
          <Link className="tm-btn tm-btn-lg tm-btn-primary" href="/teams">{model.teams.length}개 결과 보기</Link>
        </div>
      </div>
    </AppChrome>
  );
}

/**
 * "이 팀의 열린 매치" — this team's recruiting team-matches (GET /team-matches?teamId).
 * Lets a prospective member judge the team's activity before requesting to join.
 * Clean v1 card style + 해요체 copy.
 */
function TeamOpenMatchesSection({
  matches,
  loading,
}: {
  matches?: TeamDetailViewModel['openMatches'];
  loading?: boolean;
}) {
  const items = matches ?? [];
  return (
    <>
      <SectionTitle title="이 팀의 열린 매치" sub="이 팀이 지금 모집 중인 경기예요." />
      {loading ? (
        <Card pad={16}>
          <div className="tm-text-caption">열린 매치를 불러오고 있어요.</div>
        </Card>
      ) : items.length ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {items.map((match) => (
            <Link
              key={match.id}
              className="tm-pressable"
              href={`/team-matches/${match.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                border: '1px solid var(--grey100)',
                borderRadius: 14,
                padding: '14px 16px',
                background: 'var(--bg)',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div className="tm-text-label" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{match.title}</div>
                <div className="tm-text-caption" style={{ marginTop: 4 }}>{[match.dateLabel, match.venue].filter(Boolean).join(' · ')}</div>
              </div>
              <span className="tm-badge tm-badge-blue" style={{ flexShrink: 0 }}>모집중</span>
            </Link>
          ))}
        </div>
      ) : (
        <Card pad={16} style={{ background: 'var(--grey50)' }}>
          <div className="tm-text-label">아직 열어둔 매치가 없어요</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>이 팀이 새 경기를 모집하면 여기에서 보여드릴게요.</div>
        </Card>
      )}
    </>
  );
}

export function TeamDetailPageView({ model }: { model: TeamDetailViewModel }) {
  const { team, mode } = model;
  const locked = mode === 'pending' || mode === 'closed';
  const cta = model.ctaLabel ?? (mode === 'mine' ? '팀 관리' : mode === 'pending' ? '신청 상태 보기' : mode === 'closed' ? '모집 알림 받기' : '가입 신청');
  const ctaTone = mode === 'pending' ? 'tm-btn-warning' : mode === 'closed' ? 'tm-btn-neutral' : 'tm-btn-primary';
  const [heroMessage, setHeroMessage] = useState('');

  const runHeroAction = (action: (() => void | Promise<void>) | undefined, successMessage: string) => {
    if (!action) return;
    void Promise.resolve(action())
      .then(() => {
        setHeroMessage(successMessage);
        window.setTimeout(() => setHeroMessage(''), 1800);
      })
      .catch(() => {
        setHeroMessage('잠시 후 다시 시도해 주세요.');
        window.setTimeout(() => setHeroMessage(''), 1800);
      });
  };

  return (
    <AppChrome title="팀 상세" activeTab="teams" bottomNav={false} backHref="/teams">
      {/* Desktop back header */}
      <div className="tm-desktop-page-head tm-show-desktop">
        <Link className="tm-desktop-back" href="/teams" aria-label="팀 목록으로">
          <ChevronLeftIcon size={22} strokeWidth={2.2} aria-hidden="true" />
        </Link>
        <h1 className="tm-text-heading">{team.name}</h1>
      </div>

      {/* Desktop 2-column layout */}
      <div className="tm-team-detail-desktop-layout tm-show-desktop">
        {/* LEFT: hero + info */}
        <div className="tm-team-detail-desktop-main">
          <Card pad={18} className="tm-team-detail-hero-card" style={{ position: 'relative' }}>
            <button
              className="tm-btn tm-btn-icon tm-btn-ghost tm-hero-button"
              type="button"
              aria-label="공유"
              onClick={() => runHeroAction(model.onShare, '공유 링크를 준비했어요')}
              style={{ position: 'absolute', top: 14, right: 14 }}
            >
              <ShareIcon size={20} />
            </button>
            <TeamLogo team={team} large />
            <h2 className="tm-text-heading" style={{ color: 'var(--static-white)', marginTop: 14 }}>{team.name}</h2>
            <div className="tm-text-caption" style={{ color: 'rgba(255,255,255,.72)', marginTop: 4 }}>{team.sport} · {team.region}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
              <span className={`tm-badge ${teamDetailStatusBadgeClass(mode)}`}>{team.statusLabel}</span>
              <span className="tm-badge tm-badge-grey">{team.members}명</span>
            </div>
          </Card>
          <TeamOpenMatchesSection matches={model.openMatches} loading={model.openMatchesLoading} />
          <SectionTitle title="팀 기본 정보" sub="가입 전 필요한 정보를 확인해 주세요." />
          <Card pad={16}>
            <InfoRow label="팀명" value={team.name} />
            <InfoChips label="종목" items={team.sports} />
            <InfoRow label="팀 소개" value={team.description} />
            <InfoRow label="시/도" value={team.city} />
            <InfoRow label="구/군" value={team.county} />
            <InfoRow label="레벨" value={team.level} />
            <InfoRow label="성별 조건" value={team.genderRule} />
            <InfoRow label="정원" value={`${team.capacity}명`} />
            <InfoRow label="모집 여부" value={`${team.statusLabel} · ${team.activity}`} />
            <InfoRow label="정기 일정" value={team.schedule} />
          </Card>
          <Card pad={16} style={{ marginTop: 14, opacity: team.memberAccess.canView ? 1 : 0.72 }}>
            <div className="tm-section-row" style={{ marginTop: 0 }}>
              <div>
                <div className="tm-text-body-lg">주요 멤버</div>
                <div className="tm-text-caption" style={{ marginTop: 2 }}>{team.memberAccess.message}</div>
              </div>
              {team.memberAccess.canView ? <Link className="tm-btn tm-btn-sm tm-btn-neutral" href={`/teams/${team.id}/members`}>멤버</Link> : <button className="tm-btn tm-btn-sm tm-btn-neutral" type="button" disabled>보기 불가</button>}
            </div>
            {team.memberAccess.canView ? <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>{team.membersList.map((member) => <ListItem key={member.name} title={member.name} sub={`${member.role} · ${member.meta} · ${member.status}`} trailing={member.visibility} />)}</div> : <div className="tm-text-caption" style={{ marginTop: 12, lineHeight: 1.55 }}>팀 멤버이고 멤버 목록이 공개된 경우에만 볼 수 있어요.</div>}
          </Card>
        </div>

        {/* RIGHT: sticky sidebar (replaces mobile fixed CTA on desktop) */}
        <aside className="tm-team-detail-desktop-sidebar">
          <div className="tm-team-detail-sidebar-identity">
            <TeamLogo team={team} />
            <div>
              <div className="tm-text-body-lg">{team.name}</div>
              <div className="tm-text-caption" style={{ marginTop: 2 }}>{team.sport} · {team.region}</div>
            </div>
          </div>
          <div className="tm-team-detail-sidebar-divider" />
          <div className="tm-team-detail-sidebar-meta">
            <span className={`tm-badge ${teamDetailStatusBadgeClass(mode)}`}>{team.statusLabel}</span>
            <span className="tm-badge tm-badge-grey">{team.members}명</span>
          </div>
          <div className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {locked ? '신청 상태를 확인하고 다음 행동을 선택해 주세요.' : '신청 전에 팀 정보와 내 프로필 공개 범위를 확인해 주세요.'}
          </div>
          {heroMessage ? <div className="tm-text-caption" role="status" style={{ color: 'var(--text-caption)', marginTop: 6 }}>{heroMessage}</div> : null}
          <div className="tm-team-detail-sidebar-cta">
            <button
              className={`tm-btn tm-btn-lg ${ctaTone} tm-btn-block`}
              type="button"
              disabled={!model.onCta || model.ctaPending}
              onClick={() => runHeroAction(model.onCta, mode === 'pending' ? '신청이 취소되었어요.' : '신청이 완료되었어요.')}
            >
              {model.ctaPending ? '처리 중' : cta}
            </button>
          </div>
        </aside>
      </div>

      {/* Mobile layout (unchanged) */}
      <article className="tm-team-detail-body tm-hide-desktop">
        <Card pad={18} className="tm-team-detail-hero-card" style={{ position: 'relative' }}>
          <button
            className="tm-btn tm-btn-icon tm-btn-ghost tm-hero-button"
            type="button"
            aria-label="공유"
            onClick={() => runHeroAction(model.onShare, '공유 링크를 준비했어요')}
            style={{ position: 'absolute', top: 14, right: 14 }}
          >
            <ShareIcon size={20} />
          </button>
          <TeamLogo team={team} large />
          <h1 className="tm-text-heading" style={{ color: 'var(--static-white)', marginTop: 14 }}>{team.name}</h1>
          <div className="tm-text-caption" style={{ color: 'rgba(255,255,255,.72)', marginTop: 4 }}>{team.sport} · {team.region}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
            <span className={`tm-badge ${teamDetailStatusBadgeClass(mode)}`}>{team.statusLabel}</span>
            <span className="tm-badge tm-badge-grey">{team.members}명</span>
          </div>
        </Card>
        <TeamOpenMatchesSection matches={model.openMatches} loading={model.openMatchesLoading} />
        <SectionTitle title="팀 기본 정보" sub="가입 전 필요한 정보를 확인해 주세요." />
        <Card pad={16}>
          <InfoRow label="팀명" value={team.name} />
          <InfoChips label="종목" items={team.sports} />
          <InfoRow label="팀 소개" value={team.description} />
          <InfoRow label="시/도" value={team.city} />
          <InfoRow label="구/군" value={team.county} />
          <InfoRow label="레벨" value={team.level} />
          <InfoRow label="성별 조건" value={team.genderRule} />
          <InfoRow label="정원" value={`${team.capacity}명`} />
          <InfoRow label="모집 여부" value={`${team.statusLabel} · ${team.activity}`} />
          <InfoRow label="정기 일정" value={team.schedule} />
        </Card>
        <Card pad={16} style={{ marginTop: 14, opacity: team.memberAccess.canView ? 1 : 0.72 }}>
          <div className="tm-section-row" style={{ marginTop: 0 }}>
            <div>
              <div className="tm-text-body-lg">주요 멤버</div>
              <div className="tm-text-caption" style={{ marginTop: 2 }}>{team.memberAccess.message}</div>
            </div>
            {team.memberAccess.canView ? <Link className="tm-btn tm-btn-sm tm-btn-neutral" href={`/teams/${team.id}/members`}>멤버</Link> : <button className="tm-btn tm-btn-sm tm-btn-neutral" type="button" disabled>보기 불가</button>}
          </div>
          {team.memberAccess.canView ? <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>{team.membersList.map((member) => <ListItem key={member.name} title={member.name} sub={`${member.role} · ${member.meta} · ${member.status}`} trailing={member.visibility} />)}</div> : <div className="tm-text-caption" style={{ marginTop: 12, lineHeight: 1.55 }}>팀 멤버이고 멤버 목록이 공개된 경우에만 볼 수 있어요.</div>}
        </Card>
      </article>
      <div className="tm-fixed-cta tm-hide-desktop"><div className="tm-text-caption" style={{ marginBottom: 8 }}>{locked ? '상태를 확인한 뒤 다음 행동을 선택해요.' : '신청 전 팀 정보와 내 프로필 공개 범위를 확인해요.'}</div>{heroMessage ? <div className="tm-text-caption" role="status" style={{ color: 'var(--text-caption)', marginBottom: 6 }}>{heroMessage}</div> : null}<button className={`tm-btn tm-btn-lg ${ctaTone} tm-btn-block`} type="button" disabled={!model.onCta || model.ctaPending} onClick={() => runHeroAction(model.onCta, mode === 'pending' ? '신청이 취소되었어요.' : '신청이 완료되었어요.')}>{model.ctaPending ? '처리 중' : cta}</button></div>
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
  const previewSport = form?.sports.find((sport) => sport.id === form.sportId)?.name ?? team.sports[0] ?? '';
  const previewRegion = form?.regions.find((region) => region.id === form.regionId)?.name ?? team.region ?? '';
  return (
    <AppChrome title={edit ? '팀 수정' : '팀 만들기'} activeTab="teams" bottomNav={false} backHref="/teams">
      {/* Desktop back header */}
      <div className="tm-desktop-page-head tm-show-desktop">
        <Link className="tm-desktop-back" href="/teams" aria-label="팀 목록으로">
          <ChevronLeftIcon size={22} strokeWidth={2.2} aria-hidden="true" />
        </Link>
        <h1 className="tm-text-heading">{edit ? '팀 수정' : '팀 만들기'}</h1>
      </div>
      <div className="tm-team-form-grid">
        <div className="tm-create-shell tm-team-form-main">
          {edit ? (
            <Card pad={16}>
              <div className="tm-my-toggle-row">
                <div>
                  <div className="tm-text-body-lg">멤버 목록 공개</div>
                  <div className="tm-text-caption" style={{ marginTop: 4 }}>
                    켜면 팀 멤버가 멤버 목록을 볼 수 있어요. 팀에 속하지 않은 사람에게는 공개되지 않아요.
                  </div>
                </div>
                <button
                  aria-pressed={Boolean(form?.membersVisibilityEnabled)}
                  className={`tm-toggle ${form?.membersVisibilityEnabled ? 'tm-toggle-on' : ''}`}
                  onClick={() => form?.onMembersVisibilityChange?.(!form.membersVisibilityEnabled)}
                  type="button"
                />
              </div>
            </Card>
          ) : null}
          <h2 className="tm-text-heading">{edit ? '팀 정보를 수정해요' : '새 팀을 만들어요'}</h2>
          {form?.error ? <Card pad={14} style={{ marginTop: 14, background: 'var(--red50)' }}><div className="tm-text-label">저장할 수 없어요</div><div className="tm-text-caption" style={{ marginTop: 5 }}>{form.error}</div></Card> : null}
          <CreateField label="팀 이름" value={team.name} placeholder="예: 성수 풋살 크루" onChange={(value) => form?.onFieldChange('name', value)} />
          <TeamLogoField logoUrl={team.logoUrl} teamName={team.name} uploadImage={form?.uploadImage} onChange={(url) => form?.onFieldChange('logoUrl', url)} />
          <div className="tm-create-field">
            <div className="tm-text-label">종목</div>
            <div className="tm-team-form-chip-row">{(form?.sports.map((sport) => sport.name) ?? ['축구', '풋살', '러닝', '수영']).map((sport) => <button key={sport} className={`tm-chip ${team.sports.includes(sport) ? 'tm-chip-active' : ''}`} type="button" onClick={() => form?.onSportChange(form.sports.find((item) => item.name === sport)?.id ?? '')}>{sport}</button>)}</div>
          </div>
          <RegionSelect value={form?.regionId ?? ''} regions={form?.regions ?? []} onChange={form?.onRegionChange} />
          <CreateField label="팀 소개" value={team.description} placeholder="예: 주 1회 꾸준히 함께 경기할 멤버를 찾아요." multiline onChange={(value) => form?.onFieldChange('description', value)} />
          <div className="tm-create-two-col"><TeamLevelSelect value={team.level} onChange={(value) => form?.onFieldChange('level', value)} /><TeamCapacityField value={team.capacity} onChange={(value) => form?.onFieldChange('capacity', value)} /></div>
          <GenderRuleSelector value={team.genderRule} onChange={(value) => form?.onFieldChange('genderRule', value)} />
          <CreateField label="활동 방식" value={team.activity} placeholder="예: 평일 저녁 · 주 1회" onChange={(value) => form?.onFieldChange('activity', value)} />
        </div>
        {/* Desktop-only sticky rail: live team-card preview + CTA (mobile uses the fixed CTA below). */}
        <aside className="tm-team-form-rail tm-show-desktop" aria-label="팀 미리보기">
          <TeamFormPreview team={team} sportName={previewSport} regionName={previewRegion} />
          <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" type="button" disabled={form?.submitting} onClick={form?.onSubmit}>{form?.submitting ? '저장 중' : edit ? '저장' : '팀 만들기'}</button>
          <Link className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" href="/teams">{edit ? '취소' : '이전'}</Link>
        </aside>
      </div>
      <div className="tm-fixed-cta tm-team-form-cta tm-hide-desktop"><div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}><Link className="tm-btn tm-btn-lg tm-btn-neutral" href={edit ? '/teams' : '/teams'}>{edit ? '취소' : '이전'}</Link><button className="tm-btn tm-btn-lg tm-btn-primary" type="button" disabled={form?.submitting} onClick={form?.onSubmit}>{form?.submitting ? '저장 중' : edit ? '저장' : '팀 만들기'}</button></div></div>
    </AppChrome>
  );
}

/**
 * Optional team-logo upload. Uploads via form.uploadImage (→ /uploads) and stores
 * the returned URL in draft.logoUrl. Skippable — without a logo the team falls back
 * to its first character, matching the listing card.
 */
function TeamLogoField({
  logoUrl,
  teamName,
  uploadImage,
  onChange,
}: {
  logoUrl: string | null;
  teamName: string;
  uploadImage?: (file: File) => Promise<string>;
  onChange: (url: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmedName = teamName.trim();
  const fallbackChar = trimmedName ? Array.from(trimmedName)[0] : '팀';

  const handleFile = async (file: File | undefined) => {
    if (!file || !uploadImage) return;
    setError(null);
    setUploading(true);
    try {
      const url = await uploadImage(file);
      onChange(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : '이미지를 올리지 못했어요. 다시 시도해 주세요.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="tm-create-field">
      <div className="tm-text-label">
        팀 로고 <span className="tm-text-caption" style={{ fontWeight: 400 }}>(선택)</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10 }}>
        <div className="tm-team-logo tm-team-logo-large" style={{ overflow: 'hidden' }} aria-hidden="true">
          {logoUrl ? (
            <img src={logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            fallbackChar
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="tm-btn tm-btn-sm tm-btn-neutral"
              disabled={uploading || !uploadImage}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? '올리는 중…' : logoUrl ? '변경' : '이미지 선택'}
            </button>
            {logoUrl ? (
              <button type="button" className="tm-btn tm-btn-sm tm-btn-ghost" disabled={uploading} onClick={() => onChange(null)}>
                삭제
              </button>
            ) : null}
          </div>
          <div className="tm-text-caption">정사각형 이미지를 권장해요. 안 올려도 첫 글자로 표시돼요.</div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(event) => handleFile(event.target.files?.[0])}
        />
      </div>
      {error ? (
        <div className="tm-text-caption" style={{ color: 'var(--red500)', marginTop: 6 }}>{error}</div>
      ) : null}
    </div>
  );
}

/**
 * Desktop live preview of the team being created/edited — mirrors the real
 * TeamCard visuals (logo + name + sport·region + level/정원/성별 badges + intro)
 * bound to the form draft so input is reflected instantly. aria-hidden because it
 * is a redundant visual mirror of the form fields; the CTA beside it stays focusable.
 */
function TeamFormPreview({
  team,
  sportName,
  regionName,
}: {
  team: TeamFormViewModel['team'];
  sportName: string;
  regionName: string;
}) {
  const trimmedName = team.name.trim();
  const hasName = trimmedName.length > 0;
  const sport = sportName || team.sports[0] || '종목 미정';
  const region = regionName || team.region || '지역 미정';
  const level = team.level.trim() || '전체 레벨';
  const capacity = team.capacity ? `${team.capacity}명` : '정원 미정';
  const gender = team.genderRule || '성별 무관';
  const intro = team.description.trim();
  const logoChar = hasName ? Array.from(trimmedName)[0] : '팀';
  return (
    <div aria-hidden="true">
      <div className="tm-text-caption" style={{ fontWeight: 600, color: 'var(--text-caption)', marginBottom: 8 }}>
        실시간 미리보기
      </div>
      <div className="tm-team-card" style={{ cursor: 'default' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div className="tm-team-logo" style={{ overflow: 'hidden' }}>
            {team.logoUrl ? (
              <img src={team.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              logoChar
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="tm-text-body-lg line-clamp-2" style={{ color: hasName ? 'var(--text-strong)' : 'var(--text-caption)' }}>
              {hasName ? trimmedName : '팀 이름'}
            </div>
            <div className="tm-text-caption" style={{ marginTop: 4 }}>{sport} · {region}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              <span className="tm-badge tm-badge-grey">{level}</span>
              <span className="tm-badge tm-badge-grey">{capacity}</span>
              <span className="tm-badge tm-badge-grey">{gender}</span>
            </div>
          </div>
        </div>
        <div className="tm-team-intro-box">
          <div className="tm-text-label">팀 소개</div>
          <div className="tm-text-body" style={{ marginTop: 6, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {intro || '팀 소개를 입력하면 여기에 보여요.'}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TeamMembersPageView({ model, backHref = '/teams' }: { model: TeamMembersViewModel; backHref?: string }) {
  return (
    <AppChrome title="멤버 관리" activeTab="teams" bottomNav={false} backHref={backHref}>
      {/* Desktop back header */}
      <div className="tm-desktop-page-head tm-show-desktop">
        <Link className="tm-desktop-back" href={backHref} aria-label="팀으로 돌아가기">
          <ChevronLeftIcon size={22} strokeWidth={2.2} aria-hidden="true" />
        </Link>
        <h1 className="tm-text-heading">{model.teamName} · 멤버 관리</h1>
      </div>
      <div className="tm-team-list tm-team-members-list">
        <h2 className="tm-text-heading tm-hide-desktop">{model.teamName}</h2>
        <div className="tm-team-stat-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <Card pad={12}><KPIStat label="전체" value={model.summary.total} unit="명" /></Card>
          <Card pad={12}><KPIStat label="관리자" value={model.summary.managers} unit="명" /></Card>
          <Card pad={12}><KPIStat label="검토" value={model.summary.pending} unit="명" /></Card>
        </div>
        <Card pad={14} style={{ background: 'var(--grey50)', marginTop: 14 }}>
          <div className="tm-text-label">권한 규칙</div>
          <div className="tm-text-caption" style={{ marginTop: 5 }}>멤버를 운영진으로 지정할 수 있고, 팀장 위임은 운영진에게만 할 수 있어요. 모든 변경은 확인 창을 거쳐 적용돼요.</div>
        </Card>
        <div className="tm-team-form-chip-row" style={{ marginTop: 14 }}>
          {model.tabs.map((tab) => (
            <button key={tab.key} className={`tm-chip ${model.activeTab === tab.key ? 'tm-chip-active' : ''}`} type="button" onClick={tab.onSelect}>
              {tab.label} <span className="tab-num">{tab.count}</span>
            </button>
          ))}
        </div>
        {model.activeTab === 'members' ? (
          <MemberSection title="팀 멤버" sub="팀에 속한 멤버의 역할과 권한을 관리해요." desktopGrid>
            {model.members.map((member) => <MemberCard key={member.name} title={member.name} sub={member.meta} role={member.role} actions={member.actions} actionPending={member.actionPending} />)}
          </MemberSection>
        ) : (
          <MemberSection title="가입 요청" sub="가입을 신청한 분을 승인하거나 거절할 수 있어요." desktopGrid>
            {model.requests.map((request) => <MemberCard key={request.name} title={request.name} sub={request.meta} role={request.status} actions={request.actions} actionPending={request.actionPending} />)}
          </MemberSection>
        )}
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
            {model.search.isLoading ? <div className="tm-list-search-empty">검색 기록을 불러오는 중이에요</div> : null}
            {!model.search.isLoading && model.search.recentItems.length === 0 ? <div className="tm-list-search-empty">최근 검색어가 없어요</div> : null}
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
            <div className="tm-text-caption" style={{ marginTop: 2 }}>정렬과 팀 조건을 조정해 보세요.</div>
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
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div className="tm-text-body-lg line-clamp-2">{team.name}</div><span className={`tm-badge ${team.status === 'closed' ? 'tm-badge-grey' : team.status === 'reviewing' ? 'tm-badge-orange' : 'tm-badge-blue'}`}>{team.statusLabel}</span></div><div className="tm-text-caption" style={{ marginTop: 4 }}>{team.sport} · {team.region} · {team.members}명</div><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>{dedupeTags([...team.tags, team.genderRule]).map((tag) => <span key={tag} className="tm-badge tm-badge-grey">{tag}</span>)}</div></div>
      </div>
      <div className="tm-team-intro-box">
        <div className="tm-text-label">팀 소개</div>
        <div className="tm-text-body" style={{ marginTop: 6, color: 'var(--text-muted)', lineHeight: 1.5 }}>{team.intro}</div>
      </div>
      <div className="tm-team-card-footer"><span className="tm-text-caption">{team.next}</span><span className={`tm-btn tm-btn-sm ${team.status === 'closed' ? 'tm-btn-neutral' : 'tm-btn-primary'}`}>{team.status === 'closed' ? '알림받기' : '팀 보기'}</span></div>
    </Link>
  );
}

function dedupeTags(tags: string[]) {
  return Array.from(new Set(tags.filter(Boolean)));
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
        <button className="tm-create-stepper-button" type="button" aria-label="정원 한 명 줄이기" onClick={() => onChange?.(Math.max(2, normalized - 1))}>−</button>
        <select className="tm-create-input tm-create-select-control" aria-label="정원" value={normalized} onChange={(event) => onChange?.(Number(event.target.value))}>
          {options.map((item) => <option key={item} value={item}>{item}명</option>)}
        </select>
        <button className="tm-create-stepper-button" type="button" aria-label="정원 한 명 늘리기" onClick={() => onChange?.(Math.min(50, normalized + 1))}>+</button>
      </div>
    </div>
  );
}

function MemberSection({ title, sub, desktopGrid, children }: { title: string; sub: string; desktopGrid?: boolean; children: ReactNode }) {
  return (
    <section className="tm-member-section">
      <div className="tm-text-label">{title}</div>
      <div className="tm-text-caption" style={{ marginTop: 3 }}>{sub}</div>
      <div className={desktopGrid ? 'tm-team-members-desktop-layout' : ''} style={desktopGrid ? undefined : { display: 'grid', gap: 10, marginTop: 10 }}>
        {children}
      </div>
    </section>
  );
}

function MemberCard({
  title,
  sub,
  role,
  actions,
  actionPending,
}: {
  title: string;
  sub: string;
  role: string;
  actions: Array<{ label: string; tone?: 'danger'; onSelect: () => void }>;
  actionPending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const disabled = actionPending || actions.length === 0;

  return (
    <Card pad={14}>
      <ListItem title={title} sub={sub} trailing={role} />
      <button className="tm-btn tm-btn-sm tm-btn-neutral tm-btn-block" style={{ marginTop: 10 }} type="button" disabled={disabled} onClick={() => setOpen((current) => !current)}>
        관리
      </button>
      {open && !disabled ? (
        <div className="tm-member-actions" style={{ gridTemplateColumns: '1fr', marginTop: 10 }}>
          {actions.map((action) => (
            <button
              key={action.label}
              className={`tm-btn tm-btn-sm ${action.tone === 'danger' ? 'tm-btn-danger' : 'tm-btn-neutral'} tm-btn-block`}
              type="button"
              onClick={() => {
                setOpen(false);
                action.onSelect();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function CreateField({ label, value, placeholder, suffix, multiline, type = 'text', onChange }: { label: string; value: string; placeholder?: string; suffix?: string; multiline?: boolean; type?: string; onChange?: (value: string) => void }) {
  return <label className="tm-create-field"><div className="tm-text-label">{label}</div><div className={`tm-create-input ${multiline ? 'tm-create-input-multiline' : ''}`}>{onChange ? (multiline ? <textarea className="tm-create-native-input" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /> : <input className="tm-create-native-input" type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />) : <span className="tm-text-body" style={{ color: value ? 'var(--text-strong)' : 'var(--text-caption)' }}>{value || placeholder}</span>}{suffix ? <span className="tm-text-caption">{suffix}</span> : null}</div></label>;
}

function RegionSelect({ value, regions, onChange }: { value: string; regions: Array<{ id: string; name: string }>; onChange?: (regionId: string) => void }) {
  return <label className="tm-create-field"><div className="tm-text-label">활동 지역</div><select className="tm-create-input tm-create-select-control" value={value} onChange={(event) => onChange?.(event.target.value)}><option value="">활동 지역을 선택해 주세요</option>{regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}</select><div className="tm-text-caption" style={{ marginTop: 6 }}>팀 추천과 지역 검색에 쓰여요. 활동 장소는 아래 '활동 방식'에 자유롭게 적어 주세요.</div></label>;
}
