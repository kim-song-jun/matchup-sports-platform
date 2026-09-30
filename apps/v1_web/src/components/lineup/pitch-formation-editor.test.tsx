import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LineupEntryDraft } from '@/app/team-matches/[id]/lineup/lineup.view-model';
import type { FormationPreset } from './formation-slots';
import { PitchFormationEditor, type PitchFormationEditorProps } from './pitch-formation-editor';

/** 포메이션 칩 하나를 누른다. 옆 패널과 시트에 같은 컨트롤이 두 벌이라 첫 번째를 누른다.
 * 칩 이름은 "<코드> <라벨> · 필드 N명" — 코드로 시작하는지로 특정한다('1-1' 이 '1-2-1' 에 걸리지 않게). */
function chooseFormation(code: string) {
  const name = code === '' ? /^자유 배치/ : new RegExp(`^${code}\\s`);
  fireEvent.click(screen.getAllByRole('button', { name })[0]);
}

function makeEntry(overrides: Partial<LineupEntryDraft> & { key: string }): LineupEntryDraft {
  return {
    userId: null, displayName: '홍길동', jerseyNumber: 1, goalkeeper: false,
    position: null, positionX: null, positionY: null, ...overrides,
  };
}

/** 풋살 1-2-1(서버 사전 좌표) — 자리 순서는 GK, FX, AL(좌), AL(우), PV. */
const diamond: FormationPreset = {
  code: '1-2-1', label: '다이아몬드', outfield: 4,
  slots: [
    { positionCode: 'FIXO', label: 'FX', x: 50, y: 35 },
    { positionCode: 'ALA', label: 'AL', x: 20, y: 58 },
    { positionCode: 'ALA', label: 'AL', x: 80, y: 58 },
    { positionCode: 'PIVO', label: 'PV', x: 50, y: 83 },
  ],
};

const box: FormationPreset = {
  code: '2-2', label: '박스', outfield: 4,
  slots: [
    { positionCode: 'FIXO', label: 'FX', x: 28, y: 38 },
    { positionCode: 'FIXO', label: 'FX', x: 72, y: 38 },
    { positionCode: 'PIVO', label: 'PV', x: 28, y: 76 },
    { positionCode: 'PIVO', label: 'PV', x: 72, y: 76 },
  ],
};

function renderEditor(overrides: Partial<PitchFormationEditorProps> = {}) {
  const props: PitchFormationEditorProps = {
    court: 'futsal', onCourt: [], waiting: [], formation: '1-2-1', formationOptions: [diamond, box],
    formationNote: null, summary: null, editable: true,
    onSelectFormation: vi.fn(), onPlacePlayer: vi.fn(), onPlaceInSlot: vi.fn(), onUnplacePlayer: vi.fn(),
    ...overrides,
  };
  render(<PitchFormationEditor {...props} />);
  return props;
}

/** 문서 순서상 a 가 b 보다 앞(화면에서는 위)인지. */
function isBefore(a: Element, b: Element): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

const waitingTwo = [
  makeEntry({ key: 'a', displayName: '선수다섯', jerseyNumber: 5 }),
  makeEntry({ key: 'b', displayName: '선수여섯', jerseyNumber: 6 }),
];

describe('PitchFormationEditor — 종목별 경기장', () => {
  it('풋살은 40x20 코트(세로 1:2), 축구는 기존 피치 비율', () => {
    renderEditor({ court: 'futsal' });
    expect(screen.getByRole('application', { name: '코트 배치 보드' })).toHaveStyle({ aspectRatio: '1 / 2' });
  });

  it('축구 11인제는 기존 피치 그대로다', () => {
    renderEditor({ court: 'football', formation: null, formationOptions: [] });
    expect(screen.getByRole('application', { name: '피치 배치 보드' })).toHaveStyle({ aspectRatio: '68 / 105' });
  });
});

describe('PitchFormationEditor — 대기 칩 한 번 누르기', () => {
  it('처음에는 첫 빈 자리(GK)가 흰 테두리이고, 칩을 누르면 그 자리에 놓인다', () => {
    const props = renderEditor({ waiting: waitingTwo });
    expect(screen.getByRole('button', { name: /^GK 자리, 비어 있음 — 다음에 놓일 자리$/ })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: '선수다섯(5번) 코트에 놓기' }));
    expect(props.onPlaceInSlot).toHaveBeenCalledWith('a', expect.objectContaining({ positionCode: 'GK' }));
  });

  it('GK 가 찼으면 다음 칩은 자리 순서대로 FX 에 놓인다', () => {
    const props = renderEditor({
      onCourt: [makeEntry({ key: 'gk', displayName: '김골키', goalkeeper: true, positionX: 50, positionY: 6 })],
      waiting: waitingTwo,
    });
    fireEvent.click(screen.getByRole('button', { name: '선수여섯(6번) 코트에 놓기' }));
    expect(props.onPlaceInSlot).toHaveBeenCalledWith('b', expect.objectContaining({ positionCode: 'FIXO', x: 50, y: 35 }));
  });

  it('자리를 먼저 누르면 그 자리가 다음 자리가 된다', () => {
    const props = renderEditor({ waiting: waitingTwo });
    fireEvent.click(screen.getAllByRole('button', { name: /^AL 자리, 비어 있음/ })[1]);
    fireEvent.click(screen.getByRole('button', { name: '선수다섯(5번) 코트에 놓기' }));
    expect(props.onPlaceInSlot).toHaveBeenCalledWith('a', expect.objectContaining({ positionCode: 'ALA', x: 80 }));
  });

  it('자리가 다 찼으면 놓지 않고 이유를 알린다', () => {
    const full = [
      makeEntry({ key: 'gk', displayName: '김골키', goalkeeper: true, positionX: 50, positionY: 6 }),
      makeEntry({ key: 'f', displayName: '픽소', position: 'FIXO', positionX: 50, positionY: 35 }),
      makeEntry({ key: 'l', displayName: '왼아라', position: 'ALA', positionX: 20, positionY: 58 }),
      makeEntry({ key: 'r', displayName: '오른아라', position: 'ALA', positionX: 80, positionY: 58 }),
      makeEntry({ key: 'p', displayName: '피보', position: 'PIVO', positionX: 50, positionY: 83 }),
    ];
    const props = renderEditor({ onCourt: full, waiting: waitingTwo });
    expect(screen.queryByRole('button', { name: /자리, 비어 있음/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '선수다섯(5번) 코트에 놓기' }));
    expect(props.onPlaceInSlot).not.toHaveBeenCalled();
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('빈 자리가 없어요');
    // 코트 아래는 390 에서 하단 고정 저장 바에 가린다(W3-V2) — 안내는 코트보다 앞(위)에 온다.
    expect(isBefore(status, screen.getByRole('application', { name: '코트 배치 보드' }))).toBe(true);
  });

  it('자유 배치에서는 칩이 "고르기"다 — 코트를 눌러야 놓인다', () => {
    const props = renderEditor({ formation: null, waiting: waitingTwo });
    const chip = screen.getByRole('button', { name: '선수다섯(5번) 코트에 놓기' });
    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(props.onPlaceInSlot).not.toHaveBeenCalled();
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('선수다섯 선수를 놓을 자리를 코트에서 눌러 주세요.');
    expect(isBefore(status, screen.getByRole('application', { name: '코트 배치 보드' }))).toBe(true);

    fireEvent.click(within(status).getByRole('button', { name: '선택 취소' }));
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('코트 위 선수의 × 는 코트 밖으로 뺀다', () => {
    const props = renderEditor({
      onCourt: [makeEntry({ key: 'f', displayName: '픽소', position: 'FIXO', positionX: 50, positionY: 35 })],
    });
    fireEvent.click(screen.getByRole('button', { name: '픽소 배치 취소' }));
    expect(props.onUnplacePlayer).toHaveBeenCalledWith('f');
  });
});

describe('PitchFormationEditor — 토큰 표기(N-1)', () => {
  it('원 안에는 등번호, 이름표는 보드 전원의 같은 앞부분을 뗀 이름', () => {
    renderEditor({
      formation: null,
      onCourt: [makeEntry({ key: 'a', displayName: 'QA0929선수01', jerseyNumber: 1, positionX: 50, positionY: 40 })],
      waiting: [makeEntry({ key: 'b', displayName: 'QA0929팀장1', jerseyNumber: 10 })],
    });
    const token = screen.getByRole('button', { name: 'QA0929선수01, 등번호 1' });
    expect(token).toHaveTextContent(/^1$/);
    expect(screen.getByTitle('QA0929선수01')).toHaveTextContent(/^선수01$/);
  });

  it('번호가 없으면 첫 글자 + 점선 원', () => {
    renderEditor({
      formation: null,
      onCourt: [makeEntry({ key: 'a', displayName: '김민수', jerseyNumber: null, positionX: 50, positionY: 40 })],
    });
    const token = screen.getByRole('button', { name: '김민수, 등번호 없음' });
    expect(token).toHaveTextContent(/^김$/);
    expect(token.style.border).toContain('dashed');
  });

  it('긴 이름은 앞 4자 + …, 전체 이름은 스크린리더 라벨에 남는다', () => {
    renderEditor({
      formation: null,
      onCourt: [makeEntry({ key: 'a', displayName: '중흥의푸른오른발', jerseyNumber: 9, positionX: 50, positionY: 40 })],
    });
    expect(screen.getByTitle('중흥의푸른오른발')).toHaveTextContent(/^중흥의푸…$/);
    expect(screen.getByRole('button', { name: '중흥의푸른오른발, 등번호 9' })).toBeInTheDocument();
  });

  it('골키퍼 이름표는 코트 밖으로 잘리지 않게 토큰 위에 붙는다', () => {
    renderEditor({
      formation: null,
      onCourt: [makeEntry({ key: 'gk', displayName: '김골키', goalkeeper: true, positionX: 50, positionY: 6 })],
    });
    expect(screen.getByTitle('김골키')).toHaveStyle({ bottom: '100%' });
  });
});

describe('PitchFormationEditor — 읽기 전용(팀원)', () => {
  it('놓기·빼기·자리 고르기·대형 바꾸기를 모두 막고, 대기 명단은 글자로만 보인다', () => {
    renderEditor({
      editable: false,
      onCourt: [makeEntry({ key: 'f', displayName: '픽소', position: 'FIXO', positionX: 50, positionY: 35 })],
      waiting: waitingTwo,
    });
    expect(screen.queryByRole('button', { name: /코트에 놓기$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /배치 취소$/ })).not.toBeInTheDocument();
    for (const slot of screen.getAllByRole('button', { name: /자리, 비어 있음/ })) expect(slot).toBeDisabled();
    // 바꿀 수 없는 사람에게 "변경하기"라고 읽어 주지 않는다(W3-V3).
    const formationEntry = screen.getByRole('button', { name: /^포메이션 / });
    expect(formationEntry).toBeDisabled();
    expect(formationEntry).toHaveAccessibleName('포메이션 1-2-1 · 다이아몬드 (필드 4명)');
    expect(formationEntry).not.toHaveAttribute('aria-haspopup');
    // 대기 이름은 팀장 화면의 눌리는 칩(테두리 알약)과 다른 모양이다.
    const waitingName = within(screen.getByRole('list', { name: '대기 2명' })).getByTitle('선수다섯');
    expect(waitingName.tagName).toBe('SPAN');
    expect(waitingName.style.border).toBe('');
    expect(waitingName.style.borderRadius).toBe('');
  });

  it('편집할 수 있는 사람의 대기 칩은 테두리 알약 버튼이다 (대조군)', () => {
    renderEditor({ waiting: waitingTwo });
    const chip = screen.getByRole('button', { name: '선수다섯(5번) 코트에 놓기' });
    expect(chip.style.borderRadius).toBe('var(--radius-pill)');
    expect(screen.getByRole('button', { name: /^포메이션 .*, 변경하기$/ })).toHaveAttribute('aria-haspopup', 'dialog');
  });
});

describe('PitchFormationEditor — 대형 목록', () => {
  it('받은 대형 + 자유 배치만 보이고, 안내 문구를 함께 보여준다', () => {
    renderEditor({ formationNote: '5:5 경기예요. 필드 4명 대형만 보여요.' });
    expect(screen.getAllByRole('button', { name: '1-2-1 다이아몬드 · 필드 4명' })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '2-2 박스 · 필드 4명' })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^자유 배치/ })[0]).toBeInTheDocument();
    expect(screen.getAllByText('5:5 경기예요. 필드 4명 대형만 보여요.')[0]).toBeInTheDocument();
  });

  it('칩 미리보기는 코트와 같은 좌표계다 — GK 가 맨 아래', () => {
    renderEditor();
    const chip = screen.getAllByRole('button', { name: /^2-2\s/ })[0];
    const cys = [...chip.querySelectorAll('circle')].map((circle) => Number(circle.getAttribute('cy')));
    expect(cys).toHaveLength(5);
    expect(cys[0]).toBeGreaterThan(Math.max(...cys.slice(1)));
  });
});

/**
 * 포메이션 전환 확인 — 코트 위 선수가 실제로 움직일 때만 묻고, 확인 전에는 상태를 바꾸지 않는다.
 */
describe('PitchFormationEditor — 포메이션 전환 확인', () => {
  /** 필드 자리가 2개뿐 — 4명을 놓은 상태에서 고르면 2명이 대기로 내려간다. */
  const tiny: FormationPreset = {
    code: '1-1', label: '미니', outfield: 2,
    slots: [
      { positionCode: 'FIXO', label: 'FX', x: 50, y: 40 },
      { positionCode: 'PIVO', label: 'PV', x: 50, y: 80 },
    ],
  };

  function placedInBox(): LineupEntryDraft[] {
    return [
      makeEntry({ key: 'gk', displayName: '김골키', goalkeeper: true, positionX: 50, positionY: 6 }),
      makeEntry({ key: 'f1', displayName: '픽소일', position: 'FIXO', positionX: 28, positionY: 38 }),
      makeEntry({ key: 'f2', displayName: '픽소이', position: 'FIXO', positionX: 72, positionY: 38 }),
      makeEntry({ key: 'p1', displayName: '피보일', position: 'PIVO', positionX: 28, positionY: 76 }),
      makeEntry({ key: 'p2', displayName: '피보이', position: 'PIVO', positionX: 72, positionY: 76 }),
    ];
  }

  it('코트 위 선수가 움직여야 하면 확인을 먼저 묻고, 확인하면 적용한다', () => {
    const props = renderEditor({ formation: '2-2', onCourt: placedInBox() });
    chooseFormation('1-2-1');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(props.onSelectFormation).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '포메이션 바꾸기' }));
    expect(props.onSelectFormation).toHaveBeenCalledWith('1-2-1');
  });

  it('취소하면 아무것도 바뀌지 않는다', () => {
    const props = renderEditor({ formation: '2-2', onCourt: placedInBox() });
    chooseFormation('1-2-1');
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(props.onSelectFormation).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('자리가 줄면 대기로 내려가는 선수를 밝힌다', () => {
    renderEditor({ formation: '2-2', onCourt: placedInBox(), formationOptions: [box, tiny] });
    chooseFormation('1-1');
    expect(screen.getByText(/대기로 내려가요/)).toBeInTheDocument();
  });

  it('코트가 비었거나 자유 배치로 돌아갈 때는 묻지 않는다', () => {
    const empty = renderEditor({ formation: '2-2' });
    chooseFormation('1-2-1');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(empty.onSelectFormation).toHaveBeenCalledWith('1-2-1');
  });

  it('자유 배치로 돌아갈 때는 좌표가 그대로라 묻지 않는다', () => {
    const props = renderEditor({ formation: '2-2', onCourt: placedInBox() });
    chooseFormation('');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(props.onSelectFormation).toHaveBeenCalledWith(null);
  });
});

describe('PitchFormationEditor — 모바일 포메이션 진입점', () => {
  function mobileEntry() {
    return screen.getByRole('button', { name: /^포메이션 .*변경하기$/ });
  }

  it('"포메이션" 라벨과 지금 대형(코드·이름·필드 인원)을 함께 보여주고, 누르면 시트가 열린다', () => {
    renderEditor();
    const entry = mobileEntry();
    expect(within(entry).getByText('포메이션')).toBeInTheDocument();
    expect(within(entry).getByText('1-2-1 · 다이아몬드 (필드 4명)')).toBeInTheDocument();

    fireEvent.click(entry);
    expect(screen.getByRole('dialog', { name: '배치 설정' })).toBeInTheDocument();
  });

  it('자유 배치일 때는 "자유 배치"로 보여준다', () => {
    renderEditor({ formation: null });
    expect(within(mobileEntry()).getByText('자유 배치')).toBeInTheDocument();
  });
});
