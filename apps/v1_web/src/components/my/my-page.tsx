import Link from 'next/link';
import {
  Bell,
  ClipboardList,
  Crown,
  Dumbbell,
  FileText,
  LucideProps,
  LogOut,
  Mail,
  MapPin,
  Plus,
  Settings,
  Star,
  Users,
} from 'lucide-react';
import { LogoutButton } from '@/components/auth/logout-button';
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/v1-ui/icons';
import { AppChrome } from '@/components/v1-ui/shell';
import { Card, EmptyState, KPIStat, ListItem } from '@/components/v1-ui/primitives';
import { MyMemberCard } from './my-member-card';
import type {
  MyHomeViewModel,
  MyInvitationsViewModel,
  MyMatch,
  MyMatchesViewModel,
  MyMember,
  MyMenuItem,
  MyTeam,
  MyTeamDetailViewModel,
  MyTeamMembersViewModel,
  MyTeamsViewModel,
  NotificationSettingsViewModel,
  ProfileEditViewModel,
  SettingsViewModel,
} from './my.types';

/** Lucide 아이콘 이름 → 컴포넌트 매핑. view-model의 icon 문자열을 참조함. */
const MENU_ICON_MAP: Record<string, React.ComponentType<LucideProps>> = {
  ClipboardList,
  Plus,
  Users,
  Star,
  Dumbbell,
  Settings,
  MapPin,
  Bell,
  FileText,
  LogOut,
  Mail,
};

export function MyHomePageView({ model }: { model: MyHomeViewModel }) {
  return (
    <AppChrome title="마이페이지" activeTab="my" hasNewNotification={model.hasNewNotification} centerTitle>
      <div className="tm-my-shell">
        {/* Mobile layout: flat stack (unchanged) */}
        {/* Desktop layout: 2-column via tm-my-desktop-layout */}
        <div className="tm-my-desktop-layout">
          {/* LEFT sticky: profile identity */}
          <div className="tm-my-desktop-sidebar">
            <section className="tm-my-profile-head">
              <div className="tm-my-avatar">{model.user.initials}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="tm-text-heading">{model.user.name}</div>
                <div className="tm-text-caption" style={{ marginTop: 4 }}>{model.user.handle} · {model.user.region}</div>
                <div
                  className="tm-text-caption"
                  style={{
                    marginTop: 6,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {model.user.intro}
                </div>
              </div>
              <Link className="tm-btn tm-btn-sm tm-btn-neutral" href="/my/profile/edit">수정</Link>
            </section>
            {/* 활동 요약: stats strip을 Card로 감싸 섹션 라벨과 border/radius/padding 정합 */}
            <Card pad={16}>
              <div className="tm-text-body-lg">활동 요약</div>
              <div className="tm-my-profile-stats">{model.user.stats.map((stat) => <KPIStat key={stat.label} {...stat} />)}</div>
            </Card>
            <Card pad={16}>
              <div className="tm-text-body-lg">이번 달 활동</div>
              <div className="tm-my-monthly">{model.user.monthly.map((stat) => <KPIStat key={stat.label} {...stat} />)}</div>
            </Card>
          </div>
          {/* RIGHT: menu sections */}
          <div className="tm-my-desktop-main">
            <div className="tm-my-desktop-menu-grid">
              {model.sections.map((section) => <MenuSection key={section.title} section={section} />)}
            </div>
            {/* 로그아웃: 파괴 액션이 최강 CTA가 되지 않도록 ghost 텍스트 링크 수준으로 축소 (계정 설정 페이지에도 동일하게 있어 발견성 유지) */}
            <div className="tm-my-logout-row">
              <LogoutButton variant="ghost" />
            </div>
          </div>
        </div>
      </div>
    </AppChrome>
  );
}

export function MyMatchesPageView({ model }: { model: MyMatchesViewModel }) {
  const joined = model.mode === 'joined';
  return (
    <AppChrome title="내 매치" activeTab="my" bottomNav={false} backHref="/my">
      <div className="tm-my-shell tm-my-matches-desktop">
        {/* Desktop page head — hidden on mobile via tm-show-desktop */}
        <div className="tm-desktop-page-head tm-show-desktop">
          <Link className="tm-desktop-back" href="/my" aria-label="마이페이지로 돌아가기">
            <ChevronLeftIcon size={22} strokeWidth={2.5} />
          </Link>
          <h1 className="tm-text-heading">내 매치</h1>
        </div>
        <div className="tm-segment-row">
          <Link className={`tm-btn tm-btn-md ${joined ? 'tm-btn-primary' : 'tm-btn-neutral'}`} href="/my/matches/joined" aria-current={joined ? 'page' : undefined}>참여한 매치</Link>
          <Link className={`tm-btn tm-btn-md ${!joined ? 'tm-btn-primary' : 'tm-btn-neutral'}`} href="/my/matches/created" aria-current={!joined ? 'page' : undefined}>생성한 매치</Link>
        </div>
        {model.apiNotice ? (
          <Card pad={14} className={model.apiNotice.tone === 'warning' ? 'tm-auth-soft-card-warning' : undefined}>
            <div className="tm-text-body-lg">{model.apiNotice.title}</div>
            <div className="tm-text-caption" style={{ marginTop: 4 }}>{model.apiNotice.body}</div>
          </Card>
        ) : null}
        <div className="tm-my-list-stack">
          {/* 로딩/에러 중(apiNotice 노출)에는 '매치 없어요' 빈상태를 띄우지 않는다 — 알림 카드와 모순 방지 (Copilot) */}
          {!model.apiNotice && model.matches.length === 0 ? (
            <EmptyState
              title="표시할 매치가 없어요"
              sub={model.mode === 'joined' ? '매치에 참여하면 여기에 표시돼요.' : '매치를 만들면 여기에 표시돼요.'}
            />
          ) : (
            model.matches.map((match) => <MyMatchCard key={match.id} match={match} manage={model.mode === 'created'} />)
          )}
        </div>
      </div>
    </AppChrome>
  );
}

export function MyTeamsPageView({ model }: { model: MyTeamsViewModel }) {
  return (
    <AppChrome title="내 팀" activeTab="my" bottomNav={false} backHref="/my">
      <div className="tm-my-shell tm-my-teams-desktop">
        {/* Desktop page head */}
        <div className="tm-desktop-page-head tm-show-desktop">
          <Link className="tm-desktop-back" href="/my" aria-label="마이페이지로 돌아가기">
            <ChevronLeftIcon size={22} strokeWidth={2.5} />
          </Link>
          <h1 className="tm-text-heading">내 팀</h1>
        </div>
        <div className="tm-my-stat-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          {model.summary.map((stat) => <Card key={stat.label} pad={16}><KPIStat {...stat} /></Card>)}
        </div>
        <div className="tm-my-list-stack">
          {/* #14: 소속 팀이 없을 때 빈 상태 안내 */}
          {model.teams.length === 0
            ? <EmptyState title="소속 팀이 없어요" sub="팀을 만들거나 가입 신청해서 함께 뛰어 보세요." cta="팀 찾기" onCta={() => { window.location.href = '/teams'; }} />
            : model.teams.map((team) => <MyTeamCard key={team.id} team={team} />)}
        </div>
      </div>
    </AppChrome>
  );
}

export function MyInvitationsPageView({ model }: { model: MyInvitationsViewModel }) {
  return (
    <AppChrome title="받은 초대" activeTab="my" bottomNav={false} backHref="/my">
      <div className="tm-my-shell">
        {/* Desktop page head */}
        <div className="tm-desktop-page-head tm-show-desktop">
          <Link className="tm-desktop-back" href="/my" aria-label="마이페이지로 돌아가기">
            <ChevronLeftIcon size={22} strokeWidth={2.5} />
          </Link>
          <h1 className="tm-text-heading">받은 초대</h1>
        </div>
        {model.error ? (
          <EmptyState
            title="초대 목록을 불러오지 못했어요"
            sub="잠시 후 다시 시도해 주세요."
            cta="다시 시도"
            onCta={model.onRetry}
          />
        ) : model.invitations.length === 0 ? (
          <EmptyState title="받은 초대가 없어요" sub="팀에서 초대를 받으면 여기에 표시돼요." />
        ) : (
          <div className="tm-my-list-stack">
            {model.invitations.map((invitation) => (
              <div key={invitation.invitationId} className="tm-invitation-card">
                <div className="tm-invitation-card-head">
                  <div className="tm-team-logo">{invitation.teamLogo}</div>
                  <div className="tm-invitation-meta">
                    <div className="tm-invitation-meta-name">{invitation.teamName}</div>
                    <div className="tm-invitation-meta-sub">{invitation.invitedByName}님이 초대했어요</div>
                    <div className="tm-invitation-meta-date">{invitation.dateLabel}</div>
                  </div>
                </div>
                {invitation.message ? (
                  <div className="tm-invitation-message">{invitation.message}</div>
                ) : null}
                <div className="tm-invitation-actions">
                  <button
                    className="tm-btn tm-btn-sm tm-btn-primary"
                    type="button"
                    disabled={model.actionPending}
                    onClick={() => model.onAccept(invitation.invitationId)}
                    aria-label={`${invitation.teamName} 초대 수락`}
                  >
                    수락
                  </button>
                  <button
                    className="tm-btn tm-btn-sm tm-btn-ghost"
                    type="button"
                    disabled={model.actionPending}
                    onClick={() => model.onDecline(invitation.invitationId)}
                    aria-label={`${invitation.teamName} 초대 거절`}
                  >
                    거절
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppChrome>
  );
}

export function MyTeamDetailPageView({ model }: { model: MyTeamDetailViewModel }) {
  return (
    <AppChrome title="팀 정보" activeTab="my" bottomNav={false} backHref="/my/teams">
      <div className="tm-my-shell">
        {/* Desktop page head */}
        <div className="tm-desktop-page-head tm-show-desktop">
          <Link className="tm-desktop-back" href="/my/teams" aria-label="내 팀 목록으로 돌아가기">
            <ChevronLeftIcon size={22} strokeWidth={2.5} />
          </Link>
          <h1 className="tm-text-heading">{model.team.name}</h1>
        </div>
        {/* Desktop 2-column layout */}
        <div className="tm-my-team-detail-desktop">
          {/* LEFT: hero + info + recent matches */}
          <div className="tm-my-team-detail-left">
            <section className="tm-my-team-hero">
              <div className="tm-team-logo tm-team-logo-large">{model.team.logo}</div>
              <div>
                <h2 className="tm-text-heading">{model.team.name}</h2>
                <div className="tm-text-caption" style={{ marginTop: 4 }}>{model.team.sport} · {model.team.region} · {model.team.roleLabel}</div>
              </div>
              <p className="tm-text-body" style={{ margin: 0, lineHeight: 1.55 }}>{model.team.description}</p>
            </section>
            <Card pad={16}>
              <InfoRow label="멤버" value={`${model.team.members}명`} />
              <InfoRow label="매너" value={model.team.manner} />
              <InfoRow label="다음 일정" value={model.team.next} />
            </Card>
            {model.recentMatches.length > 0 ? (
              <>
                <div className="tm-my-section-label">최근 팀매치</div>
                <div className="tm-my-list-stack">{model.recentMatches.map((match) => <MyMatchCard key={match.id} match={match} manage />)}</div>
              </>
            ) : null}
          </div>
          {/* RIGHT sticky: action menu + CTA */}
          <div className="tm-my-team-detail-right">
            <MenuSection section={{ title: '운영 메뉴', items: model.actions }} />
            {/* Desktop inline CTA (replaces fixed bottom bar) */}
            <div className="tm-my-team-detail-cta tm-show-desktop">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Link className="tm-btn tm-btn-lg tm-btn-primary" href={model.chatHref ?? '/chat'}>팀 채팅</Link>
                <Link className="tm-btn tm-btn-lg tm-btn-neutral" href={`/teams/${model.team.id}`}>팀 정보</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Mobile fixed CTA — hidden on desktop */}
      <div className="tm-fixed-cta tm-hide-desktop">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Link className="tm-btn tm-btn-lg tm-btn-primary" href={model.chatHref ?? '/chat'}>팀 채팅</Link>
          <Link className="tm-btn tm-btn-lg tm-btn-neutral" href={`/teams/${model.team.id}`}>팀 정보</Link>
        </div>
      </div>
    </AppChrome>
  );
}

export function MyTeamMembersPageView({ model, backHref = '/my/teams/team-1' }: { model: MyTeamMembersViewModel; backHref?: string }) {
  return (
    <AppChrome title="멤버 관리" activeTab="my" bottomNav={false} backHref={backHref}>
      <div className="tm-my-shell tm-my-members-desktop">
        {/* Desktop page head */}
        <div className="tm-desktop-page-head tm-show-desktop">
          <Link className="tm-desktop-back" href={backHref} aria-label="팀 정보로 돌아가기">
            <ChevronLeftIcon size={22} strokeWidth={2.5} />
          </Link>
          <h1 className="tm-text-heading">{model.teamName} · 멤버 관리</h1>
        </div>
        <div className="tm-my-stat-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          {model.summary.map((stat) => <Card key={stat.label} pad={16}><KPIStat {...stat} /></Card>)}
        </div>
        <div className="tm-team-form-chip-row" role="group" aria-label="멤버 목록 탭" style={{ marginTop: 14 }}>
          {model.tabs.map((tab) => (
            <button key={tab.key} className={`tm-chip ${model.activeTab === tab.key ? 'tm-chip-active' : ''}`} type="button" onClick={tab.onSelect} aria-pressed={model.activeTab === tab.key}>
              {tab.label} <span className="tab-num">{tab.count}</span>
            </button>
          ))}
        </div>
        {model.activeTab === 'members' ? <MemberGroup title="멤버" members={model.members} /> : <MemberGroup title="가입 신청" members={model.requests} />}
      </div>
    </AppChrome>
  );
}


export function SettingsPageView({ model }: { model: SettingsViewModel }) {
  return (
    <AppChrome title={model.title} activeTab="my" bottomNav={false} backHref="/my">
      <div className="tm-my-shell">
        <div className="tm-my-settings-desktop">
          {/* Desktop page head */}
          <div className="tm-desktop-page-head tm-show-desktop">
            <Link className="tm-desktop-back" href="/my" aria-label="마이페이지로 돌아가기">
              <ChevronLeftIcon size={22} strokeWidth={2.5} />
            </Link>
            <h1 className="tm-text-heading">{model.title}</h1>
          </div>
          {model.groups.map((section) => <MenuSection key={section.title} section={section} />)}
          {/* 파괴 액션이 최강 CTA가 되지 않도록 ghost 텍스트 링크 수준으로 축소 — 마이홈과 동일 패턴 */}
          <div className="tm-my-logout-row">
            <LogoutButton variant="ghost" />
          </div>
        </div>
      </div>
    </AppChrome>
  );
}


// model prop is intentionally unused — LegalPageView renders static legal content only.
// The prop is kept for backward compatibility with the existing page.tsx caller.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function LegalPageView({ model: _model }: { model: SettingsViewModel }) {
  return (
    <AppChrome title="약관 및 정책" activeTab="my" bottomNav={false} backHref="/my/settings">
      <div className="tm-my-shell">
        <div className="tm-my-settings-desktop">
          <div className="tm-desktop-page-head tm-show-desktop">
            <Link className="tm-desktop-back" href="/my/settings" aria-label="설정으로 돌아가기">
              <ChevronLeftIcon size={22} strokeWidth={2.5} />
            </Link>
            <h1 className="tm-text-heading">약관 및 정책</h1>
          </div>
          <Card pad={16}>
            <ListItem title="이용약관" sub="서비스 이용 전 꼭 확인해야 하는 약관이에요" trailing="2026.05" chev />
            <ListItem title="개인정보 처리방침" sub="개인정보를 어떻게 수집하고 보관하는지 안내해요" trailing="2026.05" chev />
            <ListItem title="위치기반 서비스 약관" sub="장소 추천과 거리 계산에 위치 정보를 사용해요" trailing="선택" chev />
          </Card>
        </div>
      </div>
    </AppChrome>
  );
}


function MenuSection({ section }: { section: { title: string; items: MyMenuItem[] } }) {
  return (
    <section>
      <div className="tm-my-section-label">{section.title}</div>
      <Card pad={0}>
        {section.items.map((item) => {
          const IconComponent = MENU_ICON_MAP[item.icon];
          return (
            <Link key={item.label} className="tm-my-menu-row" href={item.href}>
              {/* Lucide 아이콘: 단일 글자 모노그램 대체. 의미 있는 시각 단서 제공 */}
              <span className="tm-my-menu-icon" aria-hidden="true">
                {IconComponent ? (
                  <IconComponent size={18} strokeWidth={1.75} color="var(--blue500)" />
                ) : item.icon}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="tm-text-body" style={{ color: 'var(--text-strong)', display: 'block' }}>{item.label}</span>
                <span className="tm-text-caption" style={{ marginTop: 2, display: 'block' }}>{item.sub}</span>
              </span>
              <ChevronRightIcon size={17} stroke="var(--text-caption)" strokeWidth={2} />
            </Link>
          );
        })}
      </Card>
    </section>
  );
}

function MyMatchCard({ match, manage }: { match: MyMatch; manage?: boolean }) {
  const canReview = Boolean(match.reviewHref);
  return (
    <Card pad={16}>
      <div className="tm-my-card-head">
        <div>
          <div className="tm-text-body-lg">{match.title}</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>{match.meta}</div>
        </div>
        <span className={`tm-badge ${match.status === 'pending' ? 'tm-badge-orange' : match.status === 'ended' ? 'tm-badge-grey' : 'tm-badge-blue'}`}>{match.statusLabel}</span>
      </div>
      <p className="tm-text-caption" style={{ margin: '10px 0 0', lineHeight: 1.5 }}>{match.note}</p>
      <div className="tm-my-card-actions">
        <Link className="tm-btn tm-btn-sm tm-btn-neutral" href={match.href}>상세</Link>
        {manage ? <Link className="tm-btn tm-btn-sm tm-btn-neutral" href={`${match.href}/applications`}>참가 관리</Link> : canReview ? <Link className="tm-btn tm-btn-sm tm-btn-primary" href={match.reviewHref ?? '/my/reviews'}>리뷰</Link> : <button className="tm-btn tm-btn-sm tm-btn-neutral" type="button" disabled>{match.status === 'ended' ? '리뷰 불가' : '리뷰 대기'}</button>}
      </div>
    </Card>
  );
}

function MyTeamCard({ team }: { team: MyTeam }) {
  const isOwner = team.role === 'owner';
  const isManager = team.role === 'manager' || team.role === 'admin';
  const badgeClass = isOwner || isManager ? 'tm-badge tm-badge-blue' : 'tm-badge tm-badge-grey';
  return (
    <Link className="tm-my-team-card tm-pressable" href={`/my/teams/${team.id}`}>
      <div className="tm-team-logo">{team.logo}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="tm-my-card-head">
          <div className="tm-text-body-lg">{team.name}</div>
          <span className={badgeClass}>
            {isOwner && <Crown size={11} strokeWidth={2} style={{ marginRight: 3 }} aria-hidden="true" />}
            {team.roleLabel}
          </span>
        </div>
        <div className="tm-text-caption" style={{ marginTop: 4 }}>
          {team.sport} · {team.region} ·{' '}
          {/* P1 숫자:단위 2:1 tabular-nums — 멤버 수 */}
          <span className="tab-num" style={{ fontVariantNumeric: 'tabular-nums' }}>{team.members}</span>명
        </div>
        <div className="tm-text-caption" style={{ marginTop: 8 }}>{team.next}</div>
      </div>
      <ChevronRightIcon size={17} stroke="var(--text-caption)" strokeWidth={2} />
    </Link>
  );
}

function MemberGroup({ title, members }: { title: string; members: MyMember[] }) {
  return (
    <section>
      <div className="tm-my-section-label">{title}</div>
      {/* #14: 멤버/요청이 없을 때 빈 상태 안내 */}
      {members.length === 0
        ? <EmptyState title={`${title}이 없어요`} sub="아직 표시할 항목이 없어요." />
        : (
          <div className="tm-my-list-stack">
            {members.map((member) => <MyMemberCard key={member.id} member={member} />)}
          </div>
        )}
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="tm-info-row"><div className="tm-text-caption">{label}</div><div className="tm-text-label" style={{ textAlign: 'right', flex: 1 }}>{value}</div></div>;
}

function CreateField({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return <div className="tm-create-field"><div className="tm-text-label">{label}</div><div className={`tm-create-input ${multiline ? 'tm-create-input-multiline' : ''}`}><span className="tm-text-body" style={{ color: 'var(--text-strong)' }}>{value}</span></div></div>;
}
