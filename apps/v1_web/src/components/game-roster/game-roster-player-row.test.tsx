import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { gameRosterActorRoleLabel, gameRosterReasonLabel } from '@/lib/v1-status-labels';
import { GameRosterPlayerRow } from './game-roster-player-row';

const base = { jerseyNumber: 7, displayName: '박서준', accountLinked: true } as const;

describe('GameRosterPlayerRow', () => {
  it('빠짐은 사유를 글자로 잇고 누가 뺐는지 보여 준다', () => {
    render(<GameRosterPlayerRow {...base} status="EXCLUDED" reason="INJURY" actorRole="TEAM_MANAGER" />);
    expect(screen.getByText('빠짐 · 부상')).toHaveClass('tm-badge');
    expect(screen.getByText('팀장 처리')).toBeInTheDocument();
  });

  it('운영자가 넣은 결장은 "결장 · 사유" 와 운영자 표기', () => {
    render(<GameRosterPlayerRow {...base} status="UNAVAILABLE" reason="PERSONAL" actorRole="STAFF" />);
    expect(screen.getByText('결장 · 개인 사정')).toBeInTheDocument();
    expect(screen.getByText('운영자 처리')).toBeInTheDocument();
  });

  it('출전정지는 남은 경기 수와 자동 표기 — 서버의 설명 문장은 배지에 넣지 않는다', () => {
    render(
      <GameRosterPlayerRow {...base} status="SUSPENDED" reason="퇴장 1회으로 2경기 출전정지예요." remainingMatches={2} />,
    );
    expect(screen.getByText('출전정지 2경기')).toBeInTheDocument();
    expect(screen.getByText('자동 처리')).toBeInTheDocument();
    expect(screen.queryByText(/퇴장 1회/)).toBeNull();
  });

  it('출전은 사유·주체 없이, 계정 없는 폴백 팀원은 안내를 단다', () => {
    render(<GameRosterPlayerRow {...base} jerseyNumber={null} accountLinked={false} status="PARTICIPATING" reason="INJURY" />);
    expect(screen.getByText('출전')).toBeInTheDocument();
    expect(screen.getByText('계정 없이 기록돼요')).toBeInTheDocument();
    expect(screen.queryByText(/처리/)).toBeNull();
    expect(screen.getByText('없음')).toHaveClass('sr-only');
  });

  it('모르는 사유·역할 코드는 영문으로 새지 않는다', () => {
    render(<GameRosterPlayerRow {...base} status="EXCLUDED" reason="SOMETHING_NEW" actorRole="ROBOT" />);
    expect(screen.getByText('빠짐')).toBeInTheDocument();
    expect(screen.queryByText(/SOMETHING_NEW|ROBOT/)).toBeNull();
  });
});

describe('GameRosterPlayerRow — 등번호 칸', () => {
  it('누를 수 있게 하면 번호 칸이 버튼이 되고, 빈 칸은 "넣기"·찬 칸은 "바꾸기"로 읽힌다', () => {
    const onPress = vi.fn();
    const { rerender } = render(<GameRosterPlayerRow {...base} status="PARTICIPATING" onJerseyPress={onPress} />);
    const filled = screen.getByRole('button', { name: '박서준 등번호 7번 바꾸기' });
    expect(filled).toHaveTextContent('7');
    fireEvent.click(filled);
    expect(onPress).toHaveBeenCalledTimes(1);

    rerender(<GameRosterPlayerRow {...base} jerseyNumber={null} status="PARTICIPATING" onJerseyPress={onPress} />);
    fireEvent.click(screen.getByRole('button', { name: '박서준 등번호 넣기' }));
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it('0번도 채워진 번호다 — "넣기"로 바뀌지 않는다', () => {
    render(<GameRosterPlayerRow {...base} jerseyNumber={0} status="PARTICIPATING" onJerseyPress={() => {}} />);
    expect(screen.getByRole('button', { name: '박서준 등번호 0번 바꾸기' })).toHaveTextContent('0');
  });

  it('누를 수 없게 하면 번호는 글자일 뿐 버튼이 아니다', () => {
    render(<GameRosterPlayerRow {...base} status="PARTICIPATING" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('7')).toBeInTheDocument();
  });
});

describe('명단 라벨', () => {
  it('사유 4종과 역할을 한국어로, 되돌리기(역할 없음)는 null', () => {
    expect(['INJURY', 'PERSONAL', 'LATE_OR_EARLY', 'OTHER'].map(gameRosterReasonLabel)).toEqual([
      '부상',
      '개인 사정',
      '지각·조퇴',
      '기타',
    ]);
    expect(gameRosterReasonLabel(null)).toBeNull();
    expect(['TEAM_MANAGER', 'ADMIN', 'STAFF', null].map(gameRosterActorRoleLabel)).toEqual(['팀장', '운영자', '운영자', null]);
  });
});
