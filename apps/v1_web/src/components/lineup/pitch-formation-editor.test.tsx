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
