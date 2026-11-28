import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TeamFoulPublicSwitch } from './team-foul-public-switch';

describe('TeamFoulPublicSwitch — 관전 화면 팀 파울 표시 스위치', () => {
  it('켜짐/꺼짐에 맞는 안내를 보여 주고, 누르면 바뀐 값을 알린다', () => {
    const onChange = vi.fn();
    const { rerender } = render(<TeamFoulPublicSwitch checked onChange={onChange} />);
    const toggle = screen.getByRole('switch', { name: '관전 화면에 팀 파울 보여주기' });
    expect(toggle).toBeChecked();
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/경기가 진행되는 동안.*팀 파울 바가 보여요/)).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(false);

    rerender(<TeamFoulPublicSwitch checked={false} onChange={onChange} />);
    expect(screen.getByRole('switch', { name: '관전 화면에 팀 파울 보여주기' })).not.toBeChecked();
    expect(screen.getByText(/관전 화면에는 팀 파울이 보이지 않아요.*운영 화면의 팀 파울과 경고는 그대로예요/)).toBeInTheDocument();
  });

  it('안내 문구가 스위치의 설명(aria-describedby)으로 이어진다', () => {
    render(<TeamFoulPublicSwitch checked onChange={vi.fn()} />);
    const toggle = screen.getByRole('switch', { name: '관전 화면에 팀 파울 보여주기' });
    const describedBy = toggle.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)).toHaveTextContent('팀 파울 바가 보여요');
  });

  it('저장 중에는 누를 수 없다', () => {
    render(<TeamFoulPublicSwitch checked onChange={vi.fn()} disabled />);
    expect(screen.getByRole('switch', { name: '관전 화면에 팀 파울 보여주기' })).toBeDisabled();
  });
});
