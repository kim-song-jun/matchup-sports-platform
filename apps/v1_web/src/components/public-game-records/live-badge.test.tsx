import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LiveBadge } from './live-badge';

describe('LiveBadge', () => {
  it('피리어드가 진행 중이면 피리어드 라벨과 경과 시간을 보여준다', () => {
    render(<LiveBadge clock={{ periodNumber: 1, elapsedMs: 125_000, isPaused: false }} periodBreak={null} />);
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByText('전반 2:05')).toBeInTheDocument();
  });

  it('clock이 null이고 하프타임이면 "하프타임"을 보여주고 일반 LIVE 텍스트와 구분된다', () => {
    render(<LiveBadge clock={null} periodBreak="halftime" />);
    expect(screen.getByText('하프타임')).toBeInTheDocument();
    expect(screen.queryByText('LIVE')).not.toBeInTheDocument();
  });

  it('clock이 null이고 정규 시간 종료면 "정규 시간 종료"를 보여준다 (하프타임과 다른 문구)', () => {
    render(<LiveBadge clock={null} periodBreak="regulation_ended" />);
    expect(screen.getByText('정규 시간 종료')).toBeInTheDocument();
    expect(screen.queryByText('하프타임')).not.toBeInTheDocument();
  });

  it('clock과 periodBreak이 둘 다 null이면(예: status_only) 기존처럼 일반 LIVE만 보여준다', () => {
    render(<LiveBadge clock={null} periodBreak={null} />);
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByLabelText('진행 중')).toBeInTheDocument();
  });

  it('단판이면 시간 앞의 피리어드명과 aria-label 의 피리어드명이 빠진다', () => {
    const clock = { periodNumber: 1, elapsedMs: 125_000, isPaused: false };
    const { rerender } = render(<LiveBadge clock={clock} periodBreak={null} periodCount={1} />);
    expect(screen.getByText('2:05')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', '진행 중, 2:05');

    rerender(<LiveBadge clock={clock} periodBreak={null} periodCount={2} />);
    expect(screen.getByText('전반 2:05')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', '진행 중, 전반 2:05');
  });
});
