'use client';

import Link from 'next/link';
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Lock } from 'lucide-react';
import { AppChrome } from '@/components/v1-ui/shell';
import { Card, EmptyState, ErrorState, KPIStat, ListItem } from '@/components/v1-ui/primitives';
import { ChevronLeftIcon, FilterIcon, PlusIcon, SearchIcon, ShareIcon } from '@/components/v1-ui/icons';
import { TeamAvatar } from '@/components/v1-ui/team-avatar';
import { cssUrl } from '@/lib/assets';
import type {
  TeamDetailViewModel,
  TeamFormViewModel,
  TeamListViewModel,
  TeamMembersViewModel,
  TeamModel,
  TeamStateViewModel,
} from './teams.types';

const ACTIVITY_DAY_OPTIONS = [
  { value: 'mon', label: '월' },
  { value: 'tue', label: '화' },
  { value: 'wed', label: '수' },
  { value: 'thu', label: '목' },
  { value: 'fri', label: '금' },
  { value: 'sat', label: '토' },
  { value: 'sun', label: '일' },
] as const;

const ACTIVITY_DAY_PRESETS = [
  { label: '평일', values: ['mon', 'tue', 'wed', 'thu', 'fri'] },
  { label: '주말', values: ['sat', 'sun'] },
  { label: '매일', values: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] },
  { label: '초기화', values: [] },
] as const;

const ACTIVITY_FREQUENCY_OPTIONS = [
  { value: '', label: '선택 안 함' },
  { value: 'weekly_1', label: '주 1회' },
  { value: 'weekly_2', label: '주 2회' },
  { value: 'weekly_3', label: '주 3회' },
  { value: 'weekly_4_plus', label: '주 4회 이상' },
  { value: 'biweekly_1', label: '격주 1회' },
  { value: 'irregular', label: '비정기' },
] as const;

const ACTIVITY_TIME_SLOT_OPTIONS = [
  { value: 'morning', label: '오전' },
  { value: 'lunch', label: '점심' },
  { value: 'afternoon', label: '오후' },
  { value: 'evening', label: '저녁' },
  { value: 'late_night', label: '심야' },
] as const;

const ACTIVITY_TYPE_OPTIONS = [
  { value: 'regular_meetup', label: '정기 모임' },
  { value: 'friendly_match', label: '친선 경기' },
  { value: 'team_match', label: '팀매치' },
  { value: 'tournament_prep', label: '대회 준비' },
  { value: 'training', label: '훈련/레슨' },
  { value: 'free_participation', label: '자유 참여' },
  { value: 'beginner_friendly', label: '초보 환영' },
  { value: 'competitive', label: '실력 중심' },
] as const;

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
        <div className="tm-sport-chip-row" role="group" aria-label="종목 필터">{model.chips.map((chip) => chip.href ? <Link key={chip.label} className={`tm-chip ${chip.active ? 'tm-chip-active' : ''}`} href={chip.href} aria-current={chip.active ? 'page' : undefined}>{chip.label}{typeof chip.count === 'number' ? <span className="tab-num"> {chip.count}</span> : null}</Link> : <button key={chip.label} className={`tm-chip ${chip.active ? 'tm-chip-active' : ''}`} type="button" aria-pressed={chip.active}>{chip.label}{typeof chip.count === 'number' ? <span className="tab-num"> {chip.count}</span> : null}</button>)}</div>
        {/* 모바일 진입점 위계: summary-bar 텍스트를 tm-text-heading으로 승격해 페이지 진입점을 명확히 함.
            desktop에는 이미 .tm-team-desktop-header가 제목을 담당하므로 모바일에서만 노출. */}
        <h2 className="tm-text-heading tm-hide-desktop tm-team-mobile-heading">{model.summary.scope}</h2>
        <div className="tm-team-summary-bar">
          <div className="tm-text-caption tab-num tm-hide-desktop"><TeamSummaryText summary={model.summary} /></div>
          <div className="tm-text-label tm-show-desktop">{model.summary.scope}</div>
          <div className="tm-text-caption tab-num tm-show-desktop"><TeamSummaryText summary={model.summary} /></div>
        </div>
        {model.listLoading ? (
          <TeamListSkeleton />
        ) : model.teams.length ? (
          <div className="tm-team-card-stack">{model.teams.map((team) => <TeamCard key={team.id} team={team} />)}</div>
        ) : (
          <EmptyState title="조건에 맞는 팀이 없어요" sub="다른 종목을 선택하거나 필터를 초기화해 다시 확인해 주세요." />
        )}
      </div>
      {model.filterSheet?.open ? <TeamFilterSheet model={model} /> : null}
    </AppChrome>
  );
}

function TeamSummaryText({ summary }: { summary: TeamListViewModel['summary'] }) {
  return (
    <>
      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{summary.total}</span>
      팀 · 가입 가능 <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{summary.recruiting}</span>
      {typeof summary.nearby === 'number' ? <> · 내 주변 {summary.nearby}</> : null}
    </>
  );
}

function TeamListSkeleton() {
  return (
    <div className="tm-team-card-stack" aria-busy="true" aria-label="팀 목록 불러오는 중">
      {[0, 1, 2].map((i) => (
        <div key={i} className="tm-review-skeleton" style={{ height: 164, borderRadius: 16 }} aria-hidden="true" />
      ))}
    </div>
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
        <EmptyState title={model.title} sub={model.description} />
        {model.state === 'error' ? (
          <Card pad={16} className="tm-team-state-error-card" style={{ marginTop: 18, background: 'var(--grey50)' }}>
            <div className="tm-text-label">목록에서 다시 확인해 주세요</div>
            <div className="tm-text-caption" style={{ marginTop: 6, lineHeight: 1.55 }}>
              새로고침 후에도 같은 문제가 반복되면 잠시 뒤 다시 시도해 보세요.
            </div>
            <Link className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" href="/teams" style={{ marginTop: 14 }}>목록으로 돌아가기</Link>
          </Card>
        ) : null}
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
          <div className="tm-sport-chip-row" role="group" aria-label="빠른 조건 선택" style={{ marginTop: 12 }}>
            {model.chips.map((chip) => chip.href ? <Link key={chip.label} className={`tm-chip ${chip.active ? 'tm-chip-active' : ''}`} href={chip.href} aria-current={chip.active ? 'page' : undefined}>{chip.label}{typeof chip.count === 'number' ? <span className="tab-num"> {chip.count}</span> : null}</Link> : <button key={chip.label} className={`tm-chip ${chip.active ? 'tm-chip-active' : ''}`} type="button" aria-pressed={chip.active}>{chip.label}{typeof chip.count === 'number' ? <span className="tab-num"> {chip.count}</span> : null}</button>)}
          </div>
        </Card>
        <Card pad={16}>
          <div className="tm-text-body-lg">가입 조건</div>
          <div className="tm-my-list-stack" style={{ marginTop: 12 }}>
            <ListItem title="지역" sub="서울 전체" trailing="변경 가능" />
            <ListItem title="가입 상태" sub="가입 신청 가능" trailing="1개" />
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
        <div style={{ display: 'grid', gap: 8 }} aria-busy="true" aria-label="열린 매치 불러오는 중">
          {[0, 1].map((i) => (
            <div key={i} className="tm-review-skeleton" style={{ height: 64, borderRadius: 14 }} aria-hidden="true" />
          ))}
        </div>
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
                border: '1px solid var(--border)',
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
              {/* P0/P1: 색상+아이콘+텍스트 병행 (WCAG 1.4.1) */}
              <span className="tm-badge tm-badge-blue" style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <svg width="7" height="7" viewBox="0 0 7 7" aria-hidden="true" style={{ flexShrink: 0 }}><circle cx="3.5" cy="3.5" r="3.5" fill="currentColor" /></svg>
                모집 중
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <Card pad={16} style={{ background: 'var(--grey50)' }}>
          <div className="tm-text-label">아직 열어둔 매치가 없어요</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>이 팀이 새 경기를 모집하면 여기서 확인할 수 있어요.</div>
        </Card>
      )}
    </>
  );
}

function TeamOperationsSection({
  operations,
  compact = false,
}: {
  operations?: TeamDetailViewModel['operations'];
  compact?: boolean;
}) {
  if (!operations?.length) return null;
  return (
    <section style={{ display: 'grid', gap: 10, marginTop: compact ? 0 : 14, marginBottom: compact ? 14 : 0 }}>
      <div>
        <div className="tm-text-body-lg">운영 메뉴</div>
        <div className="tm-text-caption" style={{ marginTop: 3 }}>팀 정보와 멤버 운영을 이 화면에서 이어서 관리해요.</div>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {operations.map((operation) => (
          <Link
            key={operation.href}
            className="tm-pressable"
            href={operation.href}
            style={{
              display: 'grid',
              gap: 4,
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: compact ? '12px 14px' : '14px 16px',
              background: 'var(--bg)',
              color: 'inherit',
              textDecoration: 'none',
            }}
          >
            <span className="tm-text-label">{operation.label}</span>
            <span className="tm-text-caption">{operation.sub}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function TeamDetailPageView({ model }: { model: TeamDetailViewModel }) {
  const { team, mode } = model;
  const locked = mode === 'pending' || mode === 'closed';
  const cta = model.ctaLabel ?? (mode === 'mine' ? '팀 관리' : mode === 'pending' ? '신청 상태 보기' : mode === 'closed' ? '모집 알림 받기' : '가입 신청');
  const ctaTone = mode === 'pending' ? 'tm-btn-warning' : mode === 'closed' ? 'tm-btn-neutral' : 'tm-btn-primary';
  const memberCapacity = formatMemberCapacity(team);
  const capacity = formatCapacity(team);
  const [heroMessage, setHeroMessage] = useState('');

  const runHeroAction = (action: (() => void | Promise<unknown>) | undefined, successMessage: string, failureMessage = '잠시 후 다시 시도해 주세요.') => {
    if (!action) return;
    void Promise.resolve(action())
      .then(() => {
        setHeroMessage(successMessage);
        window.setTimeout(() => setHeroMessage(''), 2000);
      })
      .catch(() => {
        setHeroMessage(failureMessage);
        window.setTimeout(() => setHeroMessage(''), 2000);
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
          <Card pad={18} className="tm-team-detail-hero-card" style={teamHeroStyle(team)}>
            <button
              className="tm-btn tm-btn-icon tm-btn-ghost tm-hero-button"
              type="button"
              aria-label="공유"
              onClick={() => runHeroAction(model.onShare, '링크를 복사했어요')}
              style={{ position: 'absolute', top: 14, right: 14 }}
            >
              <ShareIcon size={20} />
            </button>
            <TeamAvatar seed={team.id} name={team.name} logoUrl={team.logoUrl} size="xl" />
            <h2 className="tm-text-heading" style={{ color: 'var(--static-white)', marginTop: 14 }}>{team.name}</h2>
            <div className="tm-text-caption" style={{ color: 'var(--overlay-white-72)', marginTop: 4 }}>{team.sport} · {team.region}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
              <span className={`tm-badge ${teamDetailStatusBadgeClass(mode)}`}>{team.statusLabel}</span>
              <span className="tm-badge tm-badge-grey">{memberCapacity}</span>
            </div>
          </Card>
          <TeamOpenMatchesSection matches={model.openMatches} loading={model.openMatchesLoading} />
          <SectionTitle title="팀 기본 정보" sub="가입 전 필요한 정보를 확인해 주세요." />
          <Card pad={16}>
            <InfoRow label="팀명" value={team.name} />
            <InfoRow label="종목" value={formatTeamSports(team.sports)} muted={team.sports.length === 0} />
            <InfoRow label="팀 소개" value={team.description} preserveLineBreaks />
            <InfoRow label="시/도" value={team.city} />
            <InfoRow label="구/군" value={team.county} />
            <InfoRow label="레벨" value={team.level} />
            <InfoRow label="성별 조건" value={team.genderRule} />
            <InfoRow label="정원" value={capacity} />
            <InfoRow label="모집 여부" value={team.statusLabel} />
            <InfoRow label="활동 일정" value={team.activity || '활동 일정 미정'} muted={!team.activity} />
            {team.schedule ? <InfoRow label="정기 일정" value={team.schedule} /> : null}
          </Card>
          <TeamOperationsSection operations={model.operations} />
          {/* (3) 비공개 카드: opacity dim 제거(텍스트 대비 정상화). disabled 회색 pill → Lock 아이콘 + tm-badge-grey 정적 라벨. */}
          <Card pad={16} style={{ marginTop: 14 }}>
            <div className="tm-section-row" style={{ alignItems: 'flex-start', gap: 12, marginTop: 0 }}>
              <div style={{ minWidth: 0, flex: '1 1 auto' }}>
                <div className="tm-text-body-lg">주요 멤버</div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, flexWrap: 'wrap', marginTop: 4, minWidth: 0 }}>
                  {team.memberAccess.message ? (
                    <span className="tm-text-caption" style={{ minWidth: 0, flex: '1 1 180px', lineHeight: 1.45 }}>{team.memberAccess.message}</span>
                  ) : null}
                </div>
              </div>
              {team.memberAccess.enabled ? (
                <span className="tm-badge tm-badge-blue" style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
                  공개
                </span>
              ) : (
                <span className="tm-badge tm-badge-grey" style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0, gap: 4 }}>
                  <Lock size={11} aria-hidden="true" />
                  비공개
                </span>
              )}
            </div>
            {team.memberAccess.canView ? <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>{team.membersList.map((member, index) => <ListItem key={index} title={member.name} sub={`${member.role} · ${member.meta} · ${member.status}`} trailing={member.visibility} />)}</div> : <div className="tm-text-caption" style={{ marginTop: 12, lineHeight: 1.55 }}>멤버 목록은 비공개예요. 팀에 속한 멤버만 볼 수 있어요.</div>}
          </Card>
        </div>

        {/* RIGHT: sticky sidebar
            (4) identity(팀 로고+팀명/지역) 중복 제거 — 히어로 카드에 이미 표시됨.
            구분선도 함께 제거. CTA + 핵심 결정단서(정원·모집상태·정기일정 1줄)만 남김. */}
        <aside className="tm-team-detail-desktop-sidebar">
          {/* 핵심 결정단서: 정원·모집상태·정기일정 — 가입 전 즉시 판단에 필요한 3가지 */}
          <div className="tm-team-detail-sidebar-meta">
            <span className={`tm-badge ${teamDetailStatusBadgeClass(mode)}`}>{team.statusLabel}</span>
            <span className="tm-badge tm-badge-grey">{memberCapacity}</span>
          </div>
          {team.activity ? (
            <div className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
              활동 일정 · {team.activity}
            </div>
          ) : null}
          {team.schedule ? (
            <div className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
              정기 일정 · {team.schedule}
            </div>
          ) : null}
          <div className="tm-team-detail-sidebar-divider" />
          <div className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {locked ? '신청 상태를 확인하고 다음 행동을 선택해 주세요.' : '신청 전에 팀 정보와 내 프로필 공개 범위를 확인해 주세요.'}
          </div>
          {/* P2: 완료 메시지에 .tm-complete-check 마이크로인터랙션 적용 (globals.css 키프레임) */}
          {heroMessage ? <div className="tm-text-caption tm-complete-check" role="status" style={{ color: 'var(--text-caption)', marginTop: 6 }}>{heroMessage}</div> : null}
          <div className="tm-team-detail-sidebar-cta">
            <button
              className={`tm-btn tm-btn-lg ${ctaTone} tm-btn-block`}
              type="button"
              disabled={!model.onCta || model.ctaPending}
              onClick={() => runHeroAction(model.onCta, model.ctaSuccessMessage ?? (mode === 'pending' ? '신청을 취소했어요.' : '신청을 완료했어요.'), model.ctaFailureMessage)}
            >
              {model.ctaPending ? '처리 중' : cta}
            </button>
          </div>
        </aside>
      </div>

      {/* Mobile layout (unchanged) */}
      <article className="tm-team-detail-body tm-hide-desktop">
        <Card pad={18} className="tm-team-detail-hero-card" style={teamHeroStyle(team)}>
          <button
            className="tm-btn tm-btn-icon tm-btn-ghost tm-hero-button"
            type="button"
            aria-label="공유"
            onClick={() => runHeroAction(model.onShare, '링크를 복사했어요')}
            style={{ position: 'absolute', top: 14, right: 14 }}
          >
            <ShareIcon size={20} />
          </button>
          <TeamAvatar seed={team.id} name={team.name} logoUrl={team.logoUrl} size="xl" />
          <h1 className="tm-text-heading" style={{ color: 'var(--static-white)', marginTop: 14 }}>{team.name}</h1>
          <div className="tm-text-caption" style={{ color: 'var(--overlay-white-72)', marginTop: 4 }}>{team.sport} · {team.region}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
            <span className={`tm-badge ${teamDetailStatusBadgeClass(mode)}`}>{team.statusLabel}</span>
            <span className="tm-badge tm-badge-grey">{memberCapacity}</span>
          </div>
        </Card>
        <TeamOpenMatchesSection matches={model.openMatches} loading={model.openMatchesLoading} />
        <SectionTitle title="팀 기본 정보" sub="가입 전 필요한 정보를 확인해 주세요." />
        <Card pad={16}>
          <InfoRow label="팀명" value={team.name} />
          <InfoRow label="종목" value={formatTeamSports(team.sports)} muted={team.sports.length === 0} />
          <InfoRow label="팀 소개" value={team.description} preserveLineBreaks />
          <InfoRow label="시/도" value={team.city} />
          <InfoRow label="구/군" value={team.county} />
          <InfoRow label="레벨" value={team.level} />
          <InfoRow label="성별 조건" value={team.genderRule} />
          <InfoRow label="정원" value={capacity} />
          <InfoRow label="모집 여부" value={team.statusLabel} />
          <InfoRow label="활동 일정" value={team.activity || '활동 일정 미정'} muted={!team.activity} />
          {team.schedule ? <InfoRow label="정기 일정" value={team.schedule} /> : null}
        </Card>
        <TeamOperationsSection operations={model.operations} />
        {/* (3) 비공개 카드: opacity dim 제거(텍스트 대비 정상화). disabled 회색 pill → Lock 아이콘 + tm-badge-grey 정적 라벨. */}
        <Card pad={16} style={{ marginTop: 14 }}>
          <div className="tm-section-row" style={{ alignItems: 'flex-start', gap: 12, marginTop: 0 }}>
            <div style={{ minWidth: 0, flex: '1 1 auto' }}>
              <div className="tm-text-body-lg">주요 멤버</div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, flexWrap: 'wrap', marginTop: 4, minWidth: 0 }}>
                {team.memberAccess.message ? (
                  <span className="tm-text-caption" style={{ minWidth: 0, flex: '1 1 180px', lineHeight: 1.45 }}>{team.memberAccess.message}</span>
                ) : null}
              </div>
            </div>
            {team.memberAccess.enabled ? (
              <span className="tm-badge tm-badge-blue" style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
                공개
              </span>
            ) : (
              <span className="tm-badge tm-badge-grey" style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0, gap: 4 }}>
                <Lock size={11} aria-hidden="true" />
                비공개
              </span>
            )}
          </div>
          {team.memberAccess.canView ? <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>{team.membersList.map((member, index) => <ListItem key={index} title={member.name} sub={`${member.role} · ${member.meta} · ${member.status}`} trailing={member.visibility} />)}</div> : <div className="tm-text-caption" style={{ marginTop: 12, lineHeight: 1.55 }}>멤버 목록은 비공개예요. 팀에 속한 멤버만 볼 수 있어요.</div>}
        </Card>
      </article>
      <div className="tm-fixed-cta tm-hide-desktop">
        <div className="tm-text-caption" style={{ marginBottom: 8 }}>{locked ? '상태를 확인한 뒤 다음 행동을 선택해 주세요.' : '신청 전 팀 정보와 내 프로필 공개 범위를 확인해 주세요.'}</div>
        {/* P2: 완료 메시지 .tm-complete-check 마이크로인터랙션 */}
        {heroMessage ? <div className="tm-text-caption tm-complete-check" role="status" style={{ color: 'var(--text-caption)', marginBottom: 6 }}>{heroMessage}</div> : null}
        <button className={`tm-btn tm-btn-lg ${ctaTone} tm-btn-block`} type="button" disabled={!model.onCta || model.ctaPending} onClick={() => runHeroAction(model.onCta, model.ctaSuccessMessage ?? (mode === 'pending' ? '신청을 취소했어요.' : '신청을 완료했어요.'), model.ctaFailureMessage)}>
          {model.ctaPending ? '처리 중' : cta}
        </button>
      </div>
    </AppChrome>
  );
}

function teamDetailStatusBadgeClass(mode: TeamDetailViewModel['mode']) {
  if (mode === 'pending') return 'tm-badge-orange';
  if (mode === 'mine') return 'tm-badge-green';
  if (mode === 'closed') return 'tm-badge-grey';
  return 'tm-badge-blue';
}

function teamHeroStyle(team: Pick<TeamModel, 'coverImageUrl'>): CSSProperties {
  if (!team.coverImageUrl) return { position: 'relative' };
  return {
    position: 'relative',
    backgroundImage: `linear-gradient(180deg, rgba(20, 24, 31, 0.45), rgba(20, 24, 31, 0.72)), ${cssUrl(team.coverImageUrl)}`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
}

export function TeamFormPageView({
  model,
  /** #16: my 컨텍스트에서 진입한 경우 취소·저장 후 돌아갈 경로. 기본값 '/teams' */
  cancelHref = '/teams',
}: {
  model: TeamFormViewModel;
  cancelHref?: string;
}) {
  const edit = model.mode === 'edit';
  const team = model.team;
  const form = model.form;
  const previewSport = form?.sports.find((sport) => sport.id === form.sportId)?.name ?? team.sports[0] ?? '';
  const previewRegion = form?.regions.find((region) => region.id === form.regionId)?.name ?? team.region ?? '';
  return (
    <AppChrome title={edit ? '팀 수정' : '팀 만들기'} activeTab="teams" bottomNav={false} backHref={cancelHref}>
      {/* Desktop back header */}
      <div className="tm-desktop-page-head tm-show-desktop">
        <Link className="tm-desktop-back" href={cancelHref} aria-label={edit ? '팀으로 돌아가기' : '팀 목록으로'}>
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
                    켜면 팀에 속하지 않은 사람도 멤버 목록을 볼 수 있어요. 끄면 팀 내부 멤버에게만 보여요.
                  </div>
                </div>
                <button
                  role="switch"
                  aria-checked={Boolean(form?.membersVisibilityEnabled)}
                  aria-label="멤버 목록 공개"
                  className={`tm-toggle ${form?.membersVisibilityEnabled ? 'tm-toggle-on' : ''}`}
                  onClick={() => form?.onMembersVisibilityChange?.(!form.membersVisibilityEnabled)}
                  type="button"
                />
              </div>
            </Card>
          ) : null}
          {!edit ? <h2 className="tm-text-heading">새 팀을 만들어요</h2> : null}
          {form?.error ? <Card pad={16} style={{ marginTop: 14, background: 'var(--red50)' }}><div className="tm-text-label">저장할 수 없어요</div><div className="tm-text-caption" style={{ marginTop: 5 }}>{form.error}</div></Card> : null}
          <CreateField label="팀 이름" value={team.name} placeholder="예: 성수 풋살 크루" onChange={(value) => form?.onFieldChange('name', value)} />
          <TeamLogoField logoUrl={team.logoUrl} teamName={team.name} uploadImage={form?.uploadImage} onChange={(url) => form?.onFieldChange('logoUrl', url)} />
          <TeamCoverImageField coverImageUrl={team.coverImageUrl} uploadImage={form?.uploadImage} onChange={(url) => form?.onFieldChange('coverImageUrl', url)} />
          <div className="tm-create-field">
            <div className="tm-text-label">종목</div>
            {/* Fix (3): 하드코딩 fallback 제거.
                form 미정의(로딩 중) → 스켈레톤 칩 4개(animate-pulse).
                form 정의 + sports 빈 배열(fetch 실패) → ErrorState.
                정상 데이터 → 실제 종목 칩. */}
            {!form ? (
              <div className="tm-team-form-chip-row" role="status" aria-label="종목 목록 불러오는 중">
                {[80, 56, 72, 64].map((w) => (
                  <span
                    key={w}
                    className="tm-chip"
                    aria-hidden="true"
                    style={{ width: w, background: 'var(--grey100)', color: 'transparent', animationName: 'pulse', animationDuration: '1.5s', animationTimingFunction: 'ease-in-out', animationIterationCount: 'infinite' }}
                  />
                ))}
              </div>
            ) : form.sports.length === 0 ? (
              <ErrorState title="종목을 불러오지 못했어요" message="잠시 후 다시 시도해 주세요." onRetry={() => window.location.reload()} />
            ) : (
              <div className="tm-team-form-chip-row" role="group" aria-label="종목 선택">
                {form.sports.map((sport) => (
                  <button
                    key={sport.id}
                    className={`tm-chip ${team.sports.includes(sport.name) ? 'tm-chip-active' : ''}`}
                    type="button"
                    aria-pressed={team.sports.includes(sport.name)}
                    onClick={() => form.onSportChange(sport.id)}
                  >
                    {sport.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <RegionSelect value={form?.regionId ?? ''} regions={form?.regions ?? []} onChange={form?.onRegionChange} />
          <CreateField label="팀 소개" value={team.description} placeholder="예: 주 1회 꾸준히 함께 경기할 멤버를 찾아요." multiline rows={4} inputClassName="tm-team-description-input" onChange={(value) => form?.onFieldChange('description', value)} />
          {edit ? <TeamJoinPolicyField form={form} /> : null}
          <div className="tm-create-two-col"><TeamLevelSelect value={team.level} onChange={(value) => form?.onFieldChange('level', value)} /><TeamCapacityField value={team.capacity} onChange={(value) => form?.onFieldChange('capacity', value)} /></div>
          <GenderRuleSelector value={team.genderRule} onChange={(value) => form?.onFieldChange('genderRule', value)} />
          <TeamActivityFields team={team} form={form} />
        </div>
        {/* Desktop-only sticky rail: live team-card preview + CTA (mobile uses the fixed CTA below). */}
        <aside className="tm-team-form-rail tm-show-desktop" aria-label="팀 미리보기">
          <TeamFormPreview team={team} sportName={previewSport} regionName={previewRegion} />
          <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" type="button" disabled={form?.submitting} onClick={form?.onSubmit}>{form?.submitting ? '저장 중' : edit ? '저장' : '팀 만들기'}</button>
          <Link className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" href={cancelHref}>{edit ? '취소' : '이전'}</Link>
        </aside>
      </div>
      <div className="tm-fixed-cta tm-team-form-cta tm-hide-desktop"><div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}><Link className="tm-btn tm-btn-lg tm-btn-neutral" href={cancelHref}>{edit ? '취소' : '이전'}</Link><button className="tm-btn tm-btn-lg tm-btn-primary" type="button" disabled={form?.submitting} onClick={form?.onSubmit}>{form?.submitting ? '저장 중' : edit ? '저장' : '팀 만들기'}</button></div></div>
    </AppChrome>
  );
}

function TeamJoinPolicyField({ form }: { form?: TeamFormViewModel['form'] }) {
  const options = [
    {
      value: 'approval_required' as const,
      label: '가입 신청 가능',
      description: '새 멤버가 가입 신청을 보내고 운영진이 승인해요.',
    },
    {
      value: 'closed' as const,
      label: '가입 닫힘',
      description: '신규 가입 신청을 받지 않아요.',
    },
  ];

  return (
    <div className="tm-create-field">
      <div className="tm-text-label">가입 신청 상태</div>
      <div className="tm-team-form-chip-row" role="group" aria-label="가입 신청 상태 선택">
        {options.map((option) => {
          const active = form?.joinPolicy === option.value;
          return (
            <button
              key={option.value}
              className={`tm-chip ${active ? 'tm-chip-active' : ''}`}
              type="button"
              aria-pressed={active}
              disabled={!form}
              onClick={() => form?.onJoinPolicyChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <div className="tm-text-caption" style={{ marginTop: 6 }}>
        {form?.joinPolicy === 'closed' ? options[1].description : options[0].description}
      </div>
    </div>
  );
}

function TeamActivityFields({
  team,
  form,
}: {
  team: TeamFormViewModel['team'];
  form?: TeamFormViewModel['form'];
}) {
  const [open, setOpen] = useState(false);
  const updateMulti = (
    field: 'activityDays' | 'activityTimeSlots' | 'activityTypes',
    value: string,
  ) => {
    if (!form) return;
    const current = team[field];
    const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
    form.onFieldChange(field, next);
  };
  const summary = formatActivityPreview(team);

  return (
    <Card pad={16} style={{ display: 'grid', gap: open ? 16 : 0, marginTop: 12 }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          width: '100%',
          padding: 0,
          border: 0,
          background: 'transparent',
          color: 'inherit',
          textAlign: 'left',
          cursor: 'pointer',
        }}
      >
        <div>
          <div className="tm-text-body-lg">활동 일정</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>{summary || '선택하지 않아도 돼요'}</div>
        </div>
        <ChevronDown
          size={20}
          aria-hidden="true"
          style={{
            flex: '0 0 auto',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 160ms ease',
            color: 'var(--text-caption)',
          }}
        />
      </button>
      {open ? (
        <>
          <div className="tm-create-field" style={{ marginTop: 0 }}>
            <div className="tm-text-label">활동 요일</div>
            <div className="tm-team-form-chip-row" style={{ marginTop: 8 }}>
              {ACTIVITY_DAY_PRESETS.map((preset) => (
                <button key={preset.label} className="tm-chip" type="button" onClick={() => form?.onFieldChange('activityDays', [...preset.values])}>
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="tm-team-form-chip-row" role="group" aria-label="활동 요일" style={{ marginTop: 8 }}>
              {ACTIVITY_DAY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={`tm-chip ${team.activityDays.includes(option.value) ? 'tm-chip-active' : ''}`}
                  type="button"
                  aria-pressed={team.activityDays.includes(option.value)}
                  onClick={() => updateMulti('activityDays', option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <label className="tm-create-field" style={{ marginTop: 0 }}>
            <span className="tm-text-label">주 활동 횟수</span>
            <select className="tm-input tm-input-select" value={team.activityFrequency} onChange={(event) => form?.onFieldChange('activityFrequency', event.target.value)}>
              {ACTIVITY_FREQUENCY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <ActivityChipGroup label="활동 시간대" values={team.activityTimeSlots} options={ACTIVITY_TIME_SLOT_OPTIONS} onToggle={(value) => updateMulti('activityTimeSlots', value)} />
          <ActivityChipGroup label="활동 유형" values={team.activityTypes} options={ACTIVITY_TYPE_OPTIONS} onToggle={(value) => updateMulti('activityTypes', value)} />
          <CreateField label="활동 메모" value={team.activityMemo} placeholder="예: 우천 시 실내 구장으로 변경" onChange={(value) => form?.onFieldChange('activityMemo', value)} />
          <div className="tm-auth-soft-card" style={{ padding: 12 }}>
            <div className="tm-text-label">미리보기</div>
            <div className="tm-text-caption" style={{ marginTop: 4 }}>{summary || '활동 일정 미정'}</div>
          </div>
        </>
      ) : null}
    </Card>
  );
}

function ActivityChipGroup({
  label,
  values,
  options,
  onToggle,
}: {
  label: string;
  values: string[];
  options: ReadonlyArray<{ value: string; label: string }>;
  onToggle: (value: string) => void;
}) {
  return (
    <div className="tm-create-field" style={{ marginTop: 0 }}>
      <div className="tm-text-label">{label}</div>
      <div className="tm-team-form-chip-row" role="group" aria-label={label} style={{ marginTop: 8 }}>
        {options.map((option) => (
          <button
            key={option.value}
            className={`tm-chip ${values.includes(option.value) ? 'tm-chip-active' : ''}`}
            type="button"
            aria-pressed={values.includes(option.value)}
            onClick={() => onToggle(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function formatActivityPreview(team: TeamFormViewModel['team']) {
  const parts = [
    formatActivityDays(team.activityDays),
    labelFromOptions(ACTIVITY_TIME_SLOT_OPTIONS, team.activityTimeSlots).join('/'),
    ACTIVITY_FREQUENCY_OPTIONS.find((option) => option.value === team.activityFrequency)?.label.replace('선택 안 함', ''),
    labelFromOptions(ACTIVITY_TYPE_OPTIONS, team.activityTypes).join('/'),
    team.activityMemo.trim(),
  ].filter(Boolean);
  return parts.join(' · ');
}

function formatActivityDays(days: string[]) {
  const ordered = ACTIVITY_DAY_OPTIONS.map((option) => option.value).filter((day) => days.includes(day));
  if (ordered.length === 7) return '매일';
  if (ordered.join(',') === 'mon,tue,wed,thu,fri') return '평일';
  if (ordered.join(',') === 'sat,sun') return '주말';
  return ACTIVITY_DAY_OPTIONS.filter((option) => ordered.includes(option.value)).map((option) => option.label).join('·');
}

function labelFromOptions(options: ReadonlyArray<{ value: string; label: string }>, values: string[]) {
  const labels = new Map(options.map((option) => [option.value, option.label]));
  return values.map((value) => labels.get(value)).filter(Boolean);
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
        {/* 팀 id가 아직 없는 create/edit draft이므로 팀명을 seed로 사용(TeamAvatar 자체 fallback과 동일 규칙). */}
        <TeamAvatar seed={teamName} name={teamName} logoUrl={logoUrl} size="xl" />
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
function TeamCoverImageField({
  coverImageUrl,
  uploadImage,
  onChange,
}: {
  coverImageUrl: string | null;
  uploadImage?: (file: File) => Promise<string>;
  onChange: (url: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        상단 이미지 <span className="tm-text-caption" style={{ fontWeight: 400 }}>(선택)</span>
      </div>
      <div className="tm-text-caption" style={{ marginTop: 4 }}>팀 상세 상단에 표시되는 대표 이미지예요.</div>
      <div
        style={{
          marginTop: 10,
          minHeight: 132,
          borderRadius: 14,
          border: '1px solid var(--border)',
          background: coverImageUrl ? `${cssUrl(coverImageUrl)} center/cover` : 'var(--grey50)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
        aria-hidden="true"
      >
        {coverImageUrl ? null : <span className="tm-text-caption">상단 이미지를 선택해 주세요</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        <button
          type="button"
          className="tm-btn tm-btn-sm tm-btn-neutral"
          disabled={uploading || !uploadImage}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? '올리는 중…' : coverImageUrl ? '변경' : '이미지 선택'}
        </button>
        {coverImageUrl ? (
          <button type="button" className="tm-btn tm-btn-sm tm-btn-ghost" disabled={uploading} onClick={() => onChange(null)}>
            제거
          </button>
        ) : null}
        <span className="tm-text-caption">JPG, PNG, WebP</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(event) => handleFile(event.target.files?.[0])}
        />
      </div>
      {error ? <div className="tm-text-caption" style={{ color: 'var(--red500)', marginTop: 6 }}>{error}</div> : null}
    </div>
  );
}

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
  const activity = formatActivityPreview(team);
  return (
    <div aria-hidden="true">
      <div className="tm-text-caption" style={{ fontWeight: 600, color: 'var(--text-caption)', marginBottom: 8 }}>
        실시간 미리보기
      </div>
      <div className="tm-team-card" style={{ cursor: 'default' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {/* 팀 id가 아직 없는 create/edit draft이므로 팀명을 seed로 사용 — 위 TeamLogoField 미리보기와 동일 색으로 보인다. */}
          <TeamAvatar seed={team.name} name={team.name} logoUrl={team.logoUrl} size="lg" />
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
            {activity ? <div className="tm-text-caption" style={{ marginTop: 8 }}>{activity}</div> : null}
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
        <Card pad={16} style={{ background: 'var(--grey50)', marginTop: 14 }}>
          <div className="tm-text-label">권한 규칙</div>
          <div className="tm-text-caption" style={{ marginTop: 5 }}>멤버를 운영진으로 지정할 수 있고, 팀장 위임은 운영진에게만 할 수 있어요. 모든 변경은 확인 창을 거쳐 적용돼요.</div>
        </Card>
        <div className="tm-team-form-chip-row" role="group" aria-label="멤버 탭 선택" style={{ marginTop: 14 }}>
          {model.tabs.map((tab) => (
            <button key={tab.key} className={`tm-chip ${model.activeTab === tab.key ? 'tm-chip-active' : ''}`} type="button" aria-pressed={model.activeTab === tab.key} onClick={tab.onSelect}>
              {tab.label} <span className="tab-num">{tab.count}</span>
            </button>
          ))}
        </div>
        {model.activeTab === 'members' ? (
          <MemberSection title="팀 멤버" sub="팀에 속한 멤버의 역할과 권한을 관리해요." desktopGrid>
            {model.members.map((member, index) => <MemberCard key={index} title={member.name} sub={member.meta} role={member.role} profileHref={member.profileHref} actions={member.actions} actionPending={member.actionPending} />)}
          </MemberSection>
        ) : model.activeTab === 'requests' ? (
          <MemberSection title="가입 신청" sub="가입을 신청한 분을 승인하거나 거절할 수 있어요." desktopGrid>
            {model.requests.map((request, index) => <MemberCard key={index} title={request.name} sub={request.meta} role={request.status} profileHref={request.profileHref} actions={request.actions} actionPending={request.actionPending} />)}
          </MemberSection>
        ) : model.invitations ? (
          <InvitationSection invitations={model.invitations} />
        ) : null}
      </div>
    </AppChrome>
  );
}

function InvitationSection({ invitations }: { invitations: NonNullable<TeamMembersViewModel['invitations']> }) {
  const { form, items, listLoading } = invitations;

  return (
    <section className="tm-member-section">
      <div className="tm-text-label">이메일로 초대</div>
      <div className="tm-text-caption" style={{ marginTop: 3 }}>이메일 주소로 팀원을 직접 초대할 수 있어요.</div>

      {/* 초대 폼 */}
      <Card pad={16} style={{ marginTop: 12 }}>
        <form
          className="tm-invitation-form"
          onSubmit={(event) => {
            event.preventDefault();
            form.onSubmit();
          }}
        >
          <div className="tm-invitation-form-row">
            <label htmlFor="invite-email" className="tm-text-label" style={{ flexShrink: 0, paddingTop: 10 }}>
              이메일
            </label>
            <input
              id="invite-email"
              className="tm-input"
              type="email"
              value={form.email}
              placeholder="example@email.com"
              autoComplete="email"
              onChange={(event) => form.onEmailChange(event.target.value)}
              disabled={form.submitting}
              aria-describedby={form.error ? 'invite-email-error' : undefined}
              aria-invalid={form.error ? true : undefined}
              style={{ minHeight: 44 }}
            />
          </div>
          <div className="tm-invitation-form-row">
            <label htmlFor="invite-message" className="tm-text-label" style={{ flexShrink: 0, paddingTop: 10 }}>
              메시지
              <span className="tm-text-caption" style={{ fontWeight: 400, marginLeft: 4 }}>(선택)</span>
            </label>
            <textarea
              id="invite-message"
              className="tm-input"
              value={form.message}
              placeholder="함께 하고 싶은 이유를 적어 보세요."
              rows={2}
              onChange={(event) => form.onMessageChange(event.target.value)}
              disabled={form.submitting}
              style={{ resize: 'none', lineHeight: 1.5 }}
            />
          </div>
          {form.error ? (
            <div id="invite-email-error" className="tm-text-caption" role="alert" style={{ color: 'var(--red500)' }}>
              {form.error}
            </div>
          ) : null}
          {form.successMessage ? (
            <div className="tm-text-caption" role="status" style={{ color: 'var(--green500)' }}>
              {form.successMessage}
            </div>
          ) : null}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              className="tm-btn tm-btn-md tm-btn-primary"
              type="submit"
              disabled={form.submitting}
              style={{ minHeight: 44, minWidth: 100 }}
            >
              {form.submitting ? '보내는 중…' : '초대 보내기'}
            </button>
          </div>
        </form>
      </Card>

      {/* 보낸 초대 목록 */}
      <div className="tm-text-label" style={{ marginTop: 20 }}>보낸 초대</div>
      <div className="tm-text-caption" style={{ marginTop: 3, marginBottom: 10 }}>아직 수락되지 않은 초대예요.</div>
      {listLoading ? (
        <div style={{ display: 'grid', gap: 10 }} aria-busy="true" aria-label="초대 목록 불러오는 중">
          {[0, 1].map((i) => (
            <div key={i} className="tm-review-skeleton" style={{ height: 64, borderRadius: 14 }} aria-hidden="true" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="보낸 초대가 없어요" sub="이메일로 팀원을 초대하면 여기에 표시돼요." />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {items.map((item) => (
            <div key={item.invitationId} className="tm-invitation-card">
              <div className="tm-invitation-card-head">
                {/* 아바타 대체 — 이니셜 */}
                <div
                  aria-hidden="true"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: 'var(--grey100)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    fontSize: 'var(--font-size-body-sm)',
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                  }}
                >
                  {Array.from(item.displayName)[0] ?? '?'}
                </div>
                <div className="tm-invitation-meta">
                  <span className="tm-invitation-meta-name">{item.displayName}</span>
                  <span className="tm-invitation-meta-date">{formatInvitationDate(item.createdAt)} 초대</span>
                </div>
                {/* 비색상 지표: 텍스트 '초대중' 병기 */}
                <span className="tm-invitation-status tm-invitation-status-pending" aria-label="초대 상태: 초대중">
                  초대중
                </span>
              </div>
              {item.message ? (
                <div className="tm-invitation-message">{item.message}</div>
              ) : null}
              <div className="tm-invitation-actions">
                <button
                  className="tm-btn tm-btn-sm tm-btn-danger"
                  type="button"
                  disabled={item.cancelPending}
                  onClick={item.onCancel}
                  aria-label={`${item.displayName}님 초대 취소`}
                  style={{ minHeight: 44 }}
                >
                  {item.cancelPending ? '취소 중…' : '초대 취소'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
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
                <Link key={option.value} className={`tm-chip ${option.active ? 'tm-chip-active' : ''}`} href={option.href} aria-current={option.active ? 'page' : undefined}>{option.label}</Link>
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

function formatInvitationDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '날짜 미정';
  return new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit' }).format(date);
}

function TeamCard({ team }: { team: TeamModel }) {
  const hasIntro = team.intro.trim().length > 0;
  const activity = team.next.trim();
  const memberCapacity = formatMemberCapacity(team);

  return (
    <Link className="tm-team-card tm-pressable" href={`/teams/${team.id}`}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <TeamAvatar seed={team.id} name={team.name} logoUrl={team.logoUrl} size="lg" />
        <div style={{ flex: 1, minWidth: 0 }}><div className="tm-text-body-lg line-clamp-2">{team.name}</div><div className="tm-text-caption" style={{ marginTop: 4 }}>{team.sport} · {team.region} · <span style={{ fontVariantNumeric: 'tabular-nums' }}>{memberCapacity}</span></div><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>{dedupeTags([...team.tags, team.genderRule]).map((tag) => <span key={tag} className="tm-badge tm-badge-grey">{tag}</span>)}</div></div>
      </div>
      {/* 실제 팀 소개가 있을 때만 intro-box를 렌더한다. */}
      {hasIntro ? (
        <div className="tm-team-intro-box">
          <div className="tm-text-body line-clamp-2" style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>{team.intro}</div>
        </div>
      ) : null}
      <div className="tm-team-card-action-row" aria-hidden="true">
        <span className="tm-text-caption line-clamp-1" style={{ color: 'var(--text-muted)', minWidth: 0 }}>
          {activity || '활동 일정 미정'}
        </span>
        <span className={`tm-team-card-action-status ${team.status === 'closed' ? 'tm-team-card-action-status-muted' : ''}`}>
          {team.statusLabel}
        </span>
      </div>
    </Link>
  );
}

function formatMemberCapacity(team: Pick<TeamModel, 'members' | 'capacity'>) {
  return team.capacity > 0 ? `${team.members}/${team.capacity}명` : `현재 ${team.members}명`;
}

function formatCapacity(team: Pick<TeamModel, 'capacity'>) {
  return team.capacity > 0 ? `${team.capacity}명` : '정원 미정';
}

function dedupeTags(tags: string[]) {
  return Array.from(new Set(tags.filter(Boolean)));
}

function SectionTitle({ title, sub }: { title: string; sub: string }) {
  return <div className="tm-section-title"><div className="tm-text-body-lg">{title}</div><div className="tm-text-caption" style={{ marginTop: 3 }}>{sub}</div></div>;
}

function formatTeamSports(items: string[]) {
  return items.length ? items.join(' · ') : '종목 미정';
}

function InfoRow({
  label,
  value,
  muted,
  preserveLineBreaks,
}: {
  label: string;
  value: string;
  muted?: boolean;
  preserveLineBreaks?: boolean;
}) {
  return (
    <div className="tm-team-info-row">
      <div className="tm-text-caption" style={{ color: 'var(--text-caption)', fontWeight: 600 }}>{label}</div>
      <div
        className="tm-text-body"
        style={{
          color: muted ? 'var(--text-muted)' : 'var(--text-strong)',
          whiteSpace: preserveLineBreaks ? 'pre-line' : undefined,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function InfoChips({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="tm-team-info-block">
      <div className="tm-text-caption" style={{ color: 'var(--text-caption)', fontWeight: 600, marginBottom: 8 }}>{label}</div>
      {/* (1) 파란 solid chip(tm-chip-active)은 테이블 톤을 파괴.
          단일 종목 → sport dot + 텍스트로 충분히 식별 가능.
          복수 종목 → tm-badge tm-badge-grey 로 중립 처리. */}
      {items.length === 1 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--blue500)',
              flexShrink: 0,
            }}
            aria-hidden="true"
          />
          <span className="tm-text-body">{items[0]}</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {items.map((item) => (
            <span key={item} className="tm-badge tm-badge-grey">{item}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function GenderRuleSelector({ value, onChange }: { value: string; onChange?: (value: string) => void }) {
  return (
    <div className="tm-create-field">
      <div className="tm-text-label">성별 조건</div>
      <div className="tm-team-form-chip-row" role="group" aria-label="성별 조건 선택">
        {['성별 무관', '남', '여'].map((option) => (
          <button key={option} className={`tm-chip ${value === option ? 'tm-chip-active' : ''}`} type="button" aria-pressed={value === option} onClick={() => onChange?.(option)}>
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
  profileHref,
  actions,
  actionPending,
}: {
  title: string;
  sub: string;
  role: string;
  profileHref?: string;
  actions: Array<{ label: string; tone?: 'danger'; onSelect: () => void }>;
  actionPending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const disabled = actionPending || actions.length === 0;

  return (
    <Card pad={16}>
      <ListItem title={title} sub={sub} trailing={role} href={profileHref} chev={Boolean(profileHref)} />
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

function CreateField({ label, value, placeholder, suffix, multiline, rows, inputClassName, type = 'text', onChange }: { label: string; value: string; placeholder?: string; suffix?: string; multiline?: boolean; rows?: number; inputClassName?: string; type?: string; onChange?: (value: string) => void }) {
  return <label className="tm-create-field"><div className="tm-text-label">{label}</div><div className={`tm-create-input ${multiline ? 'tm-create-input-multiline' : ''} ${inputClassName ?? ''}`}>{onChange ? (multiline ? <textarea className="tm-create-native-input" rows={rows} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /> : <input className="tm-create-native-input" type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />) : <span className="tm-text-body" style={{ color: value ? 'var(--text-strong)' : 'var(--text-caption)' }}>{value || placeholder}</span>}{suffix ? <span className="tm-text-caption">{suffix}</span> : null}</div></label>;
}

function RegionSelect({
  value,
  regions,
  onChange,
}: {
  value: string;
  regions: Array<{ id: string; name: string; shortName?: string; parentName?: string }>;
  onChange?: (regionId: string) => void;
}) {
  const normalizedRegions = regions.map((region) => {
    if (region.parentName || region.shortName) return region;
    const [parentName = '', ...shortNameParts] = region.name.split(' ');
    return {
      ...region,
      parentName,
      shortName: shortNameParts.join(' ') || region.name,
    };
  });
  const parentNames = Array.from(new Set(normalizedRegions.map((region) => region.parentName).filter(Boolean)));
  const selectedRegion = normalizedRegions.find((region) => region.id === value);
  const selectedParentName = selectedRegion?.parentName ?? parentNames[0] ?? '';
  const districtOptions = selectedParentName
    ? normalizedRegions.filter((region) => region.parentName === selectedParentName)
    : normalizedRegions;

  const handleParentChange = (parentName: string) => {
    const firstRegion = normalizedRegions.find((region) => region.parentName === parentName);
    if (firstRegion) onChange?.(firstRegion.id);
  };

  return (
    <label className="tm-create-field">
      <div className="tm-text-label">활동 지역</div>
      <div className="tm-region-select-grid">
        <select
          className="tm-create-input tm-create-select-control"
          value={selectedParentName}
          onChange={(event) => handleParentChange(event.target.value)}
          aria-label="광역 지역"
        >
          {parentNames.length === 0 ? <option value="">광역 지역</option> : null}
          {parentNames.map((parentName) => (
            <option key={parentName} value={parentName}>
              {parentName}
            </option>
          ))}
        </select>
        <select
          className="tm-create-input tm-create-select-control"
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          aria-label="시군구"
        >
          {districtOptions.length === 0 ? <option value="">구/시 선택</option> : null}
          {districtOptions.map((region) => (
            <option key={region.id} value={region.id}>
              {region.shortName ?? region.name}
            </option>
          ))}
        </select>
      </div>
      <div className="tm-text-caption" style={{ marginTop: 6 }}>팀 추천과 지역 검색에 쓰여요. 세부 장소나 예외 일정은 아래 활동 메모에 적어 주세요.</div>
    </label>
  );
}
