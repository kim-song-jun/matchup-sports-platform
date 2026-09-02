import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1ChatRoomTeamContact } from '@/types/api';
import { TeamContactStatusCard, formatExpiresIn } from './team-contact-status-card';

const mutations = vi.hoisted(() => ({
  accept: vi.fn(),
  decline: vi.fn(),
  withdraw: vi.fn(),
  block: vi.fn(),
  inquiry: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  useV1AcceptTeamContact: () => ({ mutate: mutations.accept, isPending: false }),
  useV1DeclineTeamContact: () => ({ mutate: mutations.decline, isPending: false }),
  useV1WithdrawTeamContact: () => ({ mutate: mutations.withdraw, isPending: false }),
  useV1CreateTeamContactBlock: () => ({ mutate: mutations.block, isPending: false }),
  useV1CreateInquiry: () => ({ mutate: mutations.inquiry, isPending: false }),
}));

function contact(overrides: Partial<V1ChatRoomTeamContact> = {}): V1ChatRoomTeamContact {
  return {
    contactId: 'contact-1',
    status: 'requested',
    expiresAt: new Date(Date.now() + 2 * 86400000).toISOString(),
    declineReason: null,
    mySide: 'to',
    fromTeam: { id: 'team-a', name: '가팀' },
    toTeam: { id: 'team-b', name: '나팀' },
    ...overrides,
  };
}

function renderCard(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('TeamContactStatusCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('받는 팀 운영진: 수락 클릭 → accept mutate', () => {
    renderCard(<TeamContactStatusCard contact={contact()} />);
    fireEvent.click(screen.getByRole('button', { name: '수락' }));
    expect(mutations.accept).toHaveBeenCalledTimes(1);
  });

  it('받는 팀 운영진: 거절은 사유 입력을 거쳐 reason 을 넘긴다', () => {
    renderCard(<TeamContactStatusCard contact={contact()} />);
    fireEvent.click(screen.getByRole('button', { name: '거절' }));
    fireEvent.change(screen.getByRole('textbox', { name: /거절 사유/ }), { target: { value: '  이번 주는 어려워요 ' } });
    fireEvent.click(screen.getByRole('button', { name: '거절하기' }));
    expect(mutations.decline).toHaveBeenCalledWith({ reason: '이번 주는 어려워요' }, expect.any(Object));
  });

  it('보낸 팀 운영진: 철회 버튼만 보이고 클릭 시 withdraw mutate', () => {
    renderCard(<TeamContactStatusCard contact={contact({ mySide: 'from' })} />);
    expect(screen.queryByRole('button', { name: '수락' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '컨택 철회' }));
    expect(mutations.withdraw).toHaveBeenCalledTimes(1);
    // 상대 팀은 받는 팀(나팀)이고 링크는 그 팀 상세로 간다
    expect(screen.getByRole('link', { name: '나팀' })).toHaveAttribute('href', '/teams/team-b');
  });

  it('수락된 컨택: 액션 없음, 배지 "수락됨", 만료 안내 없음', () => {
    renderCard(<TeamContactStatusCard contact={contact({ status: 'accepted' })} />);
    expect(screen.getByText('수락됨')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '수락' })).not.toBeInTheDocument();
    expect(screen.queryByText(/만료돼요/)).not.toBeInTheDocument();
  });

  it('요청 중이면 만료 카운트다운이 보인다', () => {
    renderCard(<TeamContactStatusCard contact={contact()} />);
    expect(screen.getByText(/후 만료돼요/)).toBeInTheDocument();
  });

  it('신고하기 → 다이얼로그 → 사유 선택 후 접수하면 team_contact 신고 문의를 만든다', () => {
    renderCard(<TeamContactStatusCard contact={contact({ status: 'declined', declineReason: '사유' })} />);
    fireEvent.click(screen.getByRole('button', { name: '신고하기' }));
    expect(screen.getByRole('dialog', { name: '컨택 신고하기' })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('radio')[0]);
    fireEvent.click(screen.getByRole('button', { name: '신고 접수' }));
    expect(mutations.inquiry).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'report', relatedType: 'team_contact', relatedId: 'contact-1' }),
      expect.any(Object),
    );
  });

  it('차단은 2단계 확인을 거쳐 상대 팀 id 로 요청한다', () => {
    renderCard(<TeamContactStatusCard contact={contact()} />);
    fireEvent.click(screen.getByRole('button', { name: '차단하기' }));
    expect(screen.getByRole('group', { name: '팀 차단 확인' })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: '차단하기' }).at(-1)!);
    expect(mutations.block).toHaveBeenCalledWith({ blockedTeamId: 'team-a' }, expect.any(Object));
  });
});

describe('formatExpiresIn', () => {
  it('하루 이상 남으면 일 단위로 접고 내림한다', () => {
    const sixDays23h = new Date(Date.now() + (6 * 24 + 23) * 3600000 + 30 * 60000).toISOString();
    expect(formatExpiresIn(sixDays23h)).toBe('6일 23시간 후 만료돼요');
  });

  it('이미 지났으면 곧 만료 문구', () => {
    expect(formatExpiresIn(new Date(Date.now() - 1000).toISOString())).toBe('곧 만료돼요');
  });
});
