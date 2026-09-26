import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LoadLineupSheet } from './load-lineup-sheet';

const baseProps = {
  open: true,
  onClose: vi.fn(),
  history: [],
  presets: [],
  currentSportName: '풋살',
  onSelect: vi.fn(),
};

describe('LoadLineupSheet terminology', () => {
  it('keeps the shared tournament and league default copy as 라인업', () => {
    render(<LoadLineupSheet {...baseProps} />);
    expect(screen.getByText('이전 라인업 불러오기')).toBeInTheDocument();
    expect(screen.getByText('아직 저장된 라인업이 없어요')).toBeInTheDocument();
  });

  it('uses 참석명단 only when the team-match caller opts in', () => {
    render(<LoadLineupSheet {...baseProps} subjectLabel="참석명단" />);
    expect(screen.getByText('이전 참석명단 불러오기')).toBeInTheDocument();
    expect(screen.getByText('아직 저장된 참석명단이 없어요')).toBeInTheDocument();
  });
});
