import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TeamMatchApplyTeamSheet } from './team-match-detail-sheets';
import type { TeamMatchDetailViewModel } from './team-matches.types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

type Picker = NonNullable<TeamMatchDetailViewModel['applyTeamPicker']>;

const makeTeam = (teamId: string, name: string, eligible = true): Picker['teams'][number] => ({
  teamId,
  name,
  logoUrl: null,
  roleLabel: '팀장',
  eligible,
  reason: eligible ? null : '이미 신청했어요',
});

function renderSheet(teams: Picker['teams']) {
  const submit = vi.fn().mockResolvedValue({});
  render(
    <TeamMatchApplyTeamSheet
      picker={{ teams, defaultTeamId: teams[0].teamId, submit }}
      opponentCost={null}
      onClose={vi.fn()}
      onApplied={vi.fn()}
    />,
  );
  return submit;
}

// jsdom 은 포인터 캡처를 구현하지 않는다. 실제 브라우저에서는 시트가 pointerdown 을 캡처하면
// click 이 시트로 재지정돼 label 활성화가 사라지므로, 캡처가 걸렸는지를 관측한다.
const setCapture = vi.fn();
const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
proto.setPointerCapture = setCapture;
proto.hasPointerCapture = () => false;
proto.releasePointerCapture = vi.fn();

afterEach(() => {
  cleanup();
  setCapture.mockClear();
});

function pressLabel(name: RegExp) {
  const label = screen.getByRole('radio', { name }).closest('label') as HTMLElement;
  fireEvent.pointerDown(label, { pointerId: 1, clientY: 0 });
  fireEvent.pointerUp(label, { pointerId: 1, clientY: 0 });
  fireEvent.click(label);
  return label;
}

describe('TeamMatchApplyTeamSheet 팀 선택', () => {
  it('두 번째 팀 행을 누르면 선택·버튼 문구·신청 팀이 바뀌고 포인터를 가로채지 않는다', () => {
    const submit = renderSheet([makeTeam('t1', '가나다FC'), makeTeam('t2', '라마바FC'), makeTeam('t3', '사아자FC')]);
    expect(screen.getByRole('button', { name: '가나다FC로 신청하기' })).toBeTruthy();

    pressLabel(/라마바FC/);

    expect(setCapture).not.toHaveBeenCalled();
    expect((screen.getByRole('radio', { name: /라마바FC/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('radio', { name: /가나다FC/ }) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '라마바FC로 신청하기' }));
    expect(submit).toHaveBeenCalledWith('t2', null);
  });

  // L1 — "합정 유나이티드으로 신청": 받침 없는 이름에도 '으로' 가 붙었다.
  it.each([
    ['합정 유나이티드', '합정 유나이티드로 신청하기'],
    ['마포 FC', '마포 FC로 신청하기'],
    ['한강 러너스', '한강 러너스로 신청하기'],
    ['서울 팀', '서울 팀으로 신청하기'],
    ['라이벌', '라이벌로 신청하기'],
  ])('신청 버튼의 조사는 팀 이름 받침을 따른다: %s', (name, expected) => {
    renderSheet([makeTeam('t1', name)]);
    expect(screen.getByRole('button', { name: expected })).toBeTruthy();
  });

  it('잠긴 팀은 선택되지 않는다', () => {
    renderSheet([makeTeam('t1', '가나다FC'), makeTeam('t2', '라마바FC', false)]);
    pressLabel(/라마바FC/);
    expect(screen.getByRole('button', { name: '가나다FC로 신청하기' })).toBeTruthy();
  });

  it('시트 빈 곳에서 시작한 포인터는 여전히 드래그로 잡는다(대조)', () => {
    renderSheet([makeTeam('t1', '가나다FC'), makeTeam('t2', '라마바FC')]);
    fireEvent.pointerDown(screen.getByRole('dialog'), { pointerId: 1, clientY: 0 });
    expect(setCapture).toHaveBeenCalledTimes(1);
  });
});
