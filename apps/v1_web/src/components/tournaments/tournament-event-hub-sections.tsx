import { Card } from '@/components/v1-ui/primitives';
import type { V1TournamentParticipantTeam } from '@/types/api';

type ParticipantTeamBuckets = {
  confirmed: V1TournamentParticipantTeam[];
  waitlisted: V1TournamentParticipantTeam[];
  hasAny: boolean;
};

export function getParticipantTeamBuckets(
  teams: V1TournamentParticipantTeam[],
): ParticipantTeamBuckets {
  const confirmed = teams.filter((team) => team.status === 'confirmed');
  const waitlisted = teams.filter((team) => team.status === 'waitlisted');

  return {
    confirmed,
    waitlisted,
    hasAny: teams.length > 0,
  };
}

export function TournamentApplicationGuideSection({
  minPlayers,
  maxPlayers,
}: {
  minPlayers: number;
  maxPlayers: number;
}) {
  const steps = [
    {
      title: '팀 준비',
      body: 'TeamMeet 회원가입 후 팀을 만들거나 기존 팀에 합류해요. 팀장과 운영진이 대회 신청을 진행할 수 있어요.',
    },
    {
      title: '팀 선택',
      body: `참가 신청에서 신청할 팀을 고르고, 팀당 ${minPlayers}~${maxPlayers}명 선수단을 확정해요.`,
    },
    {
      title: '운영진 검토',
      body: '신청 정보와 명단을 운영진이 확인한 뒤 입금 계좌와 다음 단계를 안내해요.',
    },
    {
      title: '2시간 내 입금 확인',
      body: '계좌 안내 후 2시간 안에 입금 확인이 필요해요. 확인되지 않으면 신청이 취소될 수 있어요.',
    },
    {
      title: '대회 후 기록',
      body: '확정 팀은 일정표와 대진표를 확인하고, 종료 후 결과·영상·리뷰와 다음 대회를 이어서 볼 수 있어요.',
    },
  ];

  return (
    <section aria-labelledby="application-guide-heading" style={{ marginTop: 24 }}>
      <div id="application-guide-heading" className="tm-text-body-lg" style={{ marginBottom: 8 }}>
        참가 신청 안내
      </div>
      <Card pad={16} style={{ marginTop: 4 }}>
        <div className="tm-text-label" style={{ color: 'var(--text-strong)' }}>
          이 대회는 팀 단위로 신청해요
        </div>
        <div className="tm-text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.6, marginTop: 4 }}>
          팀장 또는 운영진이 팀을 선택해 신청하고, 선수단 명단과 입금 확인까지 완료되면 참가팀으로 공개돼요.
        </div>
        <ol style={{ display: 'grid', gap: 10, listStyle: 'none', margin: '14px 0 0', padding: 0 }}>
          {steps.map((step, index) => (
            <li key={step.title} style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: 10 }}>
              <span
                aria-hidden="true"
                className="tab-num"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  background: 'var(--blue50)',
                  color: 'var(--blue500)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 'var(--font-size-caption)',
                  fontWeight: 700,
                }}
              >
                {index + 1}
              </span>
              <span>
                <span className="tm-text-label" style={{ color: 'var(--text-strong)' }}>
                  {step.title}
                </span>
                <span className="tm-text-caption" style={{ display: 'block', color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 2 }}>
                  {step.body}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </Card>
    </section>
  );
}

export function TournamentParticipantSection({
  teams,
  teamCount,
}: {
  teams: V1TournamentParticipantTeam[];
  teamCount: number;
}) {
  const { confirmed, waitlisted, hasAny } = getParticipantTeamBuckets(teams);

  return (
    <section aria-labelledby="participant-teams-heading" style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <div id="participant-teams-heading" className="tm-text-body-lg">
          참가팀
        </div>
        <div className="tm-text-caption" style={{ color: 'var(--text-caption)', whiteSpace: 'nowrap' }}>
          {confirmed.length}/{teamCount}팀 확정
        </div>
      </div>

      {hasAny ? (
        <Card pad={16} style={{ marginTop: 4 }}>
          <ParticipantTeamList teams={confirmed} label="참가 확정" badgeClass="tm-badge-blue" />
          {waitlisted.length > 0 ? (
            <div style={{ marginTop: confirmed.length > 0 ? 14 : 0, paddingTop: confirmed.length > 0 ? 14 : 0, borderTop: confirmed.length > 0 ? '1px solid var(--border)' : undefined }}>
              <ParticipantTeamList teams={waitlisted} label="대기" badgeClass="tm-badge-grey" />
            </div>
          ) : null}
        </Card>
      ) : (
        <Card pad={16} style={{ background: 'var(--grey50)', marginTop: 4 }}>
          <div className="tm-text-label" style={{ color: 'var(--text-muted)' }}>
            참가팀 공개 전
          </div>
          <div className="tm-text-caption" style={{ color: 'var(--text-caption)', lineHeight: 1.6, marginTop: 4 }}>
            입금 확인과 운영진 검토가 끝난 팀부터 이곳에 공개돼요.
          </div>
        </Card>
      )}
    </section>
  );
}

function ParticipantTeamList({
  teams,
  label,
  badgeClass,
}: {
  teams: V1TournamentParticipantTeam[];
  label: string;
  badgeClass: string;
}) {
  if (teams.length === 0) {
    return null;
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {teams.map((team) => (
        <div
          key={team.registrationId}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            alignItems: 'center',
            gap: 12,
            minHeight: 44,
          }}
        >
          <div className="tm-text-label" style={{ color: 'var(--text-strong)', minWidth: 0 }}>
            {team.teamName}
          </div>
          <span className={`tm-badge ${badgeClass}`} style={{ whiteSpace: 'nowrap' }}>
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
