import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TeamChatFab, TeamFeeTab } from './team-detail-member-tabs';

describe('소속 회원 팀 상세 탭 부품', () => {
  it('팀 채팅 동그란 버튼은 이름으로 읽히고 누르면 채팅을 연다', async () => {
    const onClick = vi.fn();
    render(<TeamChatFab onClick={onClick} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '팀 채팅' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('채팅방을 여는 중에는 다시 누를 수 없고 그 상태를 읽어 준다', () => {
    render(<TeamChatFab onClick={vi.fn()} pending />);
    const button = screen.getByRole('button', { name: '팀 채팅 여는 중' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it.each([
    [30000, '30,000원'],
    [0, '회비가 없어요'],
    [null, '정하지 않았어요'],
  ])('회비 탭은 월 회비 %s 를 %s 로 보인다', (fee, label) => {
    render(<TeamFeeTab fee={fee} />);
    expect(screen.getByText('월 회비')).toBeInTheDocument();
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '회비 금액 바꾸기' })).toBeNull();
  });

  it('운영진에게만 회비 금액을 바꾸러 가는 링크가 붙는다', () => {
    render(<TeamFeeTab fee={30000} editHref="/teams/team-1/edit?from=%2Fteams%2Fteam-1" />);
    expect(screen.getByRole('link', { name: '회비 금액 바꾸기' })).toHaveAttribute('href', '/teams/team-1/edit?from=%2Fteams%2Fteam-1');
  });
});
