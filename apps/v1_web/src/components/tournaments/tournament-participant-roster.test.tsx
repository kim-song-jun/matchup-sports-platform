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
  /**
   * **어포던스 역전을 막는다.**
   *
   * 이 토글은 인라인 스타일로 `--card-surface` 배경에 테두리를 둘렀는데, 그 색이 **카드
   * 배경과 같아** 눌리는 것이 아니라 빈 상자로 보였다. 바로 옆의 `참가 확정` 은 채워진
   * 칩이라, 정작 누를 수 있는 쪽이 덜 눌러 보였다.
   *
   * 지금은 같은 페이지의 "전체 보기" 토글과 **같은 공유 패턴**(ghost 버튼)을 쓴다.
   * 인라인 배경이 다시 붙으면 같은 역전이 돌아오므로 그 부재까지 함께 잰다 — 클래스만
   * 재면 인라인이 그 위를 덮어써도 통과한다.
   */
  it('명단 토글은 공유 ghost 버튼 패턴을 쓴다 — 카드색 인라인 배경을 다시 두지 않는다', () => {
    renderSection([team()]);

    const toggle = screen.getByRole('button', { name: 'A팀 명단 펼치기' });
    expect(toggle).toHaveClass('tm-btn', 'tm-btn-sm', 'tm-btn-ghost');
    // shorthand 와 롱핸드를 **둘 다** 잰다 — 되돌리기는 shorthand 로 오지만 새로 쓰는
    // 사람은 `backgroundColor` 를 쓸 수 있고, 그러면 shorthand 만 재는 단언은 통과한다.
    expect(toggle.style.background).toBe('');
    expect(toggle.style.backgroundColor).toBe('');
    expect(toggle.style.border).toBe('');
    expect(toggle.style.borderColor).toBe('');
  });

  it('처음엔 접혀 있고, 누르면 등번호와 닉네임이 보인다', () => {
    renderSection([team()]);

    // 접힌 상태에서는 명단이 화면에 없다 — 팀이 많으면 상세가 길어지기 때문이다.
    expect(screen.queryByText('길동이')).not.toBeInTheDocument();

    // **시각 텍스트로 찾는다.** 접근성 이름(`aria-label`)에는 팀명이 들어가는데, 그걸
    // 기준으로 찾으면 라벨 문구를 손볼 때마다 테스트가 함께 깨진다 — 둘은 독립이어야 한다.
    const toggle = screen.getByText('명단');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);

    expect(screen.getByText('길동이')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('명단 접기')).toHaveAttribute('aria-expanded', 'true');
    // 접근성 이름에는 팀명이 들어간다 — 팀이 여럿일 때 어느 팀 명단인지 구분된다.
    expect(screen.getByLabelText('A팀 명단 접기')).toBeInTheDocument();
  });

  it('등번호가 없는 선수는 —, 닉네임이 없으면 자리표시자 — 실명을 대신 쓰지 않는다', () => {
    renderSection([team()]);
    fireEvent.click(screen.getByText('명단'));

    // 0 으로 채우면 아무도 안 단 번호가 전원 0번이 된다.
    expect(screen.getByText('—')).toBeInTheDocument();
    // 실명 폴백은 정본 위반이다. 서버가 `null` 을 주면 화면이 자리표시자를 그린다.
    expect(screen.getByText('(탈퇴한 선수)')).toBeInTheDocument();
  });

  it('명단을 안 낸 팀은 왜 비었는지 말해 준다 — 빈 칸만 남기지 않는다', () => {
    renderSection([team({ players: [] })]);
    fireEvent.click(screen.getByText('명단'));

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
