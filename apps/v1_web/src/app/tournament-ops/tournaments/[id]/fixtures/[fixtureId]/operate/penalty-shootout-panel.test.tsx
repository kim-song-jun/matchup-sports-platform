import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PenaltyShootoutPanel } from './penalty-shootout-panel';
import type { GameSide } from '@/types/game-operations';
import type { PenaltyKick } from '@/lib/penalty-shootout';

/**
 * 승부차기 패널의 **키보드 단독 사용 계약**.
 *
 * 이 패널은 다른 모달과 달리 처음 열렸을 때 버튼이 거의 전부 잠겨 있다 — 선축(먼저 차는
 * 팀)을 고르기 전에는 성공·실패가 잠기고, 킥이 없으니 되돌리기도, 결판이 안 났으니 종료도
 * 잠긴다. 그래서 열린 직후 다이얼로그 안에서 **활성화된 요소는 닫기 버튼과 선축 라디오
 * 둘뿐**이고, 포커스 트랩이 라디오를 못 보면 남는 tab stop이 닫기 버튼 하나가 되어 Tab도
 * Shift+Tab도 그 버튼으로 되감긴다. 즉 키보드 사용자는 선축을 고를 수 없고 → 킥을 기록할
 * 수 없고 → 승부차기를 아예 진행할 수 없다(WCAG 2.1.2 keyboard trap).
 *
 * 마우스로는 멀쩡히 동작하므로 이 결함은 **오직 키보드 경로에서만** 드러난다.
 */

const HOME: GameSide = {
  id: 's-home',
  gameId: 'g-1',
  sideKey: 'HOME',
  teamId: null,
  displayNameSnapshot: '강남 풋살 클럽',
  createdAt: '',
  updatedAt: '',
};
const AWAY: GameSide = {
  id: 's-away',
  gameId: 'g-1',
  sideKey: 'AWAY',
  teamId: null,
  displayNameSnapshot: '성수 풋살 클럽',
  createdAt: '',
  updatedAt: '',
};

function renderPanel(
  overrides: {
    kicks?: readonly PenaltyKick[];
    firstKickSideId?: string | null;
    sides?: readonly GameSide[];
    onSelectFirstKicker?: (sideId: string) => void;
  } = {},
) {
  const onSelectFirstKicker = overrides.onSelectFirstKicker ?? vi.fn();
  render(
    <PenaltyShootoutPanel
      sides={overrides.sides ?? [HOME, AWAY]}
      kicks={overrides.kicks ?? []}
      firstKickSideId={overrides.firstKickSideId ?? null}
      onSelectFirstKicker={onSelectFirstKicker}
      onRecordKick={vi.fn()}
      onUndoLastKick={vi.fn()}
      onFinish={vi.fn()}
      onCancel={vi.fn()}
      policy={{ earlyStop: true }}
      finishing={false}
    />,
  );
  return { onSelectFirstKicker };
}

describe('PenaltyShootoutPanel — 키보드 접근성', () => {
  it('패널을 열고 Tab만으로 선축 라디오에 도달해 선택할 수 있다', async () => {
    const user = userEvent.setup();
    const { onSelectFirstKicker } = renderPanel();

    const panel = screen.getByRole('dialog', { name: '승부차기' });
    // 열린 직후 포커스는 다이얼로그 안(닫기 버튼)에 있다.
    expect(panel).toContainElement(document.activeElement as HTMLElement);

    // 트랩이 라디오를 못 보면 여기서 포커스가 닫기 버튼에 갇혀 라디오에 영원히 못 간다.
    await user.tab();

    const homeRadio = within(panel).getByLabelText('강남 풋살 클럽');
    expect(homeRadio).toHaveFocus();

    // 도달만이 아니라 실제로 고를 수 있어야 한다 — 라디오는 Space로 선택한다.
    await user.keyboard(' ');
    expect(onSelectFirstKicker).toHaveBeenCalledWith('s-home');
  });

  it('Shift+Tab으로도 다이얼로그 안을 순환한다 — 포커스가 밖으로 새지 않는다', async () => {
    const user = userEvent.setup();
    renderPanel();

    const panel = screen.getByRole('dialog', { name: '승부차기' });
    await user.tab({ shift: true });

    expect(panel).toContainElement(document.activeElement as HTMLElement);
  });

  /**
   * 선축을 고른 뒤에는 성공/실패가 열려 tab stop이 늘어난다. 라디오 그룹의 tab stop은
   * **체크된 것 하나뿐**이라, 트랩이 라디오 두 개를 모두 세면 `last`가 영원히 포커스를
   * 받지 못하는 요소가 되어 되감기가 발동하지 않는다(= Tab이 다이얼로그 밖으로 샌다).
   */
  it('선축을 고른 뒤 Tab을 계속 눌러도 포커스가 다이얼로그를 벗어나지 않는다', async () => {
    const user = userEvent.setup();
    renderPanel({ firstKickSideId: 's-home' });

    const panel = screen.getByRole('dialog', { name: '승부차기' });
    for (let i = 0; i < 8; i += 1) {
      await user.tab();
      expect(panel).toContainElement(document.activeElement as HTMLElement);
    }
  });
});

describe('PenaltyShootoutPanel — 종료가 잠긴 사유 안내', () => {
  it('사이드가 2개가 아니면 선축을 골라도 "상대 팀이 정해지지 않았다"고 알려준다', () => {
    // 선축을 이미 골랐는데도 "먼저 차는 팀을 골라주세요."가 계속 뜨면, 운영자는 시키는
    // 대로 했는데 문구가 안 바뀌어 무엇을 해야 할지 알 수 없는 막다른 길에 빠진다.
    renderPanel({ sides: [HOME], firstKickSideId: 's-home' });

    expect(screen.getByText('상대 팀이 정해지지 않아 승부차기를 기록할 수 없어요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '승부차기 종료' })).toBeDisabled();
  });

  it('선축을 고르기 전에는 성공/실패가 잠기고 선축을 고르라고 안내한다', () => {
    renderPanel();

    expect(screen.getByRole('button', { name: /성공/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /실패/ })).toBeDisabled();
    expect(screen.getByText('먼저 차는 팀을 골라주세요.')).toBeInTheDocument();
  });
});
