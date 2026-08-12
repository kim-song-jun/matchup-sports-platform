import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LineupEntryDraft } from '@/app/team-matches/[id]/lineup/lineup.view-model';
import { slotsWithGoalkeeper, type FormationPreset } from './formation-slots';
import { PitchFormationEditor } from './pitch-formation-editor';

function makeEntry(overrides: Partial<LineupEntryDraft> & { key: string }): LineupEntryDraft {
  return {
    userId: null, displayName: '홍길동', jerseyNumber: 1, goalkeeper: false,
    position: null, positionX: null, positionY: null, ...overrides,
  };
}

const preset: FormationPreset = {
  code: '2-2', label: '박스', outfield: 4,
  slots: [
    { positionCode: 'FIXO', label: '픽소', x: 33, y: 43 },
    { positionCode: 'FIXO', label: '픽소', x: 67, y: 43 },
    { positionCode: 'PIVO', label: '피보', x: 33, y: 67 },
    { positionCode: 'PIVO', label: '피보', x: 67, y: 67 },
  ],
};

const baseProps = {
  formation: '2-2', formationOptions: [preset], outfieldGuidance: null, editable: true,
  onSelectFormation: vi.fn(), onPlacePlayer: vi.fn(), onUnplacePlayer: vi.fn(),
  onPlaceInSlot: vi.fn(), onUnplaceFromSlot: vi.fn(),
};

describe('PitchFormationEditor — slot mode', () => {
  it('renders every unfilled slot (GK + FIXO×2 + PIVO×2 = 5) as an accessible empty-slot button', () => {
    render(<PitchFormationEditor {...baseProps} starters={[makeEntry({ key: 'w1', displayName: '대기선수' })]} slots={slotsWithGoalkeeper(preset)} />);
    expect(screen.getAllByRole('button', { name: /자리, 비어 있음/ })).toHaveLength(5);
  });

  it('tapping an empty FIXO slot opens a picker; choosing a waiting player commits onPlaceInSlot with that exact slot', () => {
    const onPlaceInSlot = vi.fn();
    render(
      <PitchFormationEditor {...baseProps} starters={[makeEntry({ key: 'w1', displayName: '대기선수' })]}
        slots={slotsWithGoalkeeper(preset)} onPlaceInSlot={onPlaceInSlot} />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: /픽소 자리, 비어 있음/ })[0]);
    fireEvent.click(screen.getByRole('button', { name: /대기선수/ }));
    expect(onPlaceInSlot).toHaveBeenCalledWith('w1', expect.objectContaining({ positionCode: 'FIXO', x: 33, y: 43 }));
  });

  it('a filled slot renders the player token, and its unplace button calls onUnplaceFromSlot — not the free-mode handler', () => {
    const onUnplaceFromSlot = vi.fn();
    const onUnplacePlayer = vi.fn();
    render(
      <PitchFormationEditor {...baseProps}
        starters={[makeEntry({ key: 'p1', displayName: '픽소선수', position: 'FIXO', positionX: 33, positionY: 43 })]}
        slots={slotsWithGoalkeeper(preset)} onUnplaceFromSlot={onUnplaceFromSlot} onUnplacePlayer={onUnplacePlayer} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /픽소선수 배치 취소/ }));
    expect(onUnplaceFromSlot).toHaveBeenCalledWith('p1');
    expect(onUnplacePlayer).not.toHaveBeenCalled();
  });

  it('shows outfieldGuidance instead of hiding the formation section when no preset fits the headcount, and still offers 자유 배치', () => {
    render(
      <PitchFormationEditor {...baseProps} starters={[]} formation={null} formationOptions={[]} slots={null}
        outfieldGuidance="현재 선발 3명 — 이 인원수에 맞는 정해진 포지션 대형이 없어요. 자유 배치를 사용해 주세요." />,
    );
    expect(screen.getByText(/이 인원수에 맞는 정해진 포지션 대형이 없어요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '자유 배치' })).toBeInTheDocument();
  });

  it('free mode (slots=null) keeps the pre-existing tap-to-place guidance copy unchanged', () => {
    render(<PitchFormationEditor {...baseProps} starters={[makeEntry({ key: 'w1', displayName: '대기선수' })]} formation={null} slots={null} />);
    expect(screen.getByText('선수를 드래그하거나, 아래 목록에서 선수를 고른 뒤 피치를 탭해 배치하세요')).toBeInTheDocument();
  });
});

/**
 * 포메이션 전환 확인 관문. 사용자 제보("하나 설정하고 포메이션 바꾸면 그것도 사라진다")에
 * 대해 선택된 정책은 "전환 전 확인 모달"이다 — 배치가 실제로 움직일 때만 묻고, 확인하기
 * 전에는 절대 상태를 바꾸지 않아야 한다.
 */
describe('PitchFormationEditor — 포메이션 전환 확인', () => {
  /** 2-2와 슬롯 좌표가 완전히 다른 프리셋 — 전환하면 배치된 선수가 반드시 움직인다. */
  const diamond: FormationPreset = {
    code: '1-2-1', label: '다이아몬드', outfield: 4,
    slots: [
      { positionCode: 'FIXO', label: '픽소', x: 50, y: 35 },
      { positionCode: 'ALA', label: '아라', x: 20, y: 58 },
      { positionCode: 'ALA', label: '아라', x: 80, y: 58 },
      { positionCode: 'PIVO', label: '피보', x: 50, y: 83 },
    ],
  };
  /** 필드 자리가 2개뿐 — 4명을 배치한 상태에서 고르면 2명이 대기로 내려간다. */
  const tiny: FormationPreset = {
    code: '1-1', label: '미니', outfield: 2,
    slots: [
      { positionCode: 'FIXO', label: '픽소', x: 50, y: 40 },
      { positionCode: 'PIVO', label: '피보', x: 50, y: 80 },
    ],
  };

  /** 2-2 좌표에 정확히 맞춰 배치된 선발 5명(GK 포함). */
  function placedIn2v2(): LineupEntryDraft[] {
    return [
      makeEntry({ key: 'gk', displayName: '김골키', goalkeeper: true, positionX: 50, positionY: 6 }),
      makeEntry({ key: 'f1', displayName: '픽소일', position: 'FIXO', positionX: 33, positionY: 43 }),
      makeEntry({ key: 'f2', displayName: '픽소이', position: 'FIXO', positionX: 67, positionY: 43 }),
      makeEntry({ key: 'p1', displayName: '피보일', position: 'PIVO', positionX: 33, positionY: 67 }),
      makeEntry({ key: 'p2', displayName: '피보이', position: 'PIVO', positionX: 67, positionY: 67 }),
    ];
  }

  it('배치된 선수가 움직여야 하면 확인 모달을 먼저 띄우고 상태는 아직 바꾸지 않는다', () => {
    const onSelectFormation = vi.fn();
    render(
      <PitchFormationEditor {...baseProps} starters={placedIn2v2()} slots={slotsWithGoalkeeper(preset)}
        formationOptions={[preset, diamond]} onSelectFormation={onSelectFormation} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /1-2-1/ }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // 확인 전에는 절대 적용되지 않아야 한다 — 이게 "확인 모달" 정책의 핵심.
    expect(onSelectFormation).not.toHaveBeenCalled();
  });

  it('확인을 누르면 그 프리셋으로 적용된다', () => {
    const onSelectFormation = vi.fn();
    render(
      <PitchFormationEditor {...baseProps} starters={placedIn2v2()} slots={slotsWithGoalkeeper(preset)}
        formationOptions={[preset, diamond]} onSelectFormation={onSelectFormation} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /1-2-1/ }));
    fireEvent.click(screen.getByRole('button', { name: '포메이션 바꾸기' }));

    expect(onSelectFormation).toHaveBeenCalledWith('1-2-1');
  });

  it('취소를 누르면 아무것도 바뀌지 않고 모달이 닫힌다', () => {
    const onSelectFormation = vi.fn();
    render(
      <PitchFormationEditor {...baseProps} starters={placedIn2v2()} slots={slotsWithGoalkeeper(preset)}
        formationOptions={[preset, diamond]} onSelectFormation={onSelectFormation} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /1-2-1/ }));
    fireEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(onSelectFormation).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('자리가 줄어들면 대기로 내려가는 선수 이름을 모달에 밝힌다', () => {
    render(
      <PitchFormationEditor {...baseProps} starters={placedIn2v2()} slots={slotsWithGoalkeeper(preset)}
        formationOptions={[preset, tiny]} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /1-1/ }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/대기로 내려가요/)).toBeInTheDocument();
  });

  it('배치된 선수가 없으면 묻지 않고 곧바로 적용한다 — 프리셋을 훑어보는 동작을 막지 않는다', () => {
    const onSelectFormation = vi.fn();
    render(
      <PitchFormationEditor {...baseProps} starters={[makeEntry({ key: 'w1', displayName: '대기선수' })]}
        slots={slotsWithGoalkeeper(preset)} formationOptions={[preset, diamond]} onSelectFormation={onSelectFormation} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /1-2-1/ }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onSelectFormation).toHaveBeenCalledWith('1-2-1');
  });

  it('자유 배치로 돌아갈 때는 좌표가 그대로 남으므로 묻지 않는다', () => {
    const onSelectFormation = vi.fn();
    render(
      <PitchFormationEditor {...baseProps} starters={placedIn2v2()} slots={slotsWithGoalkeeper(preset)}
        formationOptions={[preset, diamond]} onSelectFormation={onSelectFormation} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '자유 배치' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onSelectFormation).toHaveBeenCalledWith(null);
  });
});
