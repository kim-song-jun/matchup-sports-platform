import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeFixture, makeGame, makeSlot } from '@/test/bracket-canvas-fixtures';
import type { V1AdminBracketFixture, V1AdminBracketSlot } from '@/types/api';
import { BracketCanvasNode } from './bracket-canvas-node';
import { REGISTRATION_DRAG_MIME } from './bracket-canvas-dnd';

const POSITION = { fixtureId: 'f1', columnKey: 'g', x: 24, y: 56, width: 232, height: 156 };
const entry = (id: string) => makeSlot({ id, kind: 'ENTRY', label: `${id} 자리` });

function renderNode(
  fixture: V1AdminBracketFixture,
  overrides: Partial<React.ComponentProps<typeof BracketCanvasNode>> = {},
) {
  const props = {
    fixture,
    position: POSITION,
    title: '8강 1번 경기',
    sideLabels: { HOME: '1번 자리', AWAY: '2번 자리' },
    slots: { HOME: entry('s-home') as V1AdminBracketSlot | null, AWAY: entry('s-away') as V1AdminBracketSlot | null },
    selected: false,
    canWrite: true,
    pendingRegistrationId: null,
    onSelect: vi.fn(),
    onAssign: vi.fn(),
    onAssignDirect: vi.fn(),
    ...overrides,
  };
  render(<BracketCanvasNode {...props} />);
  return props;
}

const base = makeFixture({ id: 'f1', groupId: 'g', fixtureNumber: 1, homeSlotId: 's-home', awaySlotId: 's-away' });
const officialQuick = (entryMethod: 'quick' | 'console' | 'correction', penalties?: { home: number; away: number }) =>
  makeFixture({
    ...base,
    homeRegistrationId: 'r1',
    homeTeamName: '서울FC',
    awayRegistrationId: 'r2',
    awayTeamName: '부산FC',
    game: makeGame({
      state: 'ENDED',
      latestRevision: { id: 'rev', state: 'OFFICIAL', entryMethod, score: { home: 1, away: 1, ...(penalties ? { penalties } : {}) } },
    }),
  });

describe('BracketCanvasNode — 표시', () => {
  it('예정 칸: 제목·상태 태그·사이드 라벨을 보여 주고 점수는 없다', () => {
    renderNode(base);
    expect(screen.getByRole('group', { name: '8강 1번 경기, 예정' })).toBeInTheDocument();
    expect(screen.getByText('예정')).toBeInTheDocument();
    expect(screen.getByText('1번 자리')).toBeInTheDocument();
    expect(screen.queryByLabelText('어드민 빠른 입력')).not.toBeInTheDocument();
  });

  it('빠른 입력으로 확정된 칸만 "어드민 빠른 입력"과 점수를 보여 준다(대조: 콘솔 입력은 표시 없음)', () => {
    renderNode(officialQuick('quick'));
    expect(screen.getByText('확정')).toBeInTheDocument();
    expect(screen.getByLabelText('어드민 빠른 입력')).toBeInTheDocument();
  });

  it('라이브 콘솔로 확정된 칸에는 빠른 입력 표시가 없다', () => {
    renderNode(officialQuick('console'));
    expect(screen.getByText('확정')).toBeInTheDocument();
    expect(screen.queryByLabelText('어드민 빠른 입력')).not.toBeInTheDocument();
  });

  it('승부차기 점수를 꼬리에 보여 준다', () => {
    renderNode(officialQuick('quick', { home: 4, away: 3 }));
    expect(screen.getByText(/PK 4:3/)).toBeInTheDocument();
  });

  it('무효 처리된 칸은 점수를 숨기고 "무효 처리됨"을 보여 준다', () => {
    renderNode(
      makeFixture({
        ...base,
        game: makeGame({ state: 'ENDED', latestRevision: { id: 'rev', state: 'VOID', entryMethod: 'quick', score: { home: 3, away: 0 } } }),
      }),
    );
    expect(screen.getByText('무효 처리됨')).toBeInTheDocument();
    expect(screen.queryByLabelText('어드민 빠른 입력')).not.toBeInTheDocument();
    expect(screen.queryByText('3')).not.toBeInTheDocument();
  });

  it('머리 버튼은 선택 상태를 aria-pressed 로 알린다', () => {
    renderNode(base, { selected: true });
    expect(screen.getByRole('button', { name: '8강 1번 경기 열기' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('선택한 칸은 2px 색 테두리 없이 1px 테두리 + 옅은 배경', () => {
    renderNode(base, { selected: true });
    const group = document.querySelector('[data-fixture-id="f1"]') as HTMLElement;
    expect(group.style.border).toBe('1px solid var(--blue500)');
    expect(group.style.background).toBe('var(--blue50)');
    cleanup();
    renderNode(base, { selected: false });
    const idle = document.querySelector('[data-fixture-id="f1"]') as HTMLElement;
    expect(idle.style.border).toBe('1px solid var(--border-strong)');
    expect(idle.style.background).toBe('');
  });

  it('필터에 해당하지 않는 칸(filterMatch=false)은 옅은 지면·연한 테두리로 가라앉되 불투명도·글자색은 건드리지 않는다', () => {
    const props = renderNode(base, { filterMatch: false });
    const group = document.querySelector('[data-fixture-id="f1"]') as HTMLElement;
    expect(group).toHaveAttribute('data-filter-match', 'false');
    expect(group.style.background).toBe('var(--surface-soft)');
    expect(group.style.border).toBe('1px solid var(--border)');
    // 글자 대비를 해치지 않는다: 불투명도·필터 없이 보조 글자 토큰을 올리는 표시 클래스만 쓴다.
    expect(group.className).not.toMatch(/opacity-/);
    expect(group.style.opacity).toBe('');
    expect(group.style.filter).toBe('');
    expect(group).toHaveClass('tm-on-tint');
    expect(screen.getByText('8강 1번 경기')).toHaveStyle({ color: 'var(--text-strong)' });
    expect(screen.getByRole('group', { name: '8강 1번 경기, 예정' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '8강 1번 경기 열기' }));
    expect(props.onSelect).toHaveBeenCalledWith('f1');
  });

  it('푸터의 시간·구장 버튼은 푸터 줄 높이와 남는 폭을 모두 채워 누를 자리가 줄 전체다', () => {
    renderNode(base);
    const footer = screen.getByRole('button', { name: /^시간 미정 · 구장 미정$/ });
    expect(footer).toHaveClass('h-full', 'flex-1', 'min-w-0', 'truncate');
  });

  it('필터에 해당하는 칸(filterMatch=true)은 푸터 글자를 굵고 진하게 해 색만이 아니라 글자로 눈에 띈다', () => {
    renderNode(base, { filterMatch: true });
    const group = document.querySelector('[data-fixture-id="f1"]') as HTMLElement;
    expect(group).toHaveAttribute('data-filter-match', 'true');
    expect(group.style.background).toBe('');
    const footer = screen.getByRole('button', { name: /^시간 미정 · 구장 미정$/ });
    expect(footer).toHaveClass('font-semibold');
    expect(footer).toHaveStyle({ color: 'var(--text-strong)' });
  });

  it('필터가 없으면(filterMatch 생략) 표시도 없고 푸터도 그대로다(대조군)', () => {
    renderNode(base);
    const group = document.querySelector('[data-fixture-id="f1"]') as HTMLElement;
    expect(group).not.toHaveAttribute('data-filter-match');
    expect(group.style.background).toBe('');
    expect(screen.getByRole('button', { name: /^시간 미정 · 구장 미정$/ })).not.toHaveClass('font-semibold');
  });

  it('선택한 칸은 필터에 해당하지 않아도 선택 표시(파란 1px 테두리 + 옅은 파랑)가 이긴다', () => {
    renderNode(base, { selected: true, filterMatch: false });
    const group = document.querySelector('[data-fixture-id="f1"]') as HTMLElement;
    expect(group.style.border).toBe('1px solid var(--blue500)');
    expect(group.style.background).toBe('var(--blue50)');
  });

  it('칸 줄 이름은 홈·원정', () => {
    renderNode(base);
    expect(screen.getByRole('button', { name: /^홈 / })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^원정 / })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^어웨이 / })).toBeNull();
  });
});

describe('BracketCanvasNode — 눌러서 배정', () => {
  it('고른 팀이 없으면 줄을 눌러도 배정하지 않고 칸을 연다', () => {
    const props = renderNode(base);
    fireEvent.click(screen.getByRole('button', { name: '홈 1번 자리' }));
    expect(props.onSelect).toHaveBeenCalledWith('f1');
    expect(props.onAssign).not.toHaveBeenCalled();
  });

  it('고른 팀이 있으면 누른 줄의 자리에 배정한다', () => {
    const props = renderNode(base, { pendingRegistrationId: 'reg-9' });
    fireEvent.click(screen.getByRole('button', { name: '원정 2번 자리, 선택한 팀을 여기에 넣어요' }));
    expect(props.onAssign).toHaveBeenCalledWith('s-away', 'reg-9');
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it.each([
    ['경기가 시작된 칸', makeFixture({ ...base, game: makeGame({ state: 'LIVE' }) }), {}],
    ['읽기 전용 화면', base, { canWrite: false }],
    ['순위 자리', base, { slots: { HOME: makeSlot({ id: 's-home', kind: 'GROUP_RANK', label: 'A조 1위' }), AWAY: null } }],
    [
      '자리가 없고 이전 경기 연결선으로 채워지는 줄',
      makeFixture({ ...base, homeSlotId: null, awaySlotId: null, bracketSources: [{ fixtureId: 'f0', outcome: 'WINNER', side: 'HOME' }] }),
      { slots: { HOME: null, AWAY: null } },
    ],
  ] as const)('%s 에서는 고른 팀이 있어도 배정하지 않고 칸을 연다', (_name, fixture, overrides) => {
    const props = renderNode(fixture, { pendingRegistrationId: 'reg-9', ...overrides });
    fireEvent.click(screen.getByRole('button', { name: '홈 1번 자리' }));
    expect(props.onAssign).not.toHaveBeenCalled();
    expect(props.onSelect).toHaveBeenCalledWith('f1');
  });
});

describe('BracketCanvasNode — 끌어 놓기', () => {
  const dropOn = (side: 'HOME' | 'AWAY', registrationId: string) => {
    const row = document.querySelector(`[data-side="${side}"]`)!;
    fireEvent.drop(row, { dataTransfer: { getData: (type: string) => (type === REGISTRATION_DRAG_MIME ? registrationId : '') } });
  };

  it('배정 가능한 줄에 놓으면 그 자리에 배정한다', () => {
    const props = renderNode(base);
    dropOn('HOME', 'reg-7');
    expect(props.onAssign).toHaveBeenCalledWith('s-home', 'reg-7');
  });

  it('시작된 칸에서는 놓아도 배정하지 않는다', () => {
    const live = renderNode(makeFixture({ ...base, game: makeGame({ state: 'LIVE' }) }));
    dropOn('HOME', 'reg-7');
    expect(live.onAssign).not.toHaveBeenCalled();
  });

  it('우리 앱이 심은 데이터가 아니면(다른 곳에서 끌어온 것) 무시한다', () => {
    const props = renderNode(base);
    const row = document.querySelector('[data-side="HOME"]')!;
    fireEvent.drop(row, { dataTransfer: { getData: () => '' } });
    expect(props.onAssign).not.toHaveBeenCalled();
  });
});

describe('BracketCanvasNode — 자리 없는 줄(경기에 팀을 직접 지정)', () => {
  const slotless = makeFixture({
    ...base,
    homeSlotId: null,
    awaySlotId: null,
    bracketSources: [{ fixtureId: 'f0', outcome: 'WINNER', side: 'AWAY' }],
  });
  const noSlots = { slots: { HOME: null, AWAY: null } };

  it('직접 지정 줄을 누르면 onAssignDirect 로 보내고 onAssign 은 부르지 않는다', () => {
    const props = renderNode(slotless, { pendingRegistrationId: 'reg-9', ...noSlots });
    fireEvent.click(screen.getByRole('button', { name: '홈 1번 자리, 선택한 팀을 여기에 넣어요' }));
    expect(props.onAssignDirect).toHaveBeenCalledWith('f1', 'HOME', 'reg-9');
    expect(props.onAssign).not.toHaveBeenCalled();
  });

  it('이전 경기로 채워지는 줄은 같은 상황에서도 배정하지 않고 칸을 연다', () => {
    const props = renderNode(slotless, { pendingRegistrationId: 'reg-9', ...noSlots });
    fireEvent.click(screen.getByRole('button', { name: '원정 2번 자리' }));
    expect(props.onAssignDirect).not.toHaveBeenCalled();
    expect(props.onSelect).toHaveBeenCalledWith('f1');
  });

  it('직접 지정 줄에 팀을 끌어 놓으면 onAssignDirect 로 보낸다', () => {
    const props = renderNode(slotless, noSlots);
    const row = document.querySelector('[data-side="HOME"]')!;
    fireEvent.drop(row, { dataTransfer: { getData: (type: string) => (type === REGISTRATION_DRAG_MIME ? 'reg-7' : '') } });
    expect(props.onAssignDirect).toHaveBeenCalledWith('f1', 'HOME', 'reg-7');
    expect(props.onAssign).not.toHaveBeenCalled();
  });

  it('시작된 칸이나 읽기 전용에서는 직접 지정 줄도 배정하지 않는다', () => {
    const live = renderNode(makeFixture({ ...slotless, game: makeGame({ state: 'LIVE' }) }), { pendingRegistrationId: 'reg-9', ...noSlots });
    fireEvent.click(screen.getByRole('button', { name: '홈 1번 자리' }));
    expect(live.onAssignDirect).not.toHaveBeenCalled();
    cleanup();
    const readOnly = renderNode(slotless, { pendingRegistrationId: 'reg-9', canWrite: false, ...noSlots });
    fireEvent.click(screen.getByRole('button', { name: '홈 1번 자리' }));
    expect(readOnly.onAssignDirect).not.toHaveBeenCalled();
  });
});

describe('BracketCanvasNode — 흐름 배치(position 없음)', () => {
  const flowFixture = makeFixture({ id: 'f1', groupId: 'gA', fixtureNumber: 3, round: 'league_r1' });
  const flowBase = {
    fixture: flowFixture,
    title: '3번 경기',
    fullTitle: 'A조 · 조별리그 1라운드 3번 경기',
    sideLabels: { HOME: '송파', AWAY: '마포' },
    slots: { HOME: null, AWAY: null },
    selected: false,
    canWrite: true,
    pendingRegistrationId: null,
    onSelect: vi.fn(),
    onAssign: vi.fn(),
    onAssignDirect: vi.fn(),
  };

  it('좌표 없이 부모 칸을 채우고 보이는 제목은 짧지만 접근 이름은 조·라운드를 포함한다', () => {
    render(<BracketCanvasNode {...flowBase} />);
    const group = screen.getByRole('group', { name: 'A조 · 조별리그 1라운드 3번 경기, 예정' });
    expect(group.style.position).not.toBe('absolute');
    expect(group.style.left).toBe('');
    expect(group.style.width).toBe('100%');
    expect(within(group).getByText('3번 경기')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'A조 · 조별리그 1라운드 3번 경기 열기' })).toBeInTheDocument();
    cleanup();
  });

  it('선택·직접 배정 콜백은 캔버스 칸과 같은 인자로 불린다', () => {
    const onSelect = vi.fn();
    const onAssignDirect = vi.fn();
    render(<BracketCanvasNode {...flowBase} pendingRegistrationId="r9" onSelect={onSelect} onAssignDirect={onAssignDirect} />);
    fireEvent.click(screen.getByRole('button', { name: /^홈 송파, 선택한 팀을 여기에 넣어요/ }));
    expect(onAssignDirect).toHaveBeenCalledWith('f1', 'HOME', 'r9');
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'A조 · 조별리그 1라운드 3번 경기 열기' }));
    expect(onSelect).toHaveBeenCalledWith('f1');
    cleanup();
  });
});


it('그림 카드에 시간·구장을 표시하고 눌러 경기를 열며 배정된 부전승 시드 문구는 숨긴다', () => {
  const props = renderNode(makeFixture({ ...base, venue: 'A경기장', homeRegistrationId: 'r1', homeTeamName: '확정팀' }), {
    sideLabels: { HOME: '확정팀', AWAY: '2번 자리' },
    slots: { HOME: makeSlot({ id: 's-home', kind: 'BYE', label: '3번 시드', registrationId: 'r1' }), AWAY: null },
  });
  expect(screen.getByText('확정팀')).toBeInTheDocument();
  expect(screen.queryByText('3번 시드')).not.toBeInTheDocument();
  const schedule = screen.getByRole('button', { name: '시간 미정 · A경기장' });
  expect(schedule).toHaveAttribute('title', '시간 미정 · A경기장');
  fireEvent.click(schedule);
  expect(props.onSelect).toHaveBeenCalledWith('f1');
  expect(document.querySelector('[data-side=HOME]')).toHaveStyle({ background: 'var(--blue50)' });
});
