import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { V1TournamentParticipantTeam } from '@/types/api';
import { TournamentParticipantSection } from './tournament-event-hub-sections';

/**
 * **공개 명단 펼치기 (사용자 A안, 2026-09-06 확정).**
 *
 * 정본 §3 이 "명단 공개는 등번호·이름(닉네임)" 으로 확정했다. 이 화면은 서버가 이미
 * 공개용으로 걸러 준 값만 그린다 — 실명은 응답에 아예 없다(BE 스펙이 그걸 지킨다).
 * 여기서 보는 것은 **화면이 그 값을 제대로 말하는가** 다.
 */
function team(overrides: Partial<V1TournamentParticipantTeam> = {}): V1TournamentParticipantTeam {
  return {
    registrationId: 'reg-1',
    teamId: 'team-1',
    teamName: 'A팀',
    teamLogoUrl: null,
    teamRegionName: null,
    status: 'confirmed',
    confirmedAt: '2026-06-02T00:00:00.000Z',
    players: [
      { id: 'p1', jerseyNumber: 7, nickname: '길동이' },
      { id: 'p2', jerseyNumber: null, nickname: '철수' },
      { id: 'p3', jerseyNumber: 10, nickname: null },
    ],
    ...overrides,
  };
}

function renderSection(teams: V1TournamentParticipantTeam[]) {
  return render(
    <TournamentParticipantSection
      teams={teams}
      teamCount={8}
      status="in_progress"
      confirmedCount={teams.length}
    />,
  );
}

describe('참가팀 카드 — 공개 명단 펼치기', () => {
  it('처음엔 접혀 있고, 누르면 등번호와 닉네임이 보인다', () => {
    renderSection([team()]);

    // 접힌 상태에서는 명단이 화면에 없다 — 팀이 많으면 상세가 길어지기 때문이다.
    expect(screen.queryByText('길동이')).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: '명단' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);

    expect(screen.getByText('길동이')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '명단 접기' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('등번호가 없는 선수는 —, 닉네임이 없으면 자리표시자 — 실명을 대신 쓰지 않는다', () => {
    renderSection([team()]);
    fireEvent.click(screen.getByRole('button', { name: '명단' }));

    // 0 으로 채우면 아무도 안 단 번호가 전원 0번이 된다.
    expect(screen.getByText('—')).toBeInTheDocument();
    // 실명 폴백은 정본 위반이다. 서버가 `null` 을 주면 화면이 자리표시자를 그린다.
    expect(screen.getByText('(탈퇴한 선수)')).toBeInTheDocument();
  });

  it('명단을 안 낸 팀은 왜 비었는지 말해 준다 — 빈 칸만 남기지 않는다', () => {
    renderSection([team({ players: [] })]);
    fireEvent.click(screen.getByRole('button', { name: '명단' }));

    expect(screen.getByText('아직 명단을 등록하지 않았어요.')).toBeInTheDocument();
  });

  it('토글은 팀 링크 **안에** 있지 않다 — 인터랙티브 중첩을 만들지 않는다', () => {
    const { container } = renderSection([team()]);

    const link = container.querySelector('a[href="/teams/team-1"]');
    expect(link).not.toBeNull();
    // 링크 안에 버튼이 있으면 키보드·스크린리더에서 무엇이 눌리는지 갈린다.
    expect(link?.querySelector('button')).toBeNull();
  });
});
