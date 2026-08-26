import Link from 'next/link';
import {
  Award,
  Bell,
  ClipboardList,
  Crown,
  Dumbbell,
  FileText,
  LucideProps,
  LogOut,
  Mail,
  MapPin,
  Moon,
  Plus,
  Send,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Star,
  UserCheck,
  Users,
  ListOrdered,
} from 'lucide-react';
import { LogoutButton } from '@/components/auth/logout-button';
import { buildPhoneVerifyHref } from '@/components/auth/phone-verification/phone-verify-route';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/v1-ui/icons';
import { AppChrome } from '@/components/v1-ui/shell';
import { Card, EmptyState, KPIStat, ListItem } from '@/components/v1-ui/primitives';
import { MyPlayerCardSection } from './my-player-card-section';
import { TeamAvatar } from '@/components/v1-ui/team-avatar';
import { cssUrl } from '@/lib/assets';
import { PendingReviewsCard } from '@/components/tournaments/pending-review-card';
import { MyMemberCard } from './my-member-card';
import type {
  MyHomeViewModel,
  MyInvitationsViewModel,
  MyJoinApplicationItem,
  MyJoinApplicationsViewModel,
  MyMatch,
  MyMatchesViewModel,
  MyMember,
  MyMenuItem,
  MyTeam,
  MyTeamMembersViewModel,
  MyTeamsViewModel,
  NotificationSettingsViewModel,
  ProfileEditViewModel,
  SettingsViewModel,
} from './my.types';

/** Lucide 아이콘 이름 → 컴포넌트 매핑. view-model의 icon 문자열을 참조함. */
const MENU_ICON_MAP: Record<string, React.ComponentType<LucideProps>> = {
  Award,
  ListOrdered,
  ClipboardList,
  Plus,
  Users,
  Star,
  Dumbbell,
  Settings,
  MapPin,
  Bell,
  Moon,
  FileText,
  LogOut,
  Mail,
  Send,
  ShieldCheck,
  UserCheck,
};

export function MyHomePageView({ model }: { model: MyHomeViewModel }) {
  const avatarStyle = model.user.profileImageUrl ? { backgroundImage: cssUrl(model.user.profileImageUrl) } : undefined;

  return (
    <AppChrome title="마이페이지" activeTab="my" hasNewNotification={model.hasNewNotification} centerTitle>
      <h1 className="sr-only">마이페이지</h1>
      <div className="tm-my-shell">
        {/* Mobile layout: flat stack (unchanged) */}
        {/* Desktop layout: 2-column via tm-my-desktop-layout */}
        <div className="tm-my-desktop-layout">
          {/* LEFT sticky: profile identity */}
          <div className="tm-my-desktop-sidebar">
            {/* 내 선수 카드 (Task 155, 사용자 선택 A안 -- 카드 독립, 2026-08-26).
                카드를 상자에서 꺼내 페이지 위에 직접 놓는다. 이전에는 카드가 무대 상자
                안에 있고 그 안에 계정 버튼(내 프로필·프로필 수정)까지 함께 있어,
                모바일에서 상자 속 상자 + 카드 조작과 계정 조작이 한 덩어리로 섞였다.
                카드 아래에는 **카드 조작만** 남고(뒤집기·공유·설정), 계정은 아래 프로필
                카드로 내려간다. 카드가 없으면(숨김·로딩·실패) 기존 신원 박스가 그 자리에 선다. */}
            {model.user.userId !== null ? (
              <MyPlayerCardSection
                userId={model.user.userId}
                displayName={model.user.name}
                profileImageUrl={model.user.profileImageUrl ?? null}
              />
            ) : null}
            {/* 프로필(계정) -- 카드와 **다른 블록**이다. 카드 유무와 무관하게 항상 선다:
                카드를 숨긴 사용자에게는 이것이 유일한 신원 표시이고, 카드가 있는
                사용자에게는 계정 조작이 카드 조작과 섞이지 않는 자리다. */}
            {model.user.userId !== null ? (
              <Card pad={16}>
                <div className="tm-text-body-lg">프로필</div>
                <div className="tm-my-account-block">
                  <div className="tm-my-avatar tm-my-account-avatar" style={avatarStyle}>
                    {model.user.profileImageUrl ? null : model.user.initials}
                  </div>
                  <div className="tm-my-account-name">{model.user.name}</div>
                  <div className="tm-my-account-meta">
                    {model.user.handle} · {model.user.region} · {model.user.genderLabel}
                  </div>
                  {model.user.loginMethod || model.phoneVerified ? (
                    <div className="tm-my-account-badges">
                      {model.user.loginMethod ? (
                        <span
                          className="tm-badge tm-badge-grey"
                          style={model.user.loginMethodProvider === 'kakao'
                            ? { background: 'var(--kakao-yellow)', color: 'var(--static-black)' }
                            : undefined}
                        >
                          {model.user.loginMethod}
                        </span>
                      ) : null}
                      {model.phoneVerified ? (
                        <span className="tm-badge tm-badge-grey" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <ShieldCheck size={12} strokeWidth={2.5} aria-hidden="true" />
                          본인인증 완료
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="tm-my-account-actions">
                    <Link
                      className="tm-btn tm-btn-sm tm-btn-neutral"
                      href={`/users/${encodeURIComponent(model.user.userId)}`}
                    >
                      내 프로필
                    </Link>
                    <Link className="tm-btn tm-btn-sm tm-btn-neutral" href="/my/profile/edit">프로필 수정</Link>
                  </div>
                </div>
              </Card>
            ) : null}
            {model.phoneVerified === false ? <PhoneVerificationCallout /> : null}
            {/* 활동 -- 전체 활동과 이번 달을 한 카드로 합친다(사용자 확정 2026-08-26).
                성격이 같은 숫자 묶음이 상자 두 개로 나뉘어 모바일 스크롤만 길었다. */}
            <Card pad={16}>
              <div className="tm-text-body-lg">활동</div>
              <div className="tm-my-profile-stats">{model.user.stats.map((stat) => <KPIStat key={stat.label} {...stat} />)}</div>
              <div className="tm-my-activity-divider" />
              <div className="tm-my-monthly">{model.user.monthly.map((stat) => <KPIStat key={stat.label} {...stat} />)}</div>
            </Card>
          </div>
          {/* RIGHT: menu sections */}
          <div className="tm-my-desktop-main">
            {/* 남은 후기(경기 후기 + 대회 후기)를 한 카드로 모아 안내한다. 남은 게 없으면 null.
                (기존 주석은 스태프 배정 얘기였는데 이 컴포넌트와 무관한 잔재라 함께 정리했다.) */}
            <PendingReviewsCard />
            <div className="tm-my-desktop-menu-grid">
              {model.sections.map((section) => <MenuSection key={section.title} section={section} />)}
            </div>
            {/* 로그아웃: 파괴 액션이 최강 CTA가 되지 않도록 ghost 텍스트 링크 수준으로 축소.
                메뉴 그리드 바로 아래 맨몸으로 떠 있으면 "깜빡 잊고 남은 링크"처럼 보여서
                Card로 감싸 우측 정렬한다(계정 설정 페이지에도 동일하게 있어 발견성 유지). */}
            <div className="tm-my-logout-row">
              <Card pad={16} className="tm-my-logout-card">
                <LogoutButton variant="ghost" />
              </Card>
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
                  <TeamAvatar seed={invitation.teamId} name={invitation.teamName} logoUrl={invitation.logoUrl} size="lg" />
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
                    disabled={invitation.actionPending}
                    onClick={() => model.onAccept(invitation.invitationId)}
                    aria-label={`${invitation.teamName} 초대 수락`}
                  >
                    수락
                  </button>
                  <button
                    className="tm-btn tm-btn-sm tm-btn-ghost"
                    type="button"
                    disabled={invitation.actionPending}
                    onClick={() => model.onDecline(invitation.invitationId)}
                    aria-label={`${invitation.teamName} 초대 거절`}
                  >
                    거절
                  </button>
                </div>
                {invitation.actionPending ? (
                  <div className="tm-text-caption" role="status" aria-live="polite" style={{ marginTop: 8 }}>
                    처리 중…
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppChrome>
  );
}

/** 상태 뱃지 톤 → 뱃지 클래스. 색만으로 구분하지 않도록 라벨 텍스트를 항상 함께 렌더한다. */
const JOIN_APPLICATION_BADGE_CLASS: Record<MyJoinApplicationItem['statusTone'], string> = {
  pending: 'tm-badge-orange',
  approved: 'tm-badge-green',
  rejected: 'tm-badge-red',
  neutral: 'tm-badge-grey',
};

export function MyJoinApplicationsPageView({ model }: { model: MyJoinApplicationsViewModel }) {
  return (
    <AppChrome title="보낸 가입 신청" activeTab="my" bottomNav={false} backHref="/my">
      <div className="tm-my-shell">
        {/* Desktop page head */}
        <div className="tm-desktop-page-head tm-show-desktop">
          <Link className="tm-desktop-back" href="/my" aria-label="마이페이지로 돌아가기">
            <ChevronLeftIcon size={22} strokeWidth={2.5} />
          </Link>
          <h1 className="tm-text-heading">보낸 가입 신청</h1>
        </div>
        {model.error ? (
          <EmptyState
            title="가입 신청 목록을 불러오지 못했어요"
            sub="잠시 후 다시 시도해 주세요."
            cta="다시 시도"
            onCta={model.onRetry}
          />
        ) : model.loading ? (
          <PageSkeleton />
        ) : model.applications.length === 0 ? (
          <EmptyState title="보낸 가입 신청이 없어요" sub="팀에 가입 신청하면 진행 상태를 여기에서 확인할 수 있어요." />
        ) : (
          <div className="tm-my-list-stack">
            {model.applications.map((application) => (
              <div key={application.applicationId} className="tm-invitation-card tm-join-application-card">
                <div className="tm-invitation-card-head">
                  <TeamAvatar seed={application.teamId} name={application.teamName} logoUrl={application.logoUrl} size="lg" />
                  <div className="tm-invitation-meta">
                    <Link className="tm-invitation-meta-name tm-join-application-team-link" href={`/teams/${application.teamId}`}>
                      {application.teamName}
                    </Link>
                    <div className="tm-invitation-meta-date">{application.dateLabel} 신청</div>
                  </div>
                  <span className={`tm-badge ${JOIN_APPLICATION_BADGE_CLASS[application.statusTone]}`}>
                    {application.statusLabel}
                  </span>
                </div>
                <p className="tm-join-application-hint">{application.statusHint}</p>
                {application.message ? (
                  <div className="tm-invitation-message">{application.message}</div>
                ) : null}
                {application.status === 'requested' ? (
                  <div className="tm-invitation-actions">
                    <button
                      className="tm-btn tm-btn-sm tm-btn-ghost"
                      type="button"
                      disabled={application.actionPending}
                      onClick={() => model.onWithdraw(application.applicationId)}
                      aria-label={`${application.teamName} 가입 신청 취소`}
                    >
                      신청 취소
                    </button>
                  </div>
                ) : null}
                {application.actionPending ? (
                  <div className="tm-text-caption" role="status" aria-live="polite">
                    처리 중…
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
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
        <div className="tm-team-form-chip-row" role="group" aria-label="멤버 목록 탭" style={{ marginTop: 16 }}>
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
          {model.account ? (
            <section>
              <div className="tm-my-section-label">계정 정보</div>
              <Card pad={16}>
                <InfoRow label="로그인 방식" value={model.account.loginMethod} />
                <InfoRow label="이메일" value={model.account.email} />
                <PhoneInfoRow value={model.account.phone} verified={model.account.phoneVerified} />
                {model.account.canRequestPasswordChange ? (
                  <InfoRow
                    label="비밀번호"
                    value="비밀번호 변경"
                    action={() => window.alert('비밀번호 변경은 문의로 요청해 주세요.')}
                  />
                ) : (
                  <InfoRow label="비밀번호" value={model.account.password} />
                )}
              </Card>
            </section>
          ) : null}
          {model.groups.map((section) => <MenuSection key={section.title} section={section} />)}
          {/* 파괴 액션이 최강 CTA가 되지 않도록 ghost 텍스트 링크 수준으로 축소 — 마이홈과 동일 패턴 */}
          <div className="tm-my-logout-row">
            <Card pad={16} className="tm-my-logout-card">
              <LogoutButton variant="ghost" />
            </Card>
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
            <ListItem title="이용약관" sub="서비스 이용 전 꼭 확인해야 하는 약관이에요" trailing="2026.05" href="/terms?document=terms" chev />
            <ListItem title="개인정보 처리방침" sub="개인정보를 어떻게 수집하고 보관하는지 안내해요" trailing="2026.05" href="/terms?document=privacy" chev />
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
              {/* Lucide 아이콘: 단일 글자 모노그램 대체. 의미 있는 시각 단서 제공.
                  2026-08-11: 배경(.tm-my-menu-icon = --grey150, 무채색)은 이미 통일돼
                  있었는데 아이콘 색만 --blue500라 타일마다 "파랑+회색이 섞인" 것처럼
                  보였다(사용자 라이브 지적) — 진짜 경고가 아닌 순수 내비게이션 메뉴라
                  아이콘도 배경과 같은 무채색 계열로 통일한다. */}
              <span className="tm-my-menu-icon" aria-hidden="true">
                {IconComponent ? (
                  <IconComponent size={18} strokeWidth={1.75} color="var(--text-strong)" />
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
    <Link className="tm-my-team-card tm-pressable" href={`/teams/${team.id}`}>
      <TeamAvatar seed={team.id} name={team.name} logoUrl={team.logoUrl} size="lg" />
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

/**
 * 마이페이지의 본인인증 진입점.
 * 홈 배너 말고도 여기서 항상 인증을 시작할 수 있어야 한다 — 인증 전에는 신청·등록이 전부
 * 막히는데, 진입점이 홈에만 있으면 사용자는 막힌 화면에서 되돌아갈 곳을 찾지 못한다.
 */
function PhoneVerificationCallout() {
  return (
    <Card pad={14} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span
        aria-hidden="true"
        style={{
          flexShrink: 0,
          width: 36,
          height: 36,
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--orange-soft)',
          color: 'var(--orange700)',
        }}
      >
        <ShieldAlert size={18} strokeWidth={2} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="tm-text-label">휴대폰 본인인증이 필요해요</div>
        <div className="tm-text-caption" style={{ marginTop: 2 }}>인증해야 대회 신청·팀 활동을 할 수 있어요.</div>
      </div>
      <Link
        className="tm-btn tm-btn-sm tm-btn-primary"
        style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
        href={buildPhoneVerifyHref('/my')}
      >
        인증하기
      </Link>
    </Card>
  );
}

/**
 * 계정 설정의 휴대폰 행. 번호만 보여주면 미인증 계정도 정상으로 보이는데, 실제로는 그 상태에서
 * 신청·등록이 전부 막힌다. 상태와 인증 진입점을 같은 자리에 둔다.
 */
function PhoneInfoRow({ value, verified }: { value: string; verified?: boolean }) {
  return (
    <div className="tm-info-row">
      <div className="tm-text-caption">휴대폰</div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
        <span className="tm-text-label" style={{ textAlign: 'right' }}>{value}</span>
        {verified === true ? (
          <span className="tm-badge tm-badge-grey" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <ShieldCheck size={12} strokeWidth={2.5} aria-hidden="true" />
            인증 완료
          </span>
        ) : null}
        {verified === false ? (
          <Link className="tm-btn tm-btn-sm tm-btn-primary" href={buildPhoneVerifyHref('/my/settings')}>
            인증하기
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function InfoRow({ label, value, action }: { label: string; value: string; action?: () => void }) {
  return (
    <div className="tm-info-row">
      <div className="tm-text-caption">{label}</div>
      {action ? (
        <button className="tm-btn tm-btn-sm tm-btn-neutral" type="button" onClick={action}>
          {value}
        </button>
      ) : (
        <div className="tm-text-label" style={{ textAlign: 'right', flex: 1 }}>{value}</div>
      )}
    </div>
  );
}

function CreateField({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return <div className="tm-create-field"><div className="tm-text-label">{label}</div><div className={`tm-create-input ${multiline ? 'tm-create-input-multiline' : ''}`}><span className="tm-text-body" style={{ color: 'var(--text-strong)' }}>{value}</span></div></div>;
}
