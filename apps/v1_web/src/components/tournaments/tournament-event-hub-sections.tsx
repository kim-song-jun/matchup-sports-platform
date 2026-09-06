'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/v1-ui/primitives';
import { TeamAvatar } from '@/components/v1-ui/team-avatar';
import type { V1TournamentParticipantTeam, V1TournamentStatus } from '@/types/api';

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

export function TournamentApplicationGuideSection() {
  const steps = [
    {
      title: '팀 준비',
      body: '팀밋 회원가입 후 팀을 만들거나 기존 팀에 합류해요. 대회 신청은 팀장과 운영진이 진행할 수 있어요.',
    },
    {
      title: '팀 선택',
      body: '참가 신청에서 신청할 팀을 고르고, 팀원을 선택해요. 팀원은 미선택 상태로 진행하거나 추후 수정할 수 있어요.',
    },
    {
      title: '2시간 내 입금 확인',
      body: '계좌 안내 후 2시간 안에 입금이 확인되지 않으면 신청이 취소될 수 있어요. 입금 확인 후 대회 참가가 확정돼요.',
    },
    {
      title: '선수단 확정',
      body: '대회 페이지 내에서 선수단을 등록하고 수정해요. 마감일 전까지 등록을 완료해 주세요.',
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
          팀장 또는 운영진이 팀을 선택해 신청하고, 입금 확인 후 참가가 확정돼요. 선수단은 마감일 전까지 등록·수정할 수 있어요.
        </div>
        <ol style={{ display: 'grid', gap: 12, listStyle: 'none', margin: '16px 0 0', padding: 0 }}>
          {steps.map((step, index) => (
            <li key={step.title} style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: 12 }}>
              <span
                aria-hidden="true"
                className="tab-num tm-guide-step-num"
                // 2026-08-11: "대회는 이렇게 진행돼요" 스텝 가이드(tournaments/page.tsx)와
                // 동일한 순수 안내용 번호 배지 — 무채색으로 통일
                // 2026-08-12: [인라인 style 우선순위 fix] 배경을 인라인으로 두면 다크모드
                // 전용 클래스 오버라이드(.tm-guide-step-num, globals.css)가 절대 못 이겨서
                // 배지가 여전히 카드에 녹아 사라졌다 — 배경은 CSS 클래스로만 관리.
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 'var(--radius-field)',
                  color: 'var(--text-strong)',
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
  status,
  confirmedCount,
}: {
  teams: V1TournamentParticipantTeam[];
  /**
   * **정원.** 리그면 `null` 을 넘긴다 — 리그에는 정원 개념이 없다(`V1League` 에 정원 계열
   * 필드가 아예 없다). 거울 행은 `v1_tournaments` 에 살고 `team_count` 가 `@default(8)`
   * 이라, 그대로 그리면 참가 2팀인 리그에 **"2/8팀 확정"** 이 뜬다.
   *
   * `0` 으로 메우지 않는 이유는 목록 카드와 같다 — `0` 은 "정원이 0" 으로 읽힌다.
   */
  teamCount: number | null;
  /** 'open'(모집 중)에는 참가팀 명단(팀명·로고)을 숨긴다 — 확정 인원수는 계속 노출. */
  status: V1TournamentStatus;
  confirmedCount: number;
}) {
  const { confirmed, waitlisted, hasAny } = getParticipantTeamBuckets(teams);
  const isRecruiting = status === 'open';
  // 모집 중에는 백엔드가 participantTeams를 빈 배열로 내려주므로 confirmed.length는 항상 0이다.
  // 헤더 숫자는 대회 status와 무관하게 정확해야 하므로, 모집 중일 때만 confirmedCount로 대체한다.
  const confirmedDisplayCount = isRecruiting ? confirmedCount : confirmed.length;
  const showList = !isRecruiting && hasAny;

  return (
    <section aria-labelledby="participant-teams-heading" style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <div id="participant-teams-heading" className="tm-text-body-lg">
          참가팀
        </div>
        <div className="tm-text-caption" style={{ color: 'var(--text-caption)', whiteSpace: 'nowrap' }}>
          {/* 정원이 없으면 비율이 성립하지 않는다 — 수를 그대로 적는다(목록 카드와 같은 문구). */}
          {teamCount === null ? `${confirmedDisplayCount}팀 참가` : `${confirmedDisplayCount}/${teamCount}팀 확정`}
        </div>
      </div>

      {showList ? (
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
            {isRecruiting
              ? '모집 마감 후 참가팀 명단이 공개돼요.'
              : '입금 확인과 운영진 검토가 끝난 팀부터 이곳에 공개돼요.'}
          </div>
          {isRecruiting && confirmedCount > 0 ? (
            <div className="tm-text-caption" style={{ color: 'var(--text-strong)', fontWeight: 600, marginTop: 8 }}>
              현재 {confirmedCount}팀이 참가를 확정했어요
            </div>
          ) : null}
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
        <ParticipantTeamRow key={team.registrationId} team={team} label={label} badgeClass={badgeClass} />
      ))}
    </div>
  );
}

/**
 * 참가팀 한 줄 + **공개 명단 펼치기**(사용자 A안, 2026-09-06).
 *
 * 정본 §3 이 "명단 공개는 등번호·이름(닉네임)" 으로 확정했고, 그걸 묻는 사람이 가는 자리가
 * 여기(참가팀)다. 새 페이지를 만들지 않고 이 카드 안에서 펼친다.
 *
 * **토글은 링크 안에 넣지 않는다.** 팀 이름 줄은 이미 팀 상세로 가는 `<Link>` 라, 그 안에
 * 버튼을 두면 인터랙티브 요소가 중첩돼 키보드·스크린리더에서 무엇이 눌리는지 갈린다.
 * 링크 **옆**에 별도 버튼을 둔다.
 */
function ParticipantTeamRow({
  team,
  label,
  badgeClass,
}: {
  team: V1TournamentParticipantTeam;
  label: string;
  badgeClass: string;
}) {
  const [open, setOpen] = useState(false);
  const rosterId = `roster-${team.registrationId}`;

  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 8 }}>
        <Link
          href={`/teams/${team.teamId}`}
          className="tm-list-row-interactive tm-pressable"
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr auto',
            alignItems: 'center',
            gap: 12,
            minHeight: 44,
            borderRadius: 'var(--radius-control)',
            textDecoration: 'none',
          }}
        >
          <TeamAvatar seed={team.teamId} name={team.teamName} logoUrl={team.teamLogoUrl} size="sm" />
          <div style={{ minWidth: 0 }}>
            <div
              className="tm-text-label"
              style={{ color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {team.teamName}
            </div>
            {team.teamRegionName ? (
              <div
                className="tm-text-caption"
                style={{ color: 'var(--text-caption)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {team.teamRegionName}
              </div>
            ) : null}
          </div>
          <span className={`tm-badge ${badgeClass}`} style={{ whiteSpace: 'nowrap' }}>
            {label}
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-controls={rosterId}
          className="tm-text-caption tm-pressable"
          style={{
            minHeight: 44, minWidth: 44, padding: '0 10px',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-control)',
            background: 'var(--card-surface)', color: 'var(--text-muted)', whiteSpace: 'nowrap',
          }}
        >
          {open ? '명단 접기' : '명단'}
        </button>
      </div>
      {open ? (
        <div
          id={rosterId}
          style={{
            padding: '8px 12px',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-control)',
            background: 'var(--grey50)',
          }}
        >
          {team.players.length === 0 ? (
            <div className="tm-text-caption" style={{ color: 'var(--text-caption)' }}>
              아직 명단을 등록하지 않았어요.
            </div>
          ) : (
            <ul style={{ display: 'grid', gap: 4, margin: 0, padding: 0, listStyle: 'none' }}>
              {team.players.map((player) => (
                <li
                  key={player.id}
                  style={{ display: 'grid', gridTemplateColumns: '32px 1fr', alignItems: 'baseline', gap: 8 }}
                >
                  {/* 등번호가 없는 선수는 `—` — 0 으로 채우면 아무도 안 단 번호가 전원 0번이 된다. */}
                  <span className="tm-text-caption tab-num" style={{ color: 'var(--text-caption)' }}>
                    {player.jerseyNumber ?? '—'}
                  </span>
                  {/* 닉네임을 못 찾으면(탈퇴·프로필 삭제) 자리표시자다. **실명으로 떨어뜨리지
                      않는다** — 정본 §3 은 공개 명단을 등번호·닉네임으로 못 박았다. */}
                  <span className="tm-text-caption" style={{ color: 'var(--text-strong)' }}>
                    {player.nickname ?? '(탈퇴한 선수)'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

