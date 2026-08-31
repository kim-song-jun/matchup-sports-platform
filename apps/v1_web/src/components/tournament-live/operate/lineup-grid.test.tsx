import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { latestLineupForDisplay, latestOperableLineup, LineupGrid, matchesPlayerQuery } from './lineup-grid';
import type { GameLineup, GameLineupParticipant, GameSide } from '@/types/game-operations';

// ─────────────────────────────────────────────────────────────────────────────
// 1차 대회(2026-08-15~16) 회고 — 실시간 입력을 "후보 선수들에게 물어보고 얘기하면서"
// 진행했다. 스쿼드가 15~20명이면 등번호순 정렬만으로는 스크롤하며 눈으로 훑어야
// 하고, 경기 중 그 몇 초가 곧 오입력이다.
//
// 이 스위트가 지키는 계약:
//   ① 등번호와 이름 **양쪽**으로 찾힌다 (운영자가 아는 정보가 둘 중 하나다)
//   ② 교체 대상 선택처럼 이미 좁혀진 목록에는 검색창을 띄우지 않는다
//   ③ 검색이 목록을 비웠을 때 "명단이 없다"고 오인시키지 않는다
// ─────────────────────────────────────────────────────────────────────────────

function side(id: string, name: string, sideKey: 'HOME' | 'AWAY'): GameSide {
  return {
    id,
    gameId: 'g-1',
    sideKey,
    teamId: null,
    displayNameSnapshot: name,
    createdAt: '2026-08-23T00:00:00.000Z',
    updatedAt: '2026-08-23T00:00:00.000Z',
  };
}

function participant(
  id: string,
  displayNameSnapshot: string,
  jerseyNumber: number | null,
): GameLineupParticipant {
  return {
    id,
    gameId: 'g-1',
    sideId: 'side-home',
    lineupId: 'lineup-home',
    userId: null,
    displayNameSnapshot,
    jerseyNumber,
    position: null,
    positionX: null,
    positionY: null,
    started: true,
    arrivedAt: null,
    createdAt: '2026-08-23T00:00:00.000Z',
    updatedAt: '2026-08-23T00:00:00.000Z',
  };
}

function lineup(participants: GameLineupParticipant[]): GameLineup {
  return {
    id: 'lineup-home',
    gameId: 'g-1',
    sideId: 'side-home',
    revision: 2,
    state: 'SUBMITTED',
    version: 0,
    submittedAt: '2026-08-23T00:00:00.000Z',
    supersedesId: null,
    formation: null,
    createdAt: '2026-08-23T00:00:00.000Z',
    updatedAt: '2026-08-23T00:00:00.000Z',
    participants,
  };
}

const SIDES = [side('side-home', '홈팀', 'HOME')];
const SQUAD = [
  participant('p-1', '홍길동', 1),
  participant('p-2', '김철수', 10),
  participant('p-3', '홍판서', 11),
  participant('p-4', '이영희', null),
];

describe('matchesPlayerQuery', () => {
  it('빈 검색어는 전원을 통과시킨다', () => {
    expect(matchesPlayerQuery(SQUAD[0], '')).toBe(true);
    expect(matchesPlayerQuery(SQUAD[0], '   ')).toBe(true);
  });

  it('이름은 부분 일치라 성만 쳐도 찾힌다', () => {
    expect(matchesPlayerQuery(SQUAD[0], '홍')).toBe(true);
    expect(matchesPlayerQuery(SQUAD[2], '홍')).toBe(true);
    expect(matchesPlayerQuery(SQUAD[1], '홍')).toBe(false);
  });

  // 접두 일치인 이유: 두 자리 번호를 한 자만 기억하는 경우가 실제로 있다.
  it('등번호는 접두 일치라 "1"로 1·10·11이 함께 뜬다', () => {
    expect(matchesPlayerQuery(SQUAD[0], '1')).toBe(true);
    expect(matchesPlayerQuery(SQUAD[1], '1')).toBe(true);
    expect(matchesPlayerQuery(SQUAD[2], '1')).toBe(true);
  });

  it('등번호는 부분 일치가 아니다 — "0"이 10을 끌어오면 후보가 오히려 늘어난다', () => {
    expect(matchesPlayerQuery(SQUAD[1], '0')).toBe(false);
  });

  it('등번호가 없는 선수는 숫자 검색에 걸리지 않지만 이름으로는 찾힌다', () => {
    expect(matchesPlayerQuery(SQUAD[3], '1')).toBe(false);
    expect(matchesPlayerQuery(SQUAD[3], '이영')).toBe(true);
  });

  it('앞뒤 공백과 대소문자를 무시한다', () => {
    expect(matchesPlayerQuery(participant('p-x', 'Kim Alpha', 7), '  kim ')).toBe(true);
  });
});

describe('LineupGrid — 선수 검색', () => {
  it('검색어를 입력하면 맞는 선수만 남는다', () => {
    render(<LineupGrid sides={SIDES} lineups={[lineup(SQUAD)]} onSelectPlayer={vi.fn()} />);

    expect(screen.getAllByRole('button', { name: /선수 이벤트 기록/ })).toHaveLength(4);

    fireEvent.change(screen.getByLabelText('등번호 또는 이름으로 선수 찾기'), {
      target: { value: '홍' },
    });

    const remaining = screen.getAllByRole('button', { name: /선수 이벤트 기록/ });
    expect(remaining).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /김철수/ })).not.toBeInTheDocument();
  });

  it('좁혀진 뒤에도 선택은 그대로 동작한다 (검색이 기록 경로를 끊으면 안 된다)', () => {
    const onSelectPlayer = vi.fn();
    render(<LineupGrid sides={SIDES} lineups={[lineup(SQUAD)]} onSelectPlayer={onSelectPlayer} />);

    fireEvent.change(screen.getByLabelText('등번호 또는 이름으로 선수 찾기'), {
      target: { value: '10' },
    });
    fireEvent.click(screen.getByRole('button', { name: /김철수/ }));

    expect(onSelectPlayer).toHaveBeenCalledWith(
      expect.objectContaining({ sideId: 'side-home', participant: expect.objectContaining({ id: 'p-2' }) }),
    );
  });

  // ③ 검색 결과 0건과 "명단 미제출"은 완전히 다른 상황이다.
  it('검색 결과가 없으면 명단이 없다고 하지 않고 검색어를 되짚어 준다', () => {
    render(<LineupGrid sides={SIDES} lineups={[lineup(SQUAD)]} onSelectPlayer={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('등번호 또는 이름으로 선수 찾기'), {
      target: { value: '없는이름' },
    });

    expect(screen.getByText("'없는이름'과 맞는 선수가 없어요.")).toBeInTheDocument();
    expect(screen.queryByText('이 팀의 명단을 찾을 수 없어요.')).not.toBeInTheDocument();
  });

  // ② 교체 1·2단계는 이미 온피치/벤치로 좁혀진 목록이라 검색창이 방해만 된다.
  it('filterParticipantIds 가 걸린 호출에는 검색창을 띄우지 않는다', () => {
    render(
      <LineupGrid
        sides={SIDES}
        lineups={[lineup(SQUAD)]}
        onSelectPlayer={vi.fn()}
        filterParticipantIds={new Set(['p-1'])}
      />,
    );

    expect(screen.queryByLabelText('등번호 또는 이름으로 선수 찾기')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /선수 이벤트 기록/ })).toHaveLength(1);
  });

  it('명단 자체가 없으면 안내 문구를 보여준다 (제출 링크는 P1-d 로 사라졌다)', () => {
    render(
      <LineupGrid
        sides={SIDES}
        lineups={[]}
        onSelectPlayer={vi.fn()}
        tournamentId="t-1"
        fixtureId="f-1"
      />,
    );

    // [P1-c 후속] 문구가 바뀌었다. 표시는 이제 폴백을 쓰므로 여기까지 오는 것은
    // **초안조차 없다**는 뜻이다 -- '제출된 명단이 없다'는 더 이상 정확한 설명이 아니다.
    expect(screen.getByText('이 팀의 명단을 찾을 수 없어요.')).toBeInTheDocument();
    // [P1-d] 제출 링크 단언은 뺐다 -- 경기별 라인업 화면이 사라져 갈 곳이 없다.
    // 빈 상태 **문구**는 남는다(운영자가 왜 비었는지 알아야 한다).
    expect(screen.queryByRole('link', { name: '라인업 제출하러 가기' })).not.toBeInTheDocument();
  });

  it('비활성 상태에서는 검색창도 잠근다', () => {
    render(<LineupGrid sides={SIDES} lineups={[lineup(SQUAD)]} onSelectPlayer={vi.fn()} disabled />);

    expect(screen.getByLabelText('등번호 또는 이름으로 선수 찾기')).toBeDisabled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// [P1-c 후속] **두 규칙은 일부러 다르다. 이 스위트가 그것을 고정한다.**
//
// P1-c 가 "양 팀이 제출해야 시작할 수 있다"는 게이트를 걷어내면서, 라이브 경기에
// 제출본이 항상 있다는 전제가 깨졌다. 그런데 화면은 여전히 제출본만 보고 있어서
// **미제출 상태로 시작한 경기의 콘솔이 통째로 비었다** — 득점을 아무에게도 못 붙이고
// 검인할 대상도 안 떴다(P1-b 가 지킨 `arrivedAt` 을 만들 수가 없다).
//
// 고치면서 규칙을 **하나로 합치지 않았다**. 소비처마다 옳은 답이 다르기 때문이다:
//   · 표시·검인 → 폴백(`latestLineupForDisplay`). 안 그러면 화면이 빈다.
//   · "아직 제출 안 했어요" 경고 → 제출본 전용(`latestOperableLineup`).
//     폴백으로 바꾸면 초안이 늘 잡혀 **경고가 영영 안 뜬다.**
//
// 둘을 통일하려는 시도가 이 사고를 재현하므로, 차이 자체를 테스트로 못박는다.
// ─────────────────────────────────────────────────────────────────────────────
describe('[P1-c 후속] 표시용 폴백과 제출본 전용 판정은 의도적으로 다르다', () => {
  const draftOnly: GameLineup[] = [{ ...lineup([]), id: 'l-draft', state: 'DRAFT', revision: 1 }];
  const submittedThenDraft: GameLineup[] = [
    { ...lineup([]), id: 'l-submitted', state: 'SUBMITTED', revision: 1 },
    { ...lineup([]), id: 'l-reopened', state: 'DRAFT', revision: 2 },
  ];

  it('표시·검인: 제출본이 없으면 최신 DRAFT 를 쓴다 (안 그러면 콘솔이 빈다)', () => {
    expect(latestLineupForDisplay(draftOnly, 'side-home')?.id).toBe('l-draft');
  });

  it('미제출 경고: 제출본이 없으면 null 이다 (폴백을 쓰면 경고가 영영 안 뜬다)', () => {
    expect(latestOperableLineup(draftOnly, 'side-home')).toBeNull();
  });

  it('제출본이 있으면 둘 다 같은 것을 고른다 — 위에 얹힌 DRAFT 가 제출을 밀어내지 못한다', () => {
    expect(latestLineupForDisplay(submittedThenDraft, 'side-home')?.id).toBe('l-submitted');
    expect(latestOperableLineup(submittedThenDraft, 'side-home')?.id).toBe('l-submitted');
  });
});
