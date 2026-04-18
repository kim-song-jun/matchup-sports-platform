import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DisputeMessageThread, type DisputeMessage } from './dispute-message-thread';

const BASE_DATE = '2026-04-18T10:00:00.000Z';

function makeMsg(overrides: Partial<DisputeMessage> & Pick<DisputeMessage, 'id'>): DisputeMessage {
  return {
    senderId: 'user-1',
    senderName: '홍길동',
    senderRole: 'buyer',
    content: '테스트 메시지',
    createdAt: BASE_DATE,
    ...overrides,
  };
}

describe('DisputeMessageThread', () => {
  it('shows empty state when messages is empty', () => {
    render(<DisputeMessageThread messages={[]} currentUserId="user-1" />);
    expect(screen.getByText('아직 메시지가 없어요')).toBeInTheDocument();
  });

  it('renders system messages with SystemMessage style (no bubble)', () => {
    const messages: DisputeMessage[] = [
      makeMsg({ id: 's1', senderId: null, senderName: null, senderRole: 'system', content: '분쟁이 접수되었습니다' }),
    ];
    render(<DisputeMessageThread messages={messages} currentUserId="user-1" />);
    expect(screen.getByText('분쟁이 접수되었습니다')).toBeInTheDocument();
  });

  it('renders admin messages with 운영자 badge on first in group', () => {
    const messages: DisputeMessage[] = [
      makeMsg({ id: 'a1', senderId: 'admin-1', senderName: '운영팀', senderRole: 'admin', content: '내용을 확인하겠습니다' }),
    ];
    render(<DisputeMessageThread messages={messages} currentUserId="user-1" />);
    expect(screen.getByText('운영자')).toBeInTheDocument();
    expect(screen.getByText('내용을 확인하겠습니다')).toBeInTheDocument();
  });

  it('renders buyer and seller messages as chat bubbles', () => {
    const messages: DisputeMessage[] = [
      makeMsg({ id: 'm1', senderId: 'user-1', senderName: '구매자', senderRole: 'buyer', content: '배송이 안 왔어요' }),
      makeMsg({ id: 'm2', senderId: 'user-2', senderName: '판매자', senderRole: 'seller', content: '확인해볼게요' }),
    ];
    render(<DisputeMessageThread messages={messages} currentUserId="user-1" />);
    expect(screen.getByText('배송이 안 왔어요')).toBeInTheDocument();
    expect(screen.getByText('확인해볼게요')).toBeInTheDocument();
  });

  it('inserts a date separator between different-day messages', () => {
    const messages: DisputeMessage[] = [
      makeMsg({ id: 'm1', senderId: 'user-1', senderRole: 'buyer', content: '첫째 날', createdAt: '2026-04-17T10:00:00.000Z' }),
      makeMsg({ id: 'm2', senderId: 'user-1', senderRole: 'buyer', content: '둘째 날', createdAt: '2026-04-18T10:00:00.000Z' }),
    ];
    render(<DisputeMessageThread messages={messages} currentUserId="user-1" />);
    // Two date separators should be rendered (one per day)
    expect(screen.getByText('첫째 날')).toBeInTheDocument();
    expect(screen.getByText('둘째 날')).toBeInTheDocument();
  });
});
