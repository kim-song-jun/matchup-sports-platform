import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TeamMatchRulesFields } from './team-match-rules-fields';
import type { TeamMatchRulesControl } from './team-matches.types';

const rules = (extra: Partial<TeamMatchRulesControl> = {}): TeamMatchRulesControl => ({
  periods: [{ durationMinutes: 20 }, { durationMinutes: 20 }],
  onChange: vi.fn(),
  ...extra,
});

describe('TeamMatchRulesFields — 팀 파울 기준(선택)', () => {
  it('값을 비워 두면 "비우면 5개" 안내가 보이고, 입력하면 바뀐 값을 알린다', () => {
    const onChange = vi.fn();
    render(<TeamMatchRulesFields rules={rules({ teamFoulThreshold: { value: '', onChange } })} />);

    const input = screen.getByLabelText('팀 파울 기준');
    expect(input).toHaveValue(null);
    expect(input).toHaveAttribute('placeholder', '비우면 5개');
    expect(screen.getByText(/비우면 5개예요/)).toBeInTheDocument();

    fireEvent.change(input, { target: { value: '8' } });
    expect(onChange).toHaveBeenCalledWith('8');
  });

  it('입력한 값을 채워 보여 주고, 범위 밖이면 이유를 보여 준다', () => {
    render(<TeamMatchRulesFields rules={rules({ teamFoulThreshold: { value: '21', error: '1부터 20 사이로 입력해 주세요', onChange: vi.fn() } })} />);
    expect(screen.getByLabelText('팀 파울 기준')).toHaveValue(21);
    expect(screen.getByText('1부터 20 사이로 입력해 주세요')).toBeInTheDocument();
  });

  it('규칙이 잠겨 있어도 팀 파울 기준은 따로 저장되는 값이라 입력할 수 있다', () => {
    render(<TeamMatchRulesFields rules={rules({ lockedReason: '경기 규칙을 바꿀 수 없어요.', teamFoulThreshold: { value: '', onChange: vi.fn() } })} />);
    expect(screen.getByLabelText('팀 파울 기준')).toBeEnabled();
  });

  it('입력칸 정의가 없으면 그리지 않는다(옛 호출부 호환)', () => {
    render(<TeamMatchRulesFields rules={rules()} />);
    expect(screen.queryByLabelText('팀 파울 기준')).toBeNull();
  });
});
