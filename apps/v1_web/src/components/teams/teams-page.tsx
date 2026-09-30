'use client';

import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Info, Lock } from 'lucide-react';
import { useShellOverride } from '@/components/v1-ui/shell-override';
import { AppBackLink } from '@/components/v1-ui/app-back-link';
import { AlertBanner, Card, EmptyState, ErrorState, KPIStat, SectionTitle } from '@/components/v1-ui/primitives';
import { ChevronLeftIcon, ChevronRightIcon, FilterIcon, PlusIcon, SearchIcon, ShareIcon } from '@/components/v1-ui/icons';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { TeamAvatar } from '@/components/v1-ui/team-avatar';
import { ReviewHighlightLine } from '@/components/v1-ui/review-highlight-line';
import { BottomSheet } from '@/components/v1-ui/bottom-sheet';
import { FieldErrorText } from '@/components/v1-ui/create-form-fields';
import { revealAndFocus } from '@/components/v1-ui/reveal-and-focus';
import { cssUrl } from '@/lib/assets';
import { useV1PublicTeamReviewSummary } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { isTeamLogoPreset, TEAM_LOGO_PRESETS } from '@/lib/team-logo-presets';
import { isTeamOperatorRole } from '@/lib/team-role';
import { withFromPath } from '@/lib/session-storage';
import { TeamUpcomingGamesCard } from './team-upcoming-games-card';
import { TeamMembersSection } from './team-members-section';
import { SoloOwnerCard, TeamManageDissolveEntry } from './team-dissolve-entry';
import type {
  TeamDetailViewModel,
  TeamFormViewModel,
  TeamListViewModel,
  TeamMembersViewModel,
  TeamModel,
  TeamStateViewModel,
} from './teams.types';

/** 서버 CreateTeamInvitationDto 의 `@MaxLength(200)` 과 같은 값이어야 한다. */
export const INVITE_MESSAGE_MAX_LENGTH = 200;

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
  // RouteChromeConfig엔 floatingSlot 필드가 없다(정적 테이블은 ReactNode를 못 담는다,
  // 설계 문서 §1.3) — FAB이 고정 JSX라도 항상 override로 옮긴다.
  useShellOverride({
    // 팀이 없는 새 사용자에게 "+" 만으로는 진입점이 약하다 — 글자를 함께 쓴다(F21).
    floatingSlot: <Link className="tm-floating-fab tm-floating-fab-extended tm-hide-desktop" href="/teams/new"><PlusIcon size={20} strokeWidth={2.4} aria-hidden="true" />팀 만들기</Link>,
  });
  return (
    <>
      {/* Desktop-only page header with inline create CTA */}
      <div className="tm-team-desktop-header tm-show-desktop">
        <h1 className="tm-text-heading tm-team-desktop-header-title">팀</h1>
        <Link className="tm-team-desktop-create-btn" href="/teams/new">
          <PlusIcon size={18} strokeWidth={2.5} aria-hidden="true" />
          팀 만들기
        </Link>
      </div>
      <TeamSearchBar model={model} />
      {/* 결과가 0건일 때만 tm-list-empty — matches-page.tsx 와 같은 이유. */}
      <div className={`tm-team-list${!model.listLoading && model.teams.length === 0 ? ' tm-list-empty' : ''}`}>
        <div className="tm-sport-chip-row" role="group" aria-label="종목 필터">{model.chips.map((chip) => chip.href ? <Link key={chip.label} className={`tm-chip ${chip.active ? 'tm-chip-active' : ''}`} href={chip.href} aria-current={chip.active ? 'page' : undefined}>{chip.label}{typeof chip.count === 'number' ? <span className="tab-num"> {chip.count}</span> : null}</Link> : <button key={chip.label} className={`tm-chip ${chip.active ? 'tm-chip-active' : ''}`} type="button" aria-pressed={chip.active}>{chip.label}{typeof chip.count === 'number' ? <span className="tab-num"> {chip.count}</span> : null}</button>)}</div>
        {/* 모바일 진입점 위계: summary-bar 텍스트를 tm-text-heading으로 승격해 페이지 진입점을 명확히 함.
            desktop에는 이미 .tm-team-desktop-header가 제목을 담당하므로 모바일에서만 노출. */}
        {/* 2026-09-07: 별도 줄에 있던 모바일 전용 h2(tm-text-heading 24px)를 요약 바 안으로
            흡수했다. /matches·/team-matches 와 같은 처리로 모아 목록 화면의 제목이 한 가지가
            되고, 세로 44px 를 돌려받는다(사용자 확정 — 보이는 제목을 주되 줄은 더하지 않는다).
            hide/show-desktop 으로 같은 값을 두 번 그리던 중복도 함께 사라진다. */}
        <div className="tm-team-summary-bar">
          <h2 className="tm-list-scope-heading">{model.summary.scope}</h2>
          <div className="tm-text-caption tab-num"><TeamSummaryText summary={model.summary} /></div>
        </div>
        {model.listLoading ? (
          <TeamListSkeleton />
        ) : model.teams.length ? (
          <>
            <div className="tm-team-card-stack">{model.teams.map((team) => <TeamCard key={team.id} team={team} />)}</div>
            {model.hasNextPage ? (
              <button
                type="button"
                className="tm-btn tm-btn-lg tm-btn-neutral tm-btn-block"
                style={{ marginTop: 16 }}
                onClick={model.onLoadMore}
                disabled={model.isFetchingNextPage}
              >
                {model.isFetchingNextPage ? '팀을 더 불러오는 중...' : '팀 더 보기'}
              </button>
            ) : null}
          </>
        ) : (
          <EmptyState
            fill
            illustration={{ name: 'auth-welcome' }}
            title="조건에 맞는 팀이 없어요"
            sub="다른 종목을 선택하거나 필터를 초기화해 다시 확인해 주세요."
            cta={model.filterCount > 0 || model.chips.some((chip) => chip.active && chip.label !== '전체') ? '전체 팀 보기' : undefined}
            ctaHref="/teams"
          />
        )}
      </div>
      {model.filterSheet?.open ? <TeamFilterSheet model={model} /> : null}
    </>
  );
}

function TeamSummaryText({ summary }: { summary: TeamListViewModel['summary'] }) {
  const partiallyLoaded = typeof summary.loaded === 'number' && summary.loaded < summary.total;
  return (
    <>
      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{summary.total}</span>
      팀
      {partiallyLoaded ? (
        <> · 현재 <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{summary.loaded}</span>팀 표시</>
      ) : (
        <> · 가입 가능 <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{summary.recruiting}</span></>
      )}
      {typeof summary.nearby === 'number' ? <> · 내 주변 {summary.nearby}</> : null}
    </>
  );
}

function TeamListSkeleton() {
  return (
    <div className="tm-team-card-stack" aria-busy="true" aria-label="팀 목록 불러오는 중">
      {[0, 1, 2].map((i) => (
        <div key={i} className="tm-review-skeleton" style={{ height: 98, borderRadius: 'var(--radius-container)' }} aria-hidden="true" />
      ))}
    </div>
  );
}

export function TeamStatePageView({ model }: { model: TeamStateViewModel }) {
  // 여러 물리적 라우트(/teams, /teams/:id, /teams/:id/members)가 공유하는 에러/제한 뷰다 —
  // title만 override로 밀어넣고 activeTab/bottomNav/backHref는 그 라우트의 route-chrome
  // 테이블 값을 그대로 따른다(특별 규칙 불필요, 설계 문서 §1.9 "공유 에러 뷰" 절).
  useShellOverride({ title: model.title });

  return (
    <>
      {/* Desktop back header for search/empty/error states */}
      <div className="tm-desktop-page-head tm-show-desktop">
        <AppBackLink className="tm-desktop-back" fallbackHref="/teams">
          <ChevronLeftIcon size={22} strokeWidth={2.2} aria-hidden="true" />
        </AppBackLink>
        <h1 className="tm-text-heading">{model.title}</h1>
      </div>
      {model.state === 'restricted' ? null : <TeamSearchBar model={model} />}
      <div className="tm-team-list">
        <EmptyState title={model.title} sub={model.description} />
        {model.state === 'error' ? (
          <Card pad={16} className="tm-team-state-error-card tm-on-tint" style={{ marginTop: 20, background: 'var(--grey50)' }}>
            <div className="tm-text-label">목록에서 다시 확인해 주세요</div>
            <div className="tm-text-caption" style={{ marginTop: 8, lineHeight: 1.55 }}>
              새로고침 후에도 같은 문제가 반복되면 잠시 뒤 다시 시도해 보세요.
            </div>
            <Link className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" href="/teams" style={{ marginTop: 16 }}>목록으로 돌아가기</Link>
          </Card>
        ) : null}
      </div>
    </>
  );
}

/**
 * "이 팀의 열린 매치" — this team's recruiting team-matches (GET /team-matches?teamId).
 * Lets a prospective member judge the team's activity before requesting to join.
 * Clean v1 card style + 해요체 copy.
 */
function TeamOpenMatchesSection({
  fromHref,
  matches,
  loading,
}: {
  fromHref: string;
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
            <div key={i} className="tm-review-skeleton" style={{ height: 64, borderRadius: 'var(--radius-field)' }} aria-hidden="true" />
          ))}
        </div>
      ) : items.length ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {items.map((match) => (
            <Link
              key={match.id}
              className="tm-pressable"
              // 뒤로가기가 이 팀 상세로 돌아오도록 출처를 함께 넘긴다(team-matches-client.tsx가 `?from=`을 읽는다).
              href={withFromPath(`/team-matches/${match.id}`, fromHref)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-field)',
                padding: '16px 16px',
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
        <Card pad={16} className="tm-on-tint" style={{ background: 'var(--grey50)' }}>
          <div className="tm-text-label">아직 열어둔 매치가 없어요</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>이 팀이 새 경기를 모집하면 여기서 확인할 수 있어요.</div>
        </Card>
      )}
    </>
  );
}

/**
 * "내 리그" (R4) — 이 팀이 host 또는 신청자로 속한 팀매치 목록(GET /team-matches?teamId=)
 * 에서 distinct 로 추린 리그. 전용 리그 API가 없어 팀 상세 진입점을 만드는 유일한
 * 방법이었다 -- 리그 상세로 가는 인앱 링크가 team-matches 상세 화면 배지 하나뿐이라
 * (team-matches-page.tsx 참고) 팀장·선수가 리그를 발견할 방법이 사실상 없었다.
 * 리그가 하나도 없으면 제목까지 포함해 섹션 전체를 렌더하지 않는다 -- 빈 섹션 노출 금지.
 * 단, 이는 "진짜 0개"에만 적용된다 -- myLeaguesQuery 가 실패한 경우도 items가 빈 배열이
 * 되어 이 조건과 100% 겹쳐 버리므로(그룹 F 재감사), error 를 loading/empty 와 분리된
 * 3번째 상태로 먼저 분기한다. 에러일 때는 섹션을 감추지 않고 재시도 CTA를 보여준다 —
 * "보낸 초대" 섹션(InvitationSection, 이 파일 listError 분기)과 동일하게 EmptyState를
 * 에러 표시에도 재사용해 이 페이지 안에서 시각적으로 통일한다.
 */
function TeamMyLeaguesSection({
  leagues,
  loading,
  error,
  onRetry,
}: {
  leagues?: TeamDetailViewModel['myLeagues'];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const items = leagues ?? [];
  if (!loading && !error && items.length === 0) return null;
  return (
    <>
      <SectionTitle title="내 리그" sub="이 팀이 참가 중인 리그예요." />
      {loading ? (
        <div style={{ display: 'grid', gap: 8 }} aria-busy="true" aria-label="내 리그 불러오는 중">
          {[0, 1].map((i) => (
            <div key={i} className="tm-review-skeleton" style={{ height: 56, borderRadius: 'var(--radius-field)' }} aria-hidden="true" />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          title="리그 정보를 불러오지 못했어요"
          sub="잠시 후 다시 시도해 주세요."
          cta="다시 시도"
          onCta={onRetry}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
          {items.map((league) => (
            <Link
              key={league.leagueId}
              className="tm-pressable"
              href={league.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-field)',
                padding: '16px 16px',
                background: 'var(--bg)',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="tm-badge tm-badge-grey" style={{ flexShrink: 0 }}>정규 리그</span>
                <div className="tm-text-label" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{league.title}</div>
              </div>
              <ChevronRightIcon size={18} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--text-caption)' }} />
            </Link>
          ))}
        </div>
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
    <section style={{ display: 'grid', gap: 12, marginTop: compact ? 0 : 14, marginBottom: compact ? 14 : 0 }}>
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
              borderRadius: 'var(--radius-control)',
              padding: compact ? '12px 14px' : '14px 16px',
              background: 'var(--bg)',
              color: 'inherit',
              textDecoration: 'none',
            }}
          >
            <span className="tm-text-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {operation.label}
              {operation.badge ? (
                <span className="tm-badge tm-badge-blue" aria-label={operation.badgeLabel ?? `${operation.badge}건`}>{operation.badge}</span>
              ) : null}
            </span>
            <span className="tm-text-caption">{operation.sub}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/**
 * 팀 멤버가 접근할 수 있는 전체 목록으로 보낸다. 미리보기 뒤에 남은 멤버가 있으면
 * 기존 수량 라벨을 유지하고, 전원을 미리 보여주는 작은 팀에도 명시적인 진입점을 둔다.
 * 화면의 주요 CTA(가입/채팅 버튼)와 겹치지 않도록 tm-list-row 안의 텍스트 링크로만 표현한다.
 */
function TeamMembersMoreLink({ teamId, count, from }: { teamId: string; count: number; from?: string | null }) {
  return (
    <Link
      href={withFromPath(`/teams/${teamId}/members`, from)}
      className="tm-list-row tm-pressable"
      style={{ justifyContent: 'center', gap: 4, minHeight: 44, textDecoration: 'none' }}
    >
      <span className="tm-text-label" style={{ color: 'var(--blue700)', fontWeight: 600 }}>
        {count > 0 ? `+ ${count}명 더보기` : '멤버 목록 보기'}
      </span>
      <ChevronRightIcon size={16} stroke="var(--blue700)" strokeWidth={2} aria-hidden="true" />
    </Link>
  );
}

function TeamDetailMembersCard({ team, subPageFrom }: { team: TeamDetailViewModel['team']; subPageFrom?: string | null }) {
  return (
    <section className="tm-team-detail-members-section">
      <div className="tm-section-row tm-team-detail-members-head" style={{ alignItems: 'flex-start', gap: 12, marginTop: 0 }}>
        <div style={{ minWidth: 0, flex: '1 1 auto' }}>
          <div className="tm-text-body-lg">주요 멤버</div>
          {team.memberAccess.message ? <div className="tm-text-caption" style={{ marginTop: 4, lineHeight: 1.45 }}>{team.memberAccess.message}</div> : null}
        </div>
        {team.memberAccess.enabled ? <span className="tm-badge tm-badge-blue">공개</span> : <span className="tm-badge tm-badge-grey" style={{ gap: 4 }}><Lock size={11} aria-hidden="true" />비공개</span>}
      </div>
      {team.memberAccess.canView ? (
        <div style={{ display: 'grid', gap: 8 }}>
            {team.membersList.length ? (
            team.membersList.map((member) => {
              const content = <><TeamAvatar seed={member.userId} name={member.name} size="sm" /><div style={{ flex: 1, minWidth: 0 }}><div className="tm-text-body" style={{ color: 'var(--text-strong)', lineHeight: 1.35 }}>{member.name}</div><div className="tm-text-caption" style={{ marginTop: 2 }}>{member.role}</div></div>{member.profileHref ? <ChevronRightIcon size={18} stroke="var(--text-caption)" strokeWidth={2} /> : null}</>;
              return member.profileHref ? <Link key={member.membershipId} className="tm-list-row tm-pressable" href={member.profileHref}>{content}</Link> : <div key={member.membershipId} className="tm-list-row">{content}</div>;
            })
          ) : <div className="tm-text-caption" style={{ lineHeight: 1.55 }}>공개된 멤버가 아직 없어요.</div>}
          <TeamMembersMoreLink teamId={team.id} count={team.memberAccess.moreCount} from={subPageFrom} />
        </div>
      ) : <div className="tm-text-caption" style={{ lineHeight: 1.55 }}>멤버 목록은 비공개예요. 팀에 속한 멤버만 볼 수 있어요.</div>}
    </section>
  );
}

function TeamBasicInfoCard({ team, capacity }: { team: TeamDetailViewModel['team']; capacity: string }) {
  return (
    <>
      <SectionTitle title="팀 기본 정보" sub="가입 전 필요한 정보를 확인해 주세요." />
      <Card pad={16} className="tm-team-detail-basic-info-card">
        <div className="tm-team-detail-info-group">
          <div className="tm-text-label">팀 개요</div>
          <div className="tm-team-detail-info-grid">
            <InfoRow label="팀명" value={team.name} />
            <InfoRow label="종목" value={formatTeamSports(team.sports)} muted={team.sports.length === 0} />
            <InfoRow label="시/도" value={team.city} />
            <InfoRow label="구/군" value={team.county} />
          </div>
        </div>
        <div className="tm-team-detail-info-group">
          <div className="tm-text-label">가입 조건</div>
          <div className="tm-team-detail-info-grid">
            <InfoRow label="레벨" value={team.level} />
            <InfoRow label="성별 조건" value={team.genderRule} />
            <InfoRow label="정원" value={capacity} />
            <InfoRow label="가입 신청" value={team.statusLabel} />
          </div>
        </div>
        <div className="tm-team-detail-info-group">
          <div className="tm-text-label">팀 소개와 활동</div>
          <InfoRow label="팀 소개" value={team.description} preserveLineBreaks />
          <InfoRow label="활동 일정" value={team.activity || '활동 일정 미정'} muted={!team.activity} />
          {team.schedule ? <InfoRow label="정기 일정" value={team.schedule} /> : null}
        </div>
      </Card>
    </>
  );
}

/** 팀 기록 링크 카드 — 전적·후기가 같은 모양이어야 한 묶음으로 읽힌다. 모바일·데스크톱
 *  두 레이아웃이 **같은 컴포넌트**를 쓴다(예전엔 같은 마크업이 두 벌로 복사돼 있었다). */
function TeamRecordLinkCard({
  href,
  title,
  description,
  badge,
}: {
  /** 없으면 링크가 아니라 표시 전용 카드로 그린다 — 갈 곳이 없는데 눌리는 것처럼 보이면 안 된다. */
  href?: string;
  title: string;
  description: ReactNode;
  badge?: string | null;
}) {
  const body = (
    <>
      <div>
        <div className="tm-text-label">{title}</div>
        <div className="tm-text-caption" style={{ marginTop: 4 }}>{description}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {badge ? (
          <span className="tm-badge tm-badge-blue" style={{ whiteSpace: 'nowrap' }}>{badge}</span>
        ) : null}
        {href ? <ChevronRightIcon size={18} aria-hidden="true" /> : null}
      </div>
    </>
  );
  const style: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-field)',
    padding: '16px 16px',
    background: 'var(--bg)',
    textDecoration: 'none',
    color: 'inherit',
  };
  if (href === undefined) return <div className="tm-team-detail-record-card" style={style}>{body}</div>;
  return (
    <Link className="tm-pressable tm-team-detail-record-card" href={href} style={style}>
      {body}
    </Link>
  );
}

/**
 * 팀 상세 로딩 셸. 목업 팀(teams.view-model.ts)을 그대로 렌더하던 자리를 대신한다.
 * 셸 승격(U29) 이후 title/activeTab/bottomNav/backHref 는 route-chrome/fragments/teams.ts
 * 테이블의 '/teams/:id' 항목(title: '팀 상세')이 이미 그린다 — TeamDetailPageView(성공
 * 뷰)도 title을 override하지 않으므로 두 상태가 같은 값을 보여 헤더가 흔들리지 않는다.
 * 그래서 본문 스켈레톤만 렌더한다.
 */
export function TeamDetailPageSkeleton() {
  return (
    <>
      <p className="sr-only" role="status">팀 정보를 불러오는 중이에요.</p>
      <PageSkeleton variant="detail" />
    </>
  );
}

export function TeamDetailPageView({ model }: { model: TeamDetailViewModel }) {
  const { team, mode } = model;
  const locked = mode === 'pending' || mode === 'closed';
  const cta = model.ctaLabel ?? (mode === 'mine' ? '팀 관리' : mode === 'pending' ? '신청 상태 보기' : mode === 'closed' ? '모집 알림 받기' : '가입 신청');
  // 승인 대기 중의 CTA는 "신청 취소"(파괴적 액션)다. 상태는 안내 카드가 이미 설명하므로
  // 버튼까지 최강 강조로 두면 취소가 권장 행동처럼 읽힌다 → neutral로 낮춘다.
  const ctaTone = mode === 'pending' || mode === 'closed' ? 'tm-btn-neutral' : 'tm-btn-primary';
  const memberCapacity = formatMemberCapacity(team);
  const capacity = formatCapacity(team);
  const [heroMessage, setHeroMessage] = useState('');
  const mobileBodyRef = useRef<HTMLElement>(null);
  const mobileCtaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const body = mobileBodyRef.current;
    const cta = mobileCtaRef.current;
    if (!body || !cta) return;

    // 문구 줄바꿈과 Android safe area까지 포함한 실제 CTA 높이를 비워 둔다.
    const syncBottomSpace = () => {
      body.style.paddingBottom = `${cta.getBoundingClientRect().height + 16}px`;
    };
    syncBottomSpace();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(syncBottomSpace);
    observer.observe(cta, { box: 'border-box' });
    return () => observer.disconnect();
  }, []);

  /**
   * 팀 후기 요약. **공개 엔드포인트**(`GET /teams/:id/reviews`)라 내 팀이든 남의 팀이든
   * 그 팀이 받은 평가를 그대로 읽는다 — 예전에는 "로그인한 나"가 받은 후기를 주는
   * `/reviews/received` 밖에 없어서 내 팀에서만 보여줄 수 있었다.
   *
   * 공개라고 규칙이 느슨한 건 아니다: 서버가 같은 상호평가 공개 게이트를 지나므로,
   * 상대가 아직 안 썼고 유예 시간도 안 지난 후기는 여기에도 안 잡힌다.
   */
  const isMyTeam = mode === 'mine';
  const reviewSummary = useV1PublicTeamReviewSummary(team.id);
  const teamReviewCount = (reviewSummary.data?.bySport ?? []).reduce((sum, row) => sum + row.ratingCount, 0);
  // 종목별로 쪼개져 오므로 개수로 가중 평균을 낸다 — 종목이 하나면 그 값 그대로다.
  const teamReviewAvg =
    teamReviewCount === 0
      ? null
      : (reviewSummary.data?.bySport ?? []).reduce((sum, row) => sum + (row.ratingAvg ?? 0) * row.ratingCount, 0) /
        teamReviewCount;
  const teamReviewHighlight = reviewSummary.data?.highlight ?? null;
  const teamReviewDescription: ReactNode =
    teamReviewCount === 0
      ? '아직 받은 후기가 없어요. 경기를 마치면 쌓여요.'
      : teamReviewHighlight
        ? <ReviewHighlightLine subject={isMyTeam ? '함께 뛴 팀들이' : '이 팀과 뛴 팀들이'} highlight={teamReviewHighlight} />
        : isMyTeam
          ? '함께 뛴 팀들이 남긴 평가를 확인해요.'
          : '이 팀과 뛴 팀들이 남긴 평가예요.';

  const heroActionBusyRef = useRef(false);
  const runHeroAction = (action: (() => void | Promise<unknown>) | undefined, successMessage: string, failureMessage = '잠시 후 다시 시도해 주세요.') => {
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
        window.setTimeout(() => setHeroMessage(''), 2600);
      })
      .catch((err: unknown) => {
        // 서버는 '이미 가입 신청해서 승인을 기다리고 있어요.'처럼 구체적인 사유를 준다.
        // 이를 버리고 일반 문구로 덮으면 사용자는 무엇이 잘못됐는지 알 수 없다.
        setHeroMessage(extractErrorMessage(err, failureMessage));
        window.setTimeout(() => setHeroMessage(''), 4000);
      })
      .finally(() => {
        heroActionBusyRef.current = false;
      });
  };

  return (
    <>
      <h1 className="sr-only">{team.name}</h1>
      {/* Desktop back header */}
      <div className="tm-desktop-page-head tm-show-desktop">
        <AppBackLink className="tm-desktop-back" fallbackHref={model.backHref ?? '/teams'}>
          <ChevronLeftIcon size={22} strokeWidth={2.2} aria-hidden="true" />
        </AppBackLink>
        <div className="tm-text-heading" style={{ margin: '0.67em 0' }} aria-hidden="true">{team.name}</div>
      </div>

      {/* Desktop 2-column layout */}
      <div className="tm-team-detail-desktop-layout tm-show-desktop">
        {/* LEFT: hero + info */}
        <div className="tm-team-detail-desktop-main">
          {model.justCreated && model.manageShortcuts ? <TeamCreatedNotice inviteHref={model.manageShortcuts.inviteHref} /> : null}
          <Card pad={20} className="tm-team-detail-hero-card" style={teamHeroStyle(team)}>
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
            <div className="tm-team-detail-hero-identity">
              <h2 className="tm-text-heading" style={{ color: 'var(--static-white)' }}>{team.name}</h2>
              <div className="tm-text-caption" style={{ color: 'var(--overlay-white-72)', marginTop: 4 }}>{team.sport} · {team.region}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                {/* 기본 상태 '가입 가능'은 칩 없이 두고 예외(가입 닫힘·정원 마감)만 알린다(H2·G13). */}
                {team.status === 'closed' ? <span className="tm-badge tm-badge-grey">{team.statusLabel}</span> : null}
                <span className="tm-badge tm-badge-grey">{memberCapacity}</span>
              </div>
            </div>
          </Card>
          {model.manageShortcuts ? <TeamManageShortcuts shortcuts={model.manageShortcuts} /> : null}
          {/* 전술보드 입구 — 히어로 바로 아래. 팀 일정(V1TeamSchedule)에는 대회 경기가
              들어오지 않아 별도 목록이 필요하다(컴포넌트 주석 참고).
              위치를 여기로 올린 이유: 처음엔 기본 정보 위에 뒀는데, 그 자리는 "열린 매치"와
              "내 리그"(리그가 많은 팀은 카드가 7장 넘는다) 아래라 390px 에서 한참 스크롤해야
              나왔다 — alpha 실화면 캡처로 확인했다. 팀장이 우리 팀에 들어와 가장 먼저 하는
              일이 다음 경기 준비이므로 모집 공고보다 앞이 맞다. 경기가 없으면 이 섹션은
              스스로 사라지므로(컴포넌트가 null 반환) 없는 팀의 화면은 그대로다. */}
          {/* 비회원·가입 희망자는 매치·리그보다 팀 소개·가입 조건을 먼저 봐야 한다(QA
              피드백) — 팀장이 다음 경기를 준비하는 mode==='mine' 에서만 아래쪽 원래
              자리(경기 정보 다음)에 남기고, 그 외에는 히어로 바로 다음으로 끌어올린다. */}
          {mode !== 'mine' ? <TeamBasicInfoCard team={team} capacity={capacity} /> : null}
          {mode === 'mine' ? <TeamUpcomingGamesCard teamId={team.id} canManageRosters={model.canManageGameRosters === true} /> : null}
          <TeamOpenMatchesSection fromHref={model.selfHref ?? `/teams/${model.team.id}`} matches={model.openMatches} loading={model.openMatchesLoading} />
          <TeamMyLeaguesSection leagues={model.myLeagues} loading={model.myLeaguesLoading} error={model.myLeaguesError} onRetry={model.onRetryMyLeagues} />
          <TeamRecordLinkCard
            href={withFromPath(`/teams/${team.id}/records`, model.subPageFrom)}
            title="팀 전적"
            description="승·무·패와 경기별 기록을 확인해요."
          />
          {isMyTeam || teamReviewCount > 0 ? (
            <TeamRecordLinkCard
              href={isMyTeam ? withFromPath('/my/reviews?tab=received', model.selfHref ?? `/teams/${model.team.id}`) : undefined}
              title="받은 후기"
              description={teamReviewDescription}
              badge={teamReviewCount > 0 && teamReviewAvg !== null ? `${teamReviewAvg.toFixed(1)} · ${teamReviewCount}팀` : null}
            />
          ) : null}
          {mode === 'mine' ? (
            <Link
              className="tm-pressable"
              href={`/teams/${team.id}/schedules`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-field)',
                padding: '16px 16px',
                background: 'var(--bg)',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <div>
                <div className="tm-text-label">팀 일정</div>
                <div className="tm-text-caption" style={{ marginTop: 4 }}>훈련·경기·이벤트 일정을 보고 참석을 체크해요.</div>
              </div>
              <ChevronRightIcon size={18} aria-hidden="true" />
            </Link>
          ) : null}
          {mode === 'mine' ? <TeamBasicInfoCard team={team} capacity={capacity} /> : null}
          <TeamOperationsSection operations={model.operations} />
          {/* (3) 비공개 카드: opacity dim 제거(텍스트 대비 정상화). disabled 회색 pill → Lock 아이콘 + tm-badge-grey 정적 라벨. */}
          <TeamDetailMembersCard team={team} subPageFrom={model.subPageFrom} />
        </div>

        {/* RIGHT: sticky sidebar
            (4) identity(팀 로고+팀명/지역) 중복 제거 — 히어로 카드에 이미 표시됨.
            구분선도 함께 제거. CTA + 핵심 결정단서(정원·모집상태·정기일정 1줄)만 남김. */}
        <aside className="tm-team-detail-desktop-sidebar">
          {/* 핵심 결정단서: 정원·모집상태·정기일정 — 가입 전 즉시 판단에 필요한 3가지 */}
          <div className="tm-team-detail-sidebar-meta">
            {/* 기본 상태 '가입 가능'은 칩 없이 두고 예외(가입 닫힘·정원 마감)만 알린다(H2·G13). */}
            {team.status === 'closed' ? <span className="tm-badge tm-badge-grey">{team.statusLabel}</span> : null}
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
          {/* 이미 소속된 사람에게는 안내 문구를 쓰지 않는다 — 팀원에겐 관리 권한이 없고(F33),
              버튼이 이미 "팀 채팅"이라 다른 일을 말하게 된다(F24). */}
          {mode === 'pending' ? (
            <TeamJoinPendingNotice requestedAtLabel={model.joinRequest?.requestedAtLabel} />
          ) : mode === 'mine' ? null : (
            <div className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {locked
                ? '신청 상태를 확인하고 다음 행동을 선택해 주세요.'
                : '신청 전에 팀 정보와 내 프로필 공개 범위를 확인해 주세요.'}
            </div>
          )}
          {/* P2: 완료 메시지에 .tm-complete-check 마이크로인터랙션 적용 (globals.css 키프레임) */}
          {heroMessage ? <div className="tm-text-caption tm-complete-check" role="status" style={{ color: 'var(--text-caption)', marginTop: 8 }}>{heroMessage}</div> : null}
          <div className="tm-team-detail-sidebar-cta">
            {model.contactHref || model.contactUnavailableReason ? (
              <TeamContactRow href={model.contactHref} unavailableReason={model.contactUnavailableReason}>
                <button
                  className={`tm-btn tm-btn-lg ${ctaTone} tm-btn-block`}
                  type="button"
                  disabled={!model.onCta || model.ctaPending}
                  onClick={() => runHeroAction(model.onCta, model.ctaSuccessMessage ?? (mode === 'pending' ? '신청을 취소했어요.' : '신청을 완료했어요.'), model.ctaFailureMessage)}
                >
                  {model.ctaPending ? '처리 중' : cta}
                </button>
              </TeamContactRow>
            ) : (
              <button
                className={`tm-btn tm-btn-lg ${ctaTone} tm-btn-block`}
                type="button"
                disabled={!model.onCta || model.ctaPending}
                onClick={() => runHeroAction(model.onCta, model.ctaSuccessMessage ?? (mode === 'pending' ? '신청을 취소했어요.' : '신청을 완료했어요.'), model.ctaFailureMessage)}
              >
                {model.ctaPending ? '처리 중' : cta}
              </button>
            )}
          </div>
        </aside>
      </div>

      {/* Mobile layout (unchanged) */}
      <article ref={mobileBodyRef} className="tm-team-detail-body tm-hide-desktop tm-content-enter">
        {model.justCreated && model.manageShortcuts ? <TeamCreatedNotice inviteHref={model.manageShortcuts.inviteHref} /> : null}
        <Card pad={20} className="tm-team-detail-hero-card" style={teamHeroStyle(team)}>
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
          <div className="tm-team-detail-hero-identity">
            <div className="tm-text-heading" style={{ color: 'var(--static-white)' }} aria-hidden="true">{team.name}</div>
            <div className="tm-text-caption" style={{ color: 'var(--overlay-white-72)', marginTop: 4 }}>{team.sport} · {team.region}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              {/* 기본 상태 '가입 가능'은 칩 없이 두고 예외(가입 닫힘·정원 마감)만 알린다(H2·G13). */}
              {team.status === 'closed' ? <span className="tm-badge tm-badge-grey">{team.statusLabel}</span> : null}
              <span className="tm-badge tm-badge-grey">{memberCapacity}</span>
            </div>
          </div>
        </Card>
        {model.manageShortcuts ? <TeamManageShortcuts shortcuts={model.manageShortcuts} /> : null}
        {mode === 'pending' ? (
          <TeamJoinPendingNotice requestedAtLabel={model.joinRequest?.requestedAtLabel} />
        ) : null}
        {/* 전술보드 입구 — **모바일 블록에도 반드시 있어야 한다.** 이 화면은 데스크톱
            (.tm-show-desktop)과 모바일(.tm-hide-desktop) JSX 를 따로 그리는데, 처음엔
            데스크톱 쪽에만 넣어서 **모바일에서는 진입점이 아예 없었다** — 이 앱의 본무대가
            모바일인데도. alpha 390/768 캡처가 그 섹션을 못 찾아 드러났다(데스크톱 1440
            에서만 찍혔다). 두 블록을 함께 고치는 것이 이 파일의 규약이다. */}
        {/* 비회원·가입 희망자는 매치·리그보다 팀 소개·가입 조건을 먼저 봐야 한다(QA
            피드백) — mode==='mine' 에서만 아래쪽 원래 자리(경기 정보 다음)에 남긴다. */}
        {mode !== 'mine' ? <TeamBasicInfoCard team={team} capacity={capacity} /> : null}
        {mode === 'mine' ? <TeamUpcomingGamesCard teamId={team.id} canManageRosters={model.canManageGameRosters === true} /> : null}
        <TeamOpenMatchesSection fromHref={model.selfHref ?? `/teams/${model.team.id}`} matches={model.openMatches} loading={model.openMatchesLoading} />
        <TeamMyLeaguesSection leagues={model.myLeagues} loading={model.myLeaguesLoading} error={model.myLeaguesError} onRetry={model.onRetryMyLeagues} />

        {/* 기록으로 가는 링크 묶음. 예전에는 "팀 전적" 링크 하나가 위 매치 섹션과 **간격 0px
            로 맞붙어**(alpha 390 실측) 그 섹션의 일부처럼 보였다 — 별개 항목이므로 자기
            제목과 여백을 가진 섹션으로 세운다. */}
        <SectionTitle title="팀 기록" sub="이 팀의 성적과 평가를 확인해요." />
        <div style={{ display: 'grid', gap: 12 }}>
          {/* 데스크톱 레이아웃에만 있던 링크 — 모바일에서 팀 전적으로 갈 방법이 아예 없었다. */}
          <TeamRecordLinkCard
            href={withFromPath(`/teams/${team.id}/records`, model.subPageFrom)}
            title="팀 전적"
            description="승·무·패와 경기별 기록을 확인해요."
          />
          {/* 내 팀은 후기가 0건이어도 "아직 없다"는 사실이 정보다(쌓아야 할 것). 남의 팀은
              받은 후기가 있을 때만 보여준다 — 빈 카드는 방문자에게 알려줄 게 없다. */}
          {isMyTeam || teamReviewCount > 0 ? (
            <TeamRecordLinkCard
              href={isMyTeam ? withFromPath('/my/reviews?tab=received', model.selfHref ?? `/teams/${model.team.id}`) : undefined}
              title="받은 후기"
              description={teamReviewDescription}
              // 별점만 두면 몇 명이 준 점수인지 알 수 없다 — 개수를 함께 적는다.
              badge={teamReviewCount > 0 && teamReviewAvg !== null ? `${teamReviewAvg.toFixed(1)} · ${teamReviewCount}팀` : null}
            />
          ) : null}
        </div>
        {mode === 'mine' ? <TeamBasicInfoCard team={team} capacity={capacity} /> : null}
        <TeamOperationsSection operations={model.operations} />
        {/* (3) 비공개 카드: opacity dim 제거(텍스트 대비 정상화). disabled 회색 pill → Lock 아이콘 + tm-badge-grey 정적 라벨. */}
        <TeamDetailMembersCard team={team} subPageFrom={model.subPageFrom} />
      </article>
      <div ref={mobileCtaRef} className="tm-fixed-cta tm-hide-desktop">
        {/* 승인 대기 중에는 본문의 안내 카드가 상태를 이미 설명하고, 이미 소속된 사람에게는
            버튼("팀 채팅")과 다른 일을 말하는 안내가 없어야 한다(F24·F33). */}
        {mode === 'pending' || mode === 'mine' ? null : (
          <div className="tm-text-caption" style={{ marginBottom: 8 }}>
            {locked
              ? '상태를 확인한 뒤 다음 행동을 선택해 주세요.'
              : '신청 전 팀 정보와 내 프로필 공개 범위를 확인해 주세요.'}
          </div>
        )}
        {/* P2: 완료 메시지 .tm-complete-check 마이크로인터랙션 */}
        {heroMessage ? <div className="tm-text-caption tm-complete-check" role="status" style={{ color: 'var(--text-caption)', marginBottom: 8 }}>{heroMessage}</div> : null}
        {model.contactHref || model.contactUnavailableReason ? (
          <TeamContactRow href={model.contactHref} unavailableReason={model.contactUnavailableReason}>
            <button className={`tm-btn tm-btn-lg ${ctaTone} tm-btn-block`} type="button" disabled={!model.onCta || model.ctaPending} onClick={() => runHeroAction(model.onCta, model.ctaSuccessMessage ?? (mode === 'pending' ? '신청을 취소했어요.' : '신청을 완료했어요.'), model.ctaFailureMessage)}>
              {model.ctaPending ? '처리 중' : cta}
            </button>
          </TeamContactRow>
        ) : (
          <button className={`tm-btn tm-btn-lg ${ctaTone} tm-btn-block`} type="button" disabled={!model.onCta || model.ctaPending} onClick={() => runHeroAction(model.onCta, model.ctaSuccessMessage ?? (mode === 'pending' ? '신청을 취소했어요.' : '신청을 완료했어요.'), model.ctaFailureMessage)}>
            {model.ctaPending ? '처리 중' : cta}
          </button>
        )}
      </div>
    </>
  );
}

/** 팀을 막 만든 팀장에게 — 성공했다는 사실과 다음 할 일(첫 멤버 초대)을 한 줄로(G12 F25). */
function TeamCreatedNotice({ inviteHref }: { inviteHref: string }) {
  return (
    <div className="tm-card tm-on-tint tm-team-created-card">
      <span aria-hidden="true" className="tm-team-created-icon"><Check size={18} strokeWidth={3} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>팀을 만들었어요</div>
        <div className="tm-text-caption" style={{ marginTop: 2 }}>첫 멤버를 초대하면 팀이 시작돼요.</div>
      </div>
      <Link className="tm-btn tm-btn-sm tm-btn-primary" style={{ minHeight: 44, flex: 'none' }} href={inviteHref}>멤버 초대</Link>
    </div>
  );
}

/** 팀장·매니저 바로가기 두 칸 — 두 화면 아래 운영 메뉴까지 내려가지 않게(G12 F26). */
function TeamManageShortcuts({ shortcuts }: { shortcuts: NonNullable<TeamDetailViewModel['manageShortcuts']> }) {
  return (
    <div className="tm-team-shortcut-grid">
      <Link className="tm-card tm-pressable tm-team-shortcut" href={shortcuts.membersHref}>
        <span className="tm-text-label">멤버 관리</span>
        <span className="tm-text-caption">초대·가입 신청·역할</span>
      </Link>
      <Link className="tm-card tm-pressable tm-team-shortcut" href={shortcuts.editHref}>
        <span className="tm-text-label">팀 정보 수정</span>
        <span className="tm-text-caption">소개·로고·공개 범위</span>
      </Link>
    </div>
  );
}

/**
 * 승인 대기 안내.
 *
 * 신청 직후의 토스트는 몇 초 뒤 사라지고, 다시 들어온 사용자에게 남는 단서는
 * "신청 취소" 버튼뿐이었다. 그것만으로는 승인을 기다리는 중인지, 무엇이 잘못된 건지
 * 알 수 없어 상태를 화면에 상시로 남긴다.
 */
function TeamJoinPendingNotice({ requestedAtLabel }: { requestedAtLabel?: string }) {
  return (
    <Card pad={16} className="tm-team-join-pending">
      <div className="tm-team-join-pending-head">
        <span className="tm-badge tm-badge-orange">승인 대기 중</span>
        {requestedAtLabel ? <span className="tm-text-caption">{requestedAtLabel}</span> : null}
      </div>
      <p className="tm-text-body tm-team-join-pending-body">
        팀장·매니저가 가입 신청을 확인하고 있어요. 승인되면 알림으로 알려드릴게요.
      </p>
    </Card>
  );
}

/** 컨택 보내기 + 주 CTA 한 줄. 보낼 수 없는 팀이면 링크 대신 이유를 가리키는 비활성 버튼과 그 이유를 보여준다. */
function TeamContactRow({ href, unavailableReason, children }: { href?: string; unavailableReason?: string; children: ReactNode }) {
  const reasonId = useId();
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
        {unavailableReason || !href ? (
          <button className="tm-btn tm-btn-lg tm-btn-neutral" type="button" disabled aria-describedby={reasonId}>
            컨택 보내기
          </button>
        ) : (
          <Link className="tm-btn tm-btn-lg tm-btn-neutral" href={href}>
            컨택 보내기
          </Link>
        )}
        {children}
      </div>
      {unavailableReason ? (
        <p id={reasonId} className="tm-text-caption" style={{ margin: '8px 0 0' }}>
          {unavailableReason}
        </p>
      ) : null}
    </>
  );
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
  // 저장 버튼은 화면 맨 아래, 오류 안내는 맨 위라 저장이 거절돼도 아무 일 없어 보인다 — 안내가 생기면 끌어온다.
  const errorRef = useRef<HTMLDivElement>(null);
  const formError = form?.error;
  useEffect(() => {
    if (formError) revealAndFocus(errorRef.current);
  }, [formError]);
  const [logoPickerOpen, setLogoPickerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreId = useId();
  const coverField = <TeamCoverImageField coverImageUrl={team.coverImageUrl} uploadImage={form?.uploadImage} onChange={(url) => form?.onFieldChange('coverImageUrl', url)} />;
  const descriptionField = <CreateField label="팀 소개" value={team.description} placeholder="예: 주 1회 꾸준히 함께 경기할 멤버를 찾아요." multiline rows={4} inputClassName="tm-team-description-input" onChange={(value) => form?.onFieldChange('description', value)} />;
  const detailFields = (
    <>
      <div className="tm-create-two-col"><TeamLevelSelect value={team.level} onChange={(value) => form?.onFieldChange('level', value)} /><TeamCapacityField value={team.capacity} min={form?.minCapacity} onChange={(value) => form?.onFieldChange('capacity', value)} /></div>
      <GenderRuleSelector value={team.genderRule} onChange={(value) => form?.onFieldChange('genderRule', value)} />
      <TeamActivityFields team={team} form={form} />
    </>
  );
  // title은 mode(edit/create)로만 갈리고 mode는 어느 pathname이 이 컴포넌트를 렌더했는지로
  // 완전히 결정된다(/teams/new → create, /teams/:id/edit → edit) — fetch 의존이 아니라
  // route-chrome 테이블에 두 pathname 각각의 정적 title로 등록돼 있다(fragments/teams.ts).
  // backHref(cancelHref)는 `?from=my` 쿼리에 따라 달라질 수 있지만 ShellOverride엔 backHref
  // 필드가 없어(shell-override.ts) 셸의 back 버튼은 테이블 값을 그대로 쓴다 — 콘텐츠 안의
  // 데스크톱 back 링크(바로 아래)만 cancelHref를 그대로 반영한다(fragments/teams.ts 주석 참고).
  return (
    <>
      {/* Desktop back header */}
      <div className="tm-desktop-page-head tm-show-desktop">
        <AppBackLink className="tm-desktop-back" fallbackHref={cancelHref}>
          <ChevronLeftIcon size={22} strokeWidth={2.2} aria-hidden="true" />
        </AppBackLink>
        <h1 className="tm-text-heading">{edit ? '팀 수정' : '팀 만들기'}</h1>
      </div>
      <div className="tm-team-form-grid tm-content-enter">
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
          {!edit ? (
            <>
              <h2 className="tm-text-heading">새 팀을 만들어요</h2>
              <div className="tm-text-caption" style={{ marginTop: 4 }}>이름·종목·활동 지역만 정하면 바로 시작해요.</div>
            </>
          ) : null}
          {form?.error ? <div ref={errorRef} tabIndex={-1} role="alert"><Card pad={16} style={{ marginTop: 16, background: 'var(--red50)' }}><div className="tm-text-label">저장할 수 없어요</div><div className="tm-text-caption" style={{ marginTop: 4 }}>{form.error}</div></Card></div> : null}
          <CreateField label="팀 이름" value={team.name} placeholder="예: 성수 풋살 크루" error={form?.nameError} onChange={(value) => form?.onFieldChange('name', value)} />
          {edit || logoPickerOpen ? (
            <TeamLogoField logoUrl={team.logoUrl} teamName={team.name} uploadImage={form?.uploadImage} onChange={(url) => form?.onFieldChange('logoUrl', url)} />
          ) : (
            <TeamLogoSummaryRow logoUrl={team.logoUrl} teamName={team.name} onChange={() => setLogoPickerOpen(true)} />
          )}
          {edit ? coverField : null}
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
          <RegionSelect
            value={form?.regionId ?? ''}
            regions={form?.regions ?? []}
            onChange={form?.onRegionChange}
            caption={
              edit
                ? '팀 추천과 지역 검색에 쓰여요. 세부 장소나 예외 일정은 아래 활동 메모에 적어 주세요.'
                : form?.regionPrefilled
                  ? '내 활동 지역으로 채웠어요. 바꿀 수 있어요.'
                  : '팀 추천과 지역 검색에 쓰여요.'
            }
          />
          {edit ? (
            <>
              {descriptionField}
              <TeamJoinPolicyField form={form} />
              {detailFields}
              {model.dissolveHref ? <TeamManageDissolveEntry dissolveHref={model.dissolveHref} /> : null}
            </>
          ) : (
            <>
              {/* 선택 항목이 필수 항목을 첫 화면 밖으로 밀지 않게 접어 둔다(F22). */}
              <button
                type="button"
                className="tm-card tm-pressable tm-team-form-more"
                aria-expanded={moreOpen}
                aria-controls={moreId}
                onClick={() => setMoreOpen((current) => !current)}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="tm-text-label" style={{ display: 'block' }}>
                    더 꾸미기 <span className="tm-text-caption" style={{ fontWeight: 400 }}>(선택)</span>
                  </span>
                  <span className="tm-text-caption" style={{ display: 'block', marginTop: 2 }}>상단 이미지 · 팀 소개 · 레벨 · 정원 · 성별 · 활동 일정</span>
                </span>
                <ChevronDown size={20} aria-hidden="true" className="tm-team-form-more-chevron" data-open={moreOpen ? 'true' : undefined} />
              </button>
              <div id={moreId} hidden={!moreOpen}>
                {coverField}
                {descriptionField}
                {detailFields}
              </div>
            </>
          )}
        </div>
        {/* Desktop-only sticky rail: live team-card preview + CTA (mobile uses the fixed CTA below). */}
        <aside className="tm-team-form-rail tm-show-desktop" aria-label="팀 미리보기">
          <TeamFormPreview team={team} sportName={previewSport} regionName={previewRegion} />
          <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" type="button" disabled={form?.submitting} onClick={form?.onSubmit}>{form?.submitting ? '저장 중' : edit ? '저장' : '팀 만들기'}</button>
          <Link className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" href={cancelHref}>{edit ? '취소' : '이전'}</Link>
        </aside>
      </div>
      <div className="tm-fixed-cta tm-team-form-cta tm-hide-desktop"><div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}><Link className="tm-btn tm-btn-lg tm-btn-neutral" href={cancelHref}>{edit ? '취소' : '이전'}</Link><button className="tm-btn tm-btn-lg tm-btn-primary" type="button" disabled={form?.submitting} onClick={form?.onSubmit}>{form?.submitting ? '저장 중' : edit ? '저장' : '팀 만들기'}</button></div></div>
    </>
  );
}

function TeamJoinPolicyField({ form }: { form?: TeamFormViewModel['form'] }) {
  const options = [
    {
      value: 'approval_required' as const,
      label: '가입 가능',
      description: '가입 가능 · 새 멤버가 가입 신청을 보내고 팀장·매니저가 승인해요.',
    },
    {
      value: 'closed' as const,
      label: '가입 닫힘',
      // 서버는 닫힌 팀의 승인을 막는다(거절은 된다) — '이미 낸 신청도 처리할 수 있다'고 쓰면 틀린 말이 된다.
      description: '가입 닫힘 · 새 가입 신청을 받지 않아요. 기다리는 신청은 다시 열어야 승인할 수 있어요.',
    },
  ];

  return (
    <div className="tm-create-field">
      <div className="tm-text-label">가입 신청</div>
      <div className="tm-team-form-chip-row" role="group" aria-label="가입 신청 선택">
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
      <div className="tm-text-caption" style={{ marginTop: 8 }}>
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

/** 만들기 첫 화면의 로고 한 줄 — 무작위 기본 로고로 시작하고, 바꿀 때만 고르는 칸을 연다(B-1). */
function TeamLogoSummaryRow({ logoUrl, teamName, onChange }: { logoUrl: string | null; teamName: string; onChange: () => void }) {
  return (
    <div className="tm-create-field">
      <div className="tm-text-label">팀 로고</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
        <TeamAvatar seed={teamName} name={teamName} logoUrl={logoUrl} size="lg" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tm-text-body" style={{ color: 'var(--text-strong)' }}>기본 로고로 시작해요</div>
          <div className="tm-text-caption" style={{ marginTop: 2 }}>나중에 내 이미지로 바꿀 수 있어요.</div>
        </div>
        <button type="button" className="tm-btn tm-btn-sm tm-btn-neutral" style={{ minHeight: 44 }} onClick={onChange}>바꾸기</button>
      </div>
    </div>
  );
}

/**
 * Team-logo presets and custom upload share the existing draft.logoUrl contract.
 * TeamAvatar remains the final fallback when the selected URL cannot be loaded.
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
      <div className="tm-text-label">팀 로고</div>
      <div className="tm-team-logo-picker">
        <div className="tm-team-logo-current">
          {/* 팀 id가 아직 없는 create/edit draft이므로 팀명을 seed로 사용(TeamAvatar 자체 fallback과 동일 규칙). */}
          <TeamAvatar seed={teamName} name={teamName} logoUrl={logoUrl} size="xl" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            <button
              type="button"
              className="tm-btn tm-btn-sm tm-btn-neutral"
              disabled={uploading || !uploadImage}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? '올리는 중…' : '내 이미지 업로드'}
            </button>
            <div className="tm-text-caption">
              기본 로고를 고르거나 정사각형 이미지를 직접 올릴 수 있어요.
            </div>
          </div>
        </div>
        <div className="tm-team-logo-presets" role="group" aria-label="기본 팀 로고 선택">
          {TEAM_LOGO_PRESETS.map((presetUrl, index) => {
            const selected = isTeamLogoPreset(logoUrl) && logoUrl === presetUrl;
            return (
              <button
                key={presetUrl}
                type="button"
                className="tm-team-logo-preset"
                aria-label={'기본 팀 로고 ' + (index + 1)}
                aria-pressed={selected}
                disabled={uploading}
                onClick={() => onChange(presetUrl)}
              >
                <TeamAvatar seed={presetUrl} name={'기본 팀 로고 ' + (index + 1)} logoUrl={presetUrl} size="md" />
                {selected ? <span className="tm-team-logo-check" aria-hidden="true"><Check size={12} strokeWidth={3} /></span> : null}
              </button>
            );
          })}
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
        <div className="tm-text-caption" style={{ color: 'var(--red700)', marginTop: 8 }}>{error}</div>
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
      {/* minHeight는 실제 팀 상세 히어로 카드(.tm-team-detail-hero-card)의 콘텐츠 높이를 그대로
          맞춘 값이다 — pad 18*2 + avatar(xl) 72 + margin 14 + heading line-height 32 + margin 4 +
          caption line-height 16 + margin 12 + badge row 24 = 210px. 이전 132px는 실제보다
          약 60% 낮아 사진 상하가 실제보다 덜 잘려 보이는 미리보기-실사용 불일치가 있었다. */}
      <div
        // 사진이 없을 때 지면에 색이 깔린다 — 그 위 안내 문구를 함께 올린다(.tm-on-tint).
        className="tm-on-tint"
        style={{
          marginTop: 12,
          minHeight: 210,
          borderRadius: 'var(--radius-field)',
          border: '1px solid var(--border-strong)',
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
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
      {error ? <div className="tm-text-caption" style={{ color: 'var(--red700)', marginTop: 8 }}>{error}</div> : null}
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
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <span className="tm-badge tm-badge-grey">{level}</span>
              <span className="tm-badge tm-badge-grey">{capacity}</span>
              <span className="tm-badge tm-badge-grey">{gender}</span>
            </div>
            {activity ? <div className="tm-text-caption" style={{ marginTop: 8 }}>{activity}</div> : null}
          </div>
        </div>
        <div className="tm-team-intro-box">
          <div className="tm-text-label">팀 소개</div>
          <div className="tm-text-body" style={{ marginTop: 8, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {intro || '팀 소개를 입력하면 여기에 보여요.'}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TeamMembersPageView({ model, backHref = '/teams' }: { model: TeamMembersViewModel; backHref?: string }) {
  const canManageMembers = isTeamOperatorRole(model.viewerRole);
  const visibleTabs = model.tabs.filter((tab) => tab.key === 'members' || canManageMembers);
  return (
    <>
      {/* Desktop back header */}
      <div className="tm-desktop-page-head tm-show-desktop">
        <AppBackLink className="tm-desktop-back" fallbackHref={backHref}>
          <ChevronLeftIcon size={22} strokeWidth={2.2} aria-hidden="true" />
        </AppBackLink>
        <h1 className="tm-text-heading">{model.teamName} · {canManageMembers ? '멤버 관리' : '멤버 목록'}</h1>
      </div>
      <div className="tm-team-list tm-team-members-list tm-content-enter">
        <h2 className="tm-text-heading tm-hide-desktop">{model.teamName}</h2>
        <div className="tm-team-stat-grid" style={{ gridTemplateColumns: canManageMembers ? '1fr 1fr 1fr' : '1fr 1fr' }}>
          <Card pad={12}><KPIStat label="전체" value={model.summary.total} unit="명" /></Card>
          <Card pad={12}><KPIStat label="팀장·매니저" value={model.summary.managers} unit="명" /></Card>
          {canManageMembers ? <Card pad={12}><KPIStat label="가입 신청 대기" value={model.summary.pending} unit="명" /></Card> : null}
        </div>
        {model.selfNotice ? <div style={{ marginTop: 16 }}>{model.selfNotice}</div> : null}
        <ActionErrorNotice message={model.actionError} />
        {/* 가입 신청 승인은 바로 반영되므로 "모든 변경은 확인 창" 은 더 이상 맞지 않는다(G12 승인 즉시). */}
        {canManageMembers ? (
          <p className="tm-text-caption tm-member-rule-line">
            <Info size={14} aria-hidden="true" style={{ flex: 'none' }} />
            역할 변경·거절·내보내기는 확인 창을 거쳐요. 승인은 바로 반영돼요.
          </p>
        ) : null}
        {visibleTabs.length > 1 ? (
          <div className="tm-team-form-chip-row" role="group" aria-label="멤버 탭 선택" style={{ marginTop: 16 }}>
            {visibleTabs.map((tab) => (
              <button key={tab.key} className={`tm-chip ${model.activeTab === tab.key ? 'tm-chip-active' : ''}`} type="button" aria-pressed={model.activeTab === tab.key} onClick={tab.onSelect}>
                {tab.label} <span className="tab-num">{tab.count}</span>
              </button>
            ))}
          </div>
        ) : null}
        {!canManageMembers || model.activeTab === 'members' ? (
          <TeamMembersSection members={model.members} loading={model.membersLoading} />
        ) : model.activeTab === 'requests' ? (
          <JoinRequestSection model={model} />
        ) : model.invitations ? (
          <InvitationSection invitations={model.invitations} />
        ) : null}
        {model.soloOwner && model.activeTab === 'members' ? <SoloOwnerCard {...model.soloOwner} /> : null}
      </div>
    </>
  );
}

/**
 * 가입 신청 — 승인이 주 버튼, 거절은 글자 버튼(F38). 승인은 바로 반영되고 거절만 확인 창(F37).
 * 둘 이상 기다리면 "모두 승인" 한 번(확인 창)으로 받는다.
 */
function JoinRequestSection({ model }: { model: TeamMembersViewModel }) {
  if (model.requestsLoading) {
    return (
      <div className="tm-member-request-list" aria-busy="true" aria-label="가입 신청 불러오는 중">
        {[0, 1].map((i) => <div key={i} className="tm-review-skeleton" style={{ height: 68, borderRadius: 'var(--radius-container)' }} aria-hidden="true" />)}
      </div>
    );
  }
  if (model.requests.length === 0) {
    return (
      <section className="tm-member-section">
        <EmptyState title="기다리는 가입 신청이 없어요" sub="새 신청이 오면 알림으로 알려 드려요." />
      </section>
    );
  }
  const approveAll = model.approveAll;
  return (
    <section className="tm-member-section" aria-label="가입 신청">
      {approveAll ? (
        <div className="tm-on-tint tm-member-approve-all">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>{approveAll.count}명이 기다리고 있어요</div>
            <div className="tm-text-caption" style={{ marginTop: 2 }}>한 번에 받을 수도 있어요.</div>
          </div>
          <button className="tm-btn tm-btn-md tm-btn-primary" type="button" style={{ flex: 'none' }} disabled={approveAll.pending} onClick={approveAll.onSelect}>
            {approveAll.pending ? '승인하는 중…' : '모두 승인'}
          </button>
        </div>
      ) : (
        <div className="tm-text-caption">승인하면 바로 팀 멤버가 돼요.</div>
      )}
      <div className="tm-member-request-list">
        {model.requests.map((request) => (
          <div key={request.id} className="tm-card tm-member-request-row">
            <MemberInitial name={request.name} />
            <div style={{ flex: 1, minWidth: 0 }}>
              {request.profileHref ? (
                <Link className="tm-text-body tm-member-name-link" href={request.profileHref}>{request.name}</Link>
              ) : (
                <div className="tm-text-body" style={{ color: 'var(--text-strong)' }}>{request.name}</div>
              )}
              <div className="tm-text-caption line-clamp-1" style={{ marginTop: 2 }}>{request.meta}</div>
            </div>
            {request.approved ? (
              <span className="tm-badge tm-badge-green" style={{ gap: 4, flex: 'none' }}>
                <Check size={12} strokeWidth={3} aria-hidden="true" />승인 완료
              </span>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 'none' }}>
                <button className="tm-btn tm-btn-sm tm-btn-ghost tm-member-reject" type="button" aria-label={`${request.name} 가입 신청 거절`} disabled={request.pending} onClick={request.onReject}>거절</button>
                <button className="tm-btn tm-btn-sm tm-btn-primary" type="button" aria-label={`${request.name} 가입 신청 승인`} disabled={request.pending} onClick={request.onApprove}>승인</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/** 사람 이름 첫 글자 동그라미 — 가입 신청·초대·멤버 행이 같은 모양을 쓴다. */
function MemberInitial({ name }: { name: string }) {
  return <span aria-hidden="true" className="tm-member-initial">{Array.from(name)[0] ?? '?'}</span>;
}

/** 목록 어디서 눌렀든 거절 이유가 화면 밖 위쪽에 묻히지 않게, 생길 때 끌어와 읽힌다. */
function ActionErrorNotice({ message }: { message?: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (message) revealAndFocus(ref.current);
  }, [message]);
  if (!message) return null;
  return (
    <div ref={ref} tabIndex={-1} style={{ marginTop: 16 }}>
      <AlertBanner message={message} />
    </div>
  );
}

function InvitationSection({ invitations }: { invitations: NonNullable<TeamMembersViewModel['invitations']> }) {
  const { form, items, listLoading, listError, onRetry } = invitations;

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
            <label htmlFor="invite-email" className="tm-text-label" style={{ flexShrink: 0, paddingTop: 12 }}>
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
            <label htmlFor="invite-message" className="tm-text-label" style={{ flexShrink: 0, paddingTop: 12 }}>
              메시지
              <span className="tm-text-caption" style={{ fontWeight: 400, marginLeft: 4 }}>(선택)</span>
            </label>
            <textarea
              id="invite-message"
              className="tm-input"
              value={form.message}
              placeholder="함께 하고 싶은 이유를 적어 보세요."
              rows={2}
              maxLength={INVITE_MESSAGE_MAX_LENGTH}
              onChange={(event) => form.onMessageChange(event.target.value)}
              disabled={form.submitting}
              style={{ resize: 'none', lineHeight: 1.5 }}
            />
          </div>
          {form.error ? (
            <div id="invite-email-error" className="tm-text-caption" role="alert" style={{ color: 'var(--red700)' }}>
              {form.error}
            </div>
          ) : null}
          {form.successMessage ? (
            <div className="tm-text-caption" role="status" style={{ color: 'var(--green700)' }}>
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
      <div className="tm-text-caption" style={{ marginTop: 3, marginBottom: 12 }}>아직 수락되지 않은 초대예요.</div>
      {listLoading ? (
        <div style={{ display: 'grid', gap: 12 }} aria-busy="true" aria-label="초대 목록 불러오는 중">
          {[0, 1].map((i) => (
            <div key={i} className="tm-review-skeleton" style={{ height: 64, borderRadius: 'var(--radius-field)' }} aria-hidden="true" />
          ))}
        </div>
      ) : listError ? (
        <EmptyState
          title="초대 목록을 불러오지 못했어요"
          sub="잠시 후 다시 시도해 주세요."
          cta="다시 시도"
          onCta={onRetry}
        />
      ) : items.length === 0 ? (
        <EmptyState illustration={{ name: 'chat-empty' }} title="보낸 초대가 없어요" sub="이메일로 팀원을 초대하면 여기에 표시돼요." />
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {items.map((item) => (
            <div key={item.invitationId} className="tm-invitation-card">
              <div className="tm-invitation-card-head">
                <MemberInitial name={item.displayName} />
                <div className="tm-invitation-meta">
                  <span className="tm-invitation-meta-name">{item.displayName}</span>
                  <span className="tm-invitation-meta-date">{formatInvitationDate(item.createdAt)} 초대</span>
                </div>
                {/* 비색상 지표: 텍스트 '초대 중' 병기 */}
                <span className="tm-invitation-status tm-invitation-status-pending" aria-label="초대 상태: 초대 중">
                  초대 중
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
    <div className="tm-list-searchbar tm-team-searchbar">
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

  // BottomSheet 는 URL 로 열림·닫힘을 소유하는 controlled 컴포넌트(A안) — 이 함수 자체가
  // 이미 `model.filterSheet?.open` 게이트(호출부 line 109) 뒤에서만 렌더되므로 open 은 항상
  // true 로 고정한다. 닫기는 BottomSheet 가 closeHref 로 네비게이션해 URL 이 권위를 유지한다.
  return (
    <>
      <BottomSheet open ariaLabel="팀 필터" closeHref={sheet.closeHref}>
        <div className="tm-filter-sheet-handle" />
        <div className="tm-filter-sheet-head">
          <div>
            <div className="tm-text-subhead">필터</div>
            <div className="tm-text-caption" style={{ marginTop: 2 }}>정렬과 팀 조건을 조정해 보세요.</div>
          </div>
          <Link className="tm-btn tm-btn-sm tm-btn-ghost" href={sheet.resetHref} style={{ color: 'var(--text-caption)' }}>초기화</Link>
        </div>
        {[
          ['지역', sheet.regionOptions],
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
      </BottomSheet>
    </>
  );
}

function formatInvitationDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '날짜 미정';
  return new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit' }).format(date);
}

/** 고르는 화면의 카드라 한 줄씩만 쓴다(390 에서 5장). 팀장 이름은 비교 축이 아니라 팀 상세에서 본다. */
function TeamCard({ team }: { team: TeamModel }) {
  // 활동 일정과 소개 중 한 줄만 — 둘 다 없으면 줄 자체를 그리지 않는다.
  const extraLine = team.next.trim() || team.intro.trim();
  const memberCapacity = formatMemberCapacity(team);

  return (
    <Link className="tm-team-card tm-team-card-compact tm-pressable" href={`/teams/${team.id}`}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <TeamAvatar seed={team.id} name={team.name} logoUrl={team.logoUrl} size="lg" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tm-text-body-lg line-clamp-1">{team.name}</div>
          <div className="tm-text-caption" style={{ marginTop: 2 }}>{team.sport} · {team.region} · <span style={{ fontVariantNumeric: 'tabular-nums' }}>{memberCapacity}</span></div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {/* 레벨 태그는 서버가 자유 텍스트로 준다 — 길면 형제 배지를 다음 줄로 밀어낼 수
                있다(flexWrap:'wrap'). 형제와 나눈 고정 %(예전 62%)로 잘라 한 줄을 지키던
                예전 방식은 카드 폭이 좁아지는 768(2열 그리드)에서 "입문-고수" 같은 짧은 값까지
                잘랐다(2026-09-26 alpha 감사). 이제는 형제가 있어도 각 배지가 자기 줄 전체 폭
                (max-width:100%, globals.css .tm-team-tag)까지 쓸 수 있다 — 자유 텍스트 하나가
                혼자로도 그 폭을 넘길 만큼 길 때만 ellipsis 로 잘린다(카드 밖 가로 스크롤 방지). */}
            {dedupeTags([...team.tags, team.genderRule]).map((tag) => (
              <span key={tag} className="tm-badge tm-badge-grey tm-team-tag">
                <span className="tm-team-tag-text">{tag}</span>
              </span>
            ))}
            {/* '가입 가능' 은 목록에서 정보가 되지 않는다 — alpha 실측(2026-09-07)에서
                50팀 중 50팀이 같은 값이었고, 머리말에도 "50팀 · 가입 가능 50" 이 이미 있다.
                그 한 줄을 위해 구분선 + 49px 를 쓰고 있었다. 예외(가입 닫힘·정원 마감)만 알린다.
                예전 자리는 aria-hidden 이라 스크린리더에는 아예 안 읽혔다 — 배지로 옮기며 읽히게 된다. */}
            {team.status !== 'open' ? (
              <span className="tm-badge tm-badge-grey tm-team-card-status-badge">
                <svg width="7" height="7" viewBox="0 0 7 7" aria-hidden="true" style={{ flexShrink: 0 }}><circle cx="3.5" cy="3.5" r="3.5" fill="currentColor" /></svg>
                {team.statusLabel}
              </span>
            ) : null}
          </div>
          {extraLine ? <div className="tm-text-caption tm-team-card-activity line-clamp-1" style={{ marginTop: 6 }}>{extraLine}</div> : null}
        </div>
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

/* SectionTitle 로컬 복제본은 2026-09-07 에 제거하고 @/components/v1-ui/primitives 의 공유
   컴포넌트를 쓴다. 복제본은 title 과 sub 를 .tm-section-title(display:flex;
   justify-content: space-between)의 형제로 직접 넣어 둘이 좌우로 갈라졌고(alpha 390 실측:
   제목 x=40, 부제 x=197 로 같은 줄 양 끝), 공유 컴포넌트는 둘을 한 래퍼에 담아 세로로
   쌓는다. 값(17px/700)은 원래 같았지만 다음 변경 때 갈라질 자리였다 —
   DESIGN.md §2.1 "섹션 제목은 반드시 SectionTitle 프리미티브를 쓴다". */

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: 'var(--radius-circle)',
              background: 'var(--blue500)',
              flexShrink: 0,
            }}
            aria-hidden="true"
          />
          <span className="tm-text-body">{items[0]}</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
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

function TeamCapacityField({ value, min, onChange }: { value: number; min?: number; onChange?: (value: number) => void }) {
  // 이미 있는 팀원보다 적은 정원은 서버가 거절한다 — 저장 전에 입력 칸에서 막는다.
  const floor = Math.min(50, Math.max(2, min ?? 2));
  const options = Array.from({ length: 50 - floor + 1 }, (_, index) => index + floor);
  const normalized = Math.min(50, Math.max(floor, Number(value) || floor));

  return (
    <div className="tm-create-field">
      <div className="tm-text-label">정원</div>
      <div className="tm-create-stepper">
        <button className="tm-create-stepper-button" type="button" aria-label="정원 한 명 줄이기" disabled={normalized <= floor} onClick={() => onChange?.(Math.max(floor, normalized - 1))}>−</button>
        <select className="tm-create-input tm-create-select-control" aria-label="정원" value={normalized} onChange={(event) => onChange?.(Number(event.target.value))}>
          {options.map((item) => <option key={item} value={item}>{item}명</option>)}
        </select>
        <button className="tm-create-stepper-button" type="button" aria-label="정원 한 명 늘리기" onClick={() => onChange?.(Math.min(50, normalized + 1))}>+</button>
      </div>
      {min !== undefined ? (
        <div className="tm-text-caption" style={{ marginTop: 8 }}>
          {floor > 2 ? `지금 팀원이 ${floor}명이라 그보다 적게 정할 수 없어요.` : `지금 팀원이 ${min}명이에요.`} 정원이 다 차면 자동으로 “정원 마감”으로 보여요.
        </div>
      ) : null}
    </div>
  );
}

function CreateField({ label, value, placeholder, suffix, multiline, rows, inputClassName, type = 'text', error, onChange }: { label: string; value: string; placeholder?: string; suffix?: string; multiline?: boolean; rows?: number; inputClassName?: string; type?: string; error?: string; onChange?: (value: string) => void }) {
  const errorId = useId();
  const described = error ? { 'aria-invalid': true, 'aria-describedby': errorId } : {};
  // 오류 문구는 label 밖에 둔다 — 안에 두면 입력칸 이름에 문구까지 섞여 읽힌다.
  return (
    <>
      <label className="tm-create-field">
        <div className="tm-text-label">{label}</div>
        <div className={`tm-create-input ${multiline ? 'tm-create-input-multiline' : ''} ${error ? 'tm-create-input-error' : ''} ${inputClassName ?? ''}`}>
          {onChange ? (multiline ? <textarea className="tm-create-native-input" rows={rows} value={value} placeholder={placeholder} {...described} onChange={(event) => onChange(event.target.value)} /> : <input className="tm-create-native-input" type={type} value={value} placeholder={placeholder} {...described} onChange={(event) => onChange(event.target.value)} />) : <span className="tm-text-body" style={{ color: value ? 'var(--text-strong)' : 'var(--text-caption)' }}>{value || placeholder}</span>}
          {suffix ? <span className="tm-text-caption">{suffix}</span> : null}
        </div>
      </label>
      <FieldErrorText id={errorId} message={error} />
    </>
  );
}

function RegionSelect({
  value,
  regions,
  onChange,
  caption,
}: {
  value: string;
  regions: Array<{ id: string; name: string; shortName?: string; parentName?: string }>;
  onChange?: (regionId: string) => void;
  caption: string;
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
      <div className="tm-text-caption" style={{ marginTop: 8 }}>{caption}</div>
    </label>
  );
}
