import Link from 'next/link';
import { LogoutButton } from '@/components/auth/logout-button';
import { ChevronRightIcon } from '@/components/v1-ui/icons';
import { AppChrome } from '@/components/v1-ui/shell';
import { Card, KPIStat, ListItem } from '@/components/v1-ui/primitives';
import type {
  MyHomeViewModel,
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

export function MyHomePageView({ model }: { model: MyHomeViewModel }) {
  return (
    <AppChrome title="마이" activeTab="my" hasNewNotification={model.hasNewNotification}>
      <div className="tm-my-shell">
        <section className="tm-my-profile-head">
          <div className="tm-my-avatar">{model.user.initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="tm-text-heading">{model.user.name}</div>
            <div className="tm-text-caption" style={{ marginTop: 4 }}>{model.user.handle} · {model.user.region}</div>
            <div className="tm-my-chip-row">{model.user.sports.map((sport) => <span key={sport} className="tm-badge tm-badge-grey">{sport}</span>)}</div>
          </div>
          <Link className="tm-btn tm-btn-sm tm-btn-neutral" href="/my/profile/edit">수정</Link>
        </section>
        <div className="tm-my-profile-stats">{model.user.stats.map((stat) => <KPIStat key={stat.label} {...stat} />)}</div>
        <Card pad={16}>
          <div className="tm-text-body-lg">이번 달 활동</div>
          <div className="tm-my-monthly">{model.user.monthly.map((stat) => <KPIStat key={stat.label} {...stat} />)}</div>
        </Card>
        {model.sections.map((section) => <MenuSection key={section.title} section={section} />)}
      </div>
    </AppChrome>
  );
}

export function MyMatchesPageView({ model }: { model: MyMatchesViewModel }) {
  const joined = model.mode === 'joined';
  return (
    <AppChrome title="내 매치" activeTab="my" bottomNav={false} backHref="/my">
      <div className="tm-my-shell">
        <div className="tm-segment-row">
          <Link className={`tm-btn tm-btn-md ${joined ? 'tm-btn-primary' : 'tm-btn-neutral'}`} href="/my/matches/joined">참여한 매치</Link>
          <Link className={`tm-btn tm-btn-md ${!joined ? 'tm-btn-primary' : 'tm-btn-neutral'}`} href="/my/matches/created">생성한 매치</Link>
        </div>
        <div>
          <div className="tm-text-label">{model.title}</div>
          <div className="tm-text-caption" style={{ marginTop: 3 }}>{joined ? '내가 신청한 승인 대기, 승인 완료, 종료된 매치만 보여줍니다.' : '내가 생성한 매치만 보여주고 참여자 관리와 매치 수정 상태를 분리합니다.'}</div>
        </div>
        {model.apiNotice ? (
          <Card pad={14} className={model.apiNotice.tone === 'warning' ? 'tm-auth-soft-card-warning' : undefined}>
            <div className="tm-text-body-lg">{model.apiNotice.title}</div>
            <div className="tm-text-caption" style={{ marginTop: 4 }}>{model.apiNotice.body}</div>
          </Card>
        ) : null}
        <div className="tm-my-list-stack">
          {model.matches.map((match) => <MyMatchCard key={match.id} match={match} manage={model.mode === 'created'} />)}
        </div>
      </div>
    </AppChrome>
  );
}

export function MyTeamsPageView({ model }: { model: MyTeamsViewModel }) {
  return (
    <AppChrome title="내 팀" activeTab="my" bottomNav={false} backHref="/my">
      <div className="tm-my-shell">
        <div className="tm-my-stat-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          {model.summary.map((stat) => <Card key={stat.label} pad={12}><KPIStat {...stat} /></Card>)}
        </div>
        <div className="tm-my-list-stack">
          {model.teams.map((team) => <MyTeamCard key={team.id} team={team} />)}
        </div>
      </div>
    </AppChrome>
  );
}

export function MyTeamDetailPageView({ model }: { model: MyTeamDetailViewModel }) {
  return (
    <AppChrome title="팀 정보" activeTab="my" bottomNav={false} backHref="/my/teams">
      <div className="tm-my-shell">
        <section className="tm-my-team-hero">
          <div className="tm-team-logo tm-team-logo-large">{model.team.logo}</div>
          <div>
            <h1 className="tm-text-heading">{model.team.name}</h1>
            <div className="tm-text-caption" style={{ marginTop: 4 }}>{model.team.sport} · {model.team.region} · {model.team.roleLabel}</div>
          </div>
          <p className="tm-text-body" style={{ margin: 0, lineHeight: 1.55 }}>{model.team.description}</p>
        </section>
        <Card pad={16}>
          <InfoRow label="멤버" value={`${model.team.members}명`} />
          <InfoRow label="매너" value={model.team.manner} />
          <InfoRow label="다음 일정" value={model.team.next} />
        </Card>
        <MenuSection section={{ title: '운영 메뉴', items: model.actions }} />
        <div className="tm-my-section-label">최근 팀 매치</div>
        <div className="tm-my-list-stack">{model.recentMatches.map((match) => <MyMatchCard key={match.id} match={match} manage />)}</div>
      </div>
      <div className="tm-fixed-cta"><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><Link className="tm-btn tm-btn-lg tm-btn-primary" href={model.chatHref ?? '/chat'}>팀 채팅</Link><Link className="tm-btn tm-btn-lg tm-btn-neutral" href={`/teams/${model.team.id}`}>팀 정보</Link></div></div>
    </AppChrome>
  );
}

export function MyTeamMembersPageView({ model, backHref = '/my/teams/team-1' }: { model: MyTeamMembersViewModel; backHref?: string }) {
  return (
    <AppChrome title="멤버 관리" activeTab="my" bottomNav={false} backHref={backHref}>
      <div className="tm-my-shell">
        <h1 className="tm-text-heading">{model.teamName}</h1>
        <div className="tm-my-stat-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          {model.summary.map((stat) => <Card key={stat.label} pad={12}><KPIStat {...stat} /></Card>)}
        </div>
        <MemberGroup title="멤버" members={model.members} />
        <MemberGroup title="가입 요청" members={model.requests} review />
      </div>
    </AppChrome>
  );
}

export function ProfileEditPageView({ model }: { model: ProfileEditViewModel }) {
  return (
    <AppChrome title="프로필 수정" activeTab="my" bottomNav={false} backHref="/my">
      <div className="tm-create-shell">
        <section className="tm-my-profile-head">
          <div className="tm-my-avatar">{model.user.initials}</div>
          <div>
            <div className="tm-text-body-lg">프로필 사진</div>
            <div className="tm-text-caption" style={{ marginTop: 4 }}>목록과 신청 화면에 함께 표시됩니다.</div>
          </div>
        </section>
        {model.fields.map((field) => <CreateField key={field.label} {...field} />)}
        <Card pad={14} style={{ marginTop: 14, background: 'var(--blue50)' }}><div className="tm-text-label">저장 준비 상태</div><div className="tm-text-caption" style={{ marginTop: 5 }}>프로필 저장 API 연결 전에는 입력값을 화면에만 유지합니다.</div></Card>
      </div>
      <div className="tm-fixed-cta"><button className="tm-btn tm-btn-lg tm-btn-neutral tm-btn-block" type="button" disabled>저장 준비중</button></div>
    </AppChrome>
  );
}

export function SettingsPageView({ model }: { model: SettingsViewModel }) {
  return (
    <AppChrome title={model.title} activeTab="my" bottomNav={false} backHref="/my">
      <div className="tm-my-shell">
        {model.groups.map((section) => <MenuSection key={section.title} section={section} />)}
        <LogoutButton />
      </div>
    </AppChrome>
  );
}

export function NotificationSettingsPageView({ model }: { model: NotificationSettingsViewModel }) {
  return (
    <AppChrome title="알림 설정" activeTab="my" bottomNav={false} backHref="/my/settings">
      <div className="tm-my-shell">
        {model.settings.map((setting) => (
          <Card key={setting.label} pad={16}>
            <div className="tm-my-toggle-row">
              <div>
                <div className="tm-text-body-lg">{setting.label}</div>
                <div className="tm-text-caption" style={{ marginTop: 4 }}>{setting.sub}</div>
              </div>
              <span className={`tm-toggle ${setting.enabled ? 'tm-toggle-on' : ''}`} aria-hidden="true" />
            </div>
          </Card>
        ))}
      </div>
    </AppChrome>
  );
}

export function LegalPageView({ model }: { model: SettingsViewModel }) {
  return (
    <AppChrome title="약관 및 정책" activeTab="my" bottomNav={false} backHref="/my/settings">
      <div className="tm-my-shell">
        <Card pad={16}>
          <ListItem title="이용약관" sub="서비스 이용에 필요한 기본 약관" trailing="2026.05" chev />
          <ListItem title="개인정보 처리방침" sub="개인정보 수집과 보관 기준" trailing="2026.05" chev />
          <ListItem title="위치기반 서비스 약관" sub="장소 추천과 거리 계산 기준" trailing="선택" chev />
        </Card>
        <MenuSection section={model.groups[0]} />
      </div>
    </AppChrome>
  );
}

export function WithdrawalPageView() {
  return (
    <AppChrome title="회원 탈퇴" activeTab="my" bottomNav={false} backHref="/my/settings">
      <div className="tm-my-shell">
        <section className="tm-danger-panel">
          <div className="tm-text-heading">탈퇴 전 확인해 주세요</div>
          <p className="tm-text-body" style={{ margin: '10px 0 0', lineHeight: 1.6 }}>진행 중인 매치, 팀 운영 권한, 정산 내역이 남아 있으면 탈퇴가 제한될 수 있습니다.</p>
        </section>
        <Card pad={16}>
          <ListItem title="참여 예정 매치" sub="2건이 남아 있어요" trailing="정리 필요" />
          <ListItem title="팀장 권한" sub="FC 발빠른놈들" trailing="위임 필요" />
          <ListItem title="보관 데이터" sub="법적 보관 기간 이후 삭제됩니다" trailing="필수" />
        </Card>
      </div>
      <div className="tm-fixed-cta"><button className="tm-btn tm-btn-lg tm-btn-neutral tm-btn-block" type="button" disabled>탈퇴 요청 준비중</button></div>
    </AppChrome>
  );
}

function MenuSection({ section }: { section: { title: string; items: MyMenuItem[] } }) {
  return (
    <section>
      <div className="tm-my-section-label">{section.title}</div>
      <Card pad={0}>
        {section.items.map((item) => (
          <Link key={item.label} className="tm-my-menu-row" href={item.href}>
            <span className="tm-my-menu-icon">{item.icon}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="tm-text-body" style={{ color: 'var(--text-strong)', display: 'block' }}>{item.label}</span>
              <span className="tm-text-caption" style={{ marginTop: 2, display: 'block' }}>{item.sub}</span>
            </span>
            <ChevronRightIcon size={17} stroke="var(--text-caption)" strokeWidth={2} />
          </Link>
        ))}
      </Card>
    </section>
  );
}

function MyMatchCard({ match, manage }: { match: MyMatch; manage?: boolean }) {
  const canReview = match.status === 'ended';
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
        {manage ? <button className="tm-btn tm-btn-sm tm-btn-neutral" type="button" disabled>관리 준비중</button> : <button className={`tm-btn tm-btn-sm ${canReview ? 'tm-btn-primary' : 'tm-btn-neutral'}`} type="button" disabled={!canReview}>{canReview ? '리뷰' : '리뷰 대기'}</button>}
      </div>
    </Card>
  );
}

function MyTeamCard({ team }: { team: MyTeam }) {
  return (
    <Link className="tm-my-team-card tm-pressable" href={`/my/teams/${team.id}`}>
      <div className="tm-team-logo">{team.logo}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="tm-my-card-head">
          <div className="tm-text-body-lg">{team.name}</div>
          <span className="tm-badge tm-badge-blue">{team.roleLabel}</span>
        </div>
        <div className="tm-text-caption" style={{ marginTop: 4 }}>{team.sport} · {team.region} · {team.members}명</div>
        <div className="tm-text-caption" style={{ marginTop: 8 }}>{team.next}</div>
      </div>
      <ChevronRightIcon size={17} stroke="var(--text-caption)" strokeWidth={2} />
    </Link>
  );
}

function MemberGroup({ title, members, review }: { title: string; members: MyMember[]; review?: boolean }) {
  return (
    <section>
      <div className="tm-my-section-label">{title}</div>
      <div className="tm-my-list-stack">
        {members.map((member) => (
          <Card key={member.name} pad={14}>
            <div className="tm-my-card-head">
              <ListItem title={member.name} sub={`${member.role} · ${member.meta}`} trailing={member.status} />
              {review ? (
                <div className="tm-member-actions">
                  <button className="tm-btn tm-btn-sm tm-btn-primary" type="button" disabled={!member.onApprove || member.actionPending} onClick={member.onApprove}>승인</button>
                  <button className="tm-btn tm-btn-sm tm-btn-neutral" type="button" disabled={!member.onReject || member.actionPending} onClick={member.onReject}>거절</button>
                </div>
              ) : (
                <div className="tm-member-actions">
                  <button className="tm-btn tm-btn-sm tm-btn-neutral" type="button" disabled={member.locked || member.actionPending || (!member.onPromote && !member.onDemote)} onClick={member.onPromote ?? member.onDemote}>{member.locked ? '권한 고정' : member.onDemote ? '멤버로 변경' : '운영진 지정'}</button>
                  <button className="tm-btn tm-btn-sm tm-btn-neutral" type="button" disabled={member.locked || !member.onRemove || member.actionPending} onClick={member.onRemove}>내보내기</button>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="tm-info-row"><div className="tm-text-caption">{label}</div><div className="tm-text-label" style={{ textAlign: 'right', flex: 1 }}>{value}</div></div>;
}

function CreateField({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return <div className="tm-create-field"><div className="tm-text-label">{label}</div><div className={`tm-create-input ${multiline ? 'tm-create-input-multiline' : ''}`}><span className="tm-text-body" style={{ color: 'var(--text-strong)' }}>{value}</span></div></div>;
}
