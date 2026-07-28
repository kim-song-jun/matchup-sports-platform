'use client';

import Link from 'next/link';
import { CalendarDays, Megaphone, Trophy, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, ListItem } from '@/components/v1-ui/primitives';
import type { TeamDetailViewModel } from './teams.types';

type TeamDetailTeam = TeamDetailViewModel['team'];
type TeamOpenMatches = NonNullable<TeamDetailViewModel['openMatches']>;

type SectionHeaderProps = {
  readonly title: string;
  readonly sub: string;
};

function SectionHeader({ title, sub }: SectionHeaderProps) {
  return (
    <div className="tm-team-detail-section-head">
      <div className="tm-text-body-lg">{title}</div>
      <div className="tm-text-caption">{sub}</div>
    </div>
  );
}

type SignalTileProps = {
  readonly label: string;
  readonly value: string;
  readonly sub: string;
  readonly icon: LucideIcon;
};

function SignalTile({ label, value, sub, icon: Icon }: SignalTileProps) {
  return (
    <div className="tm-team-signal-tile">
      <span className="tm-team-signal-icon" aria-hidden="true">
        <Icon size={17} strokeWidth={2.2} />
      </span>
      <div className="tm-text-caption">{label}</div>
      <div className="tm-text-label">{value}</div>
      <div className="tm-text-caption tm-team-signal-sub">{sub}</div>
    </div>
  );
}

export function TeamDetailInfoPanel({ team }: { readonly team: TeamDetailTeam }) {
  const sportsText = team.sports.length ? team.sports.join(', ') : team.sport;
  const areaText = [team.city, team.county].filter(Boolean).join(' ') || team.region;
  const conditionText = team.condition || `${team.level} · ${team.genderRule}`;
  const recruitingText = team.activity ? `${team.statusLabel} · ${team.activity}` : team.statusLabel;

  return (
    <section className="tm-team-detail-section">
      <SectionHeader title="팀 기본 정보" sub="가입 전에 팀 성격과 모집 조건을 빠르게 확인해요." />
      <Card pad={0} className="tm-team-detail-info-panel">
        <div className="tm-team-detail-signal-grid">
          <SignalTile label="대표 종목" value={sportsText} sub="팀 매치와 추천 기준" icon={Trophy} />
          <SignalTile label="활동 지역" value={areaText} sub={team.region} icon={CalendarDays} />
          <SignalTile label="실력·조건" value={team.level || '레벨 미정'} sub={team.genderRule} icon={Users} />
          <SignalTile label="모집 상태" value={team.statusLabel} sub={recruitingText} icon={Megaphone} />
        </div>

        <div className="tm-team-detail-intro-panel">
          <div className="tm-text-caption">팀 소개</div>
          <p className="tm-text-body">{team.description || '팀 소개가 아직 등록되지 않았어요.'}</p>
        </div>

        <div className="tm-team-detail-meta-grid" aria-label="팀 조건 요약">
          <MetaItem label="팀명" value={team.name} />
          <MetaItem label="정원" value={`${team.members}/${team.capacity}명`} />
          <MetaItem label="가입 조건" value={conditionText || '조건 미정'} />
          <MetaItem label="활동 방식" value={team.activity || '운영진 공지 확인'} />
          {team.schedule ? <MetaItem label="정기 일정" value={team.schedule} /> : null}
        </div>
      </Card>
    </section>
  );
}

function MetaItem({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="tm-team-meta-item">
      <span className="tm-text-caption">{label}</span>
      <span className="tm-text-body">{value}</span>
    </div>
  );
}

export function TeamDetailActivitySection({
  team,
  matches,
  loading,
}: {
  readonly team: TeamDetailTeam;
  readonly matches?: TeamOpenMatches;
  readonly loading?: boolean;
}) {
  const items = matches ?? [];
  const needsMoreMembers = team.members < 2;
  const tournamentReadiness = needsMoreMembers ? '팀원 보강 필요' : '대회 신청 준비 가능';
  const tournamentGuide = needsMoreMembers
    ? '대회 참가 전 팀원을 더 모아야 해요.'
    : '대회별 선수단 기준은 상세에서 다시 확인해요.';

  return (
    <section className="tm-team-detail-section">
      <SectionHeader title="팀 활동" sub="열린 매치, 모집 안내, 대회 준비 상태를 한 번에 봐요." />
      <Card pad={0} className="tm-team-detail-activity-card">
        <div className="tm-team-detail-activity-head">
          <div>
            <div className="tm-text-label">이 팀의 열린 매치</div>
            <div className="tm-text-caption">지금 모집 중인 팀 경기예요.</div>
          </div>
          <span className="tm-badge tm-badge-blue">{items.length}건</span>
        </div>

        {loading ? (
          <div className="tm-team-open-match-list" aria-busy="true" aria-label="열린 매치 불러오는 중">
            {[0, 1].map((item) => (
              <div key={item} className="tm-review-skeleton tm-team-open-match-skeleton" aria-hidden="true" />
            ))}
          </div>
        ) : items.length ? (
          <div className="tm-team-open-match-list">
            {items.map((match) => (
              <Link key={match.id} className="tm-team-open-match-row tm-pressable" href={`/team-matches/${match.id}`}>
                <div>
                  <div className="tm-text-label">{match.title}</div>
                  <div className="tm-text-caption">{[match.dateLabel, match.venue].filter(Boolean).join(' · ')}</div>
                </div>
                <span className="tm-team-open-match-state">모집 중</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="tm-team-activity-empty">
            <div>
              <div className="tm-text-label">아직 열어둔 매치가 없어요</div>
              <div className="tm-text-caption">이 팀이 새 경기를 모집하면 여기서 바로 확인할 수 있어요.</div>
            </div>
            <Link className="tm-btn tm-btn-sm tm-btn-neutral" href="/team-matches">팀매치 보기</Link>
          </div>
        )}

        <div className="tm-team-detail-promo-grid">
          <div className="tm-team-detail-promo-item">
            <div className="tm-text-caption">모집 안내</div>
            <div className="tm-text-label">{team.statusLabel}</div>
            <div className="tm-text-caption">{team.activity || '팀 소개와 멤버 공개 범위를 확인해 주세요.'}</div>
          </div>
          <div className="tm-team-detail-promo-item">
            <div className="tm-text-caption">대회 준비</div>
            <div className="tm-text-label">{tournamentReadiness}</div>
            <div className="tm-text-caption">{tournamentGuide}</div>
          </div>
        </div>
      </Card>
    </section>
  );
}

type TeamDetailMembersCardProps = {
  readonly team: TeamDetailTeam;
  readonly href: string;
  readonly variant?: 'card' | 'panel';
};

export function TeamDetailMembersCard({ team, href, variant = 'card' }: TeamDetailMembersCardProps) {
  const content = (
    <>
      <div className="tm-section-row tm-team-members-head">
        <div>
          <div className="tm-text-body-lg">주요 멤버</div>
          <div className="tm-text-caption">{team.memberAccess.message}</div>
        </div>
        {team.memberAccess.canView ? (
          <Link className="tm-btn tm-btn-sm tm-btn-neutral" href={href}>멤버</Link>
        ) : (
          <span className="tm-badge tm-badge-grey">비공개</span>
        )}
      </div>
      {team.memberAccess.canView ? (
        <div className="tm-team-member-list">
          {team.membersList.map((member) => (
            <ListItem key={`${member.name}-${member.role}`} title={member.name} sub={`${member.role} · ${member.meta} · ${member.status}`} trailing={member.visibility} />
          ))}
        </div>
      ) : (
        <div className="tm-text-caption tm-team-members-private">팀 멤버이고 멤버 목록이 공개된 경우에만 볼 수 있어요.</div>
      )}
    </>
  );

  if (variant === 'panel') {
    return <div className="tm-team-member-panel">{content}</div>;
  }

  return (
    <Card pad={16} className="tm-team-detail-member-card">
      {content}
    </Card>
  );
}

type TeamDetailSidebarProps = {
  readonly team: TeamDetailTeam;
  readonly statusBadgeClass: string;
  readonly locked: boolean;
  readonly heroMessage: string;
  readonly memberHref: string;
  readonly cta: {
    readonly label: string;
    readonly className: string;
    readonly disabled: boolean;
    readonly onClick: () => void;
  };
};

export function TeamDetailSidebar({ team, statusBadgeClass, locked, heroMessage, memberHref, cta }: TeamDetailSidebarProps) {
  const remainingSlots = Math.max(team.capacity - team.members, 0);
  const memberLabel = remainingSlots > 0 ? `${remainingSlots}명 모집 여지` : '정원에 가까워요';

  return (
    <aside className="tm-team-detail-desktop-sidebar" aria-label="팀 운영 요약">
      <div className="tm-team-side-top">
        <div className="tm-text-caption">팀 운영 요약</div>
        <div className="tm-team-side-title">{team.name}</div>
        <div className="tm-team-detail-sidebar-meta">
          <span className={`tm-badge ${statusBadgeClass}`}>{team.statusLabel}</span>
          <span className="tm-badge tm-badge-grey">{team.sport}</span>
          <span className="tm-badge tm-badge-grey">{team.county || team.region}</span>
        </div>
      </div>

      <div className="tm-team-side-metrics" aria-label="팀 숫자 요약">
        <div className="tm-team-side-metric">
          <strong>{team.members}</strong>
          <span>현재 멤버</span>
        </div>
        <div className="tm-team-side-metric">
          <strong>{team.capacity}</strong>
          <span>목표 정원</span>
        </div>
        <div className="tm-team-side-metric">
          <strong>{team.membersList.length}</strong>
          <span>멤버 미리보기</span>
        </div>
      </div>

      <div className="tm-team-side-readiness">
        <div className="tm-text-label">{memberLabel}</div>
        <div className="tm-text-caption">{team.activity || '팀 소개와 모집 상태를 확인해 주세요.'}</div>
      </div>

      <TeamDetailMembersCard team={team} href={memberHref} variant="panel" />

      <div className="tm-team-detail-sidebar-divider" />
      <div className="tm-text-caption tm-team-side-cta-copy">
        {locked ? '신청 상태를 확인하고 다음 행동을 선택해 주세요.' : '신청 전에 팀 정보와 내 프로필 공개 범위를 확인해 주세요.'}
      </div>
      {heroMessage ? <div className="tm-text-caption tm-complete-check tm-team-side-message" role="status">{heroMessage}</div> : null}
      <div className="tm-team-detail-sidebar-cta">
        <button className={`tm-btn tm-btn-lg ${cta.className} tm-btn-block`} type="button" disabled={cta.disabled} onClick={cta.onClick}>
          {cta.label}
        </button>
      </div>
    </aside>
  );
}
