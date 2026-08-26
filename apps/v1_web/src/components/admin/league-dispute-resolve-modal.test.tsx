/**
 * D2 (E4): 처리 모달이 정정/무효 토글에 따라 스코어 입력을 보이고/숨기는지 검증한다
 * (태스크 문서 테스트 요구사항). 제출 payload 자체의 엔드포인트·body 검증은
 * page.test.tsx + use-v1-api.admin-league-dispute.test.ts 에서 커버한다.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LeagueDisputeResolveModal } from './league-dispute-resolve-modal';

describe('LeagueDisputeResolveModal', () => {
  it('기본(정정) 모드에서는 홈/원정 스코어 입력이 보인다', () => {
    render(
      <LeagueDisputeResolveModal
        open
        leagueTitle="가을 리그"
        homeTeamName="성수 FC"
        awayTeamName="왕십리 유나이티드"
        reason="심판 오심"
        currentHomeScore={2}
        currentAwayScore={1}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('성수 FC')).toBeInTheDocument();
    expect(screen.getByLabelText('왕십리 유나이티드')).toBeInTheDocument();
  });

  it('무효로 전환하면 스코어 입력이 사라진다', async () => {
    const user = userEvent.setup();
    render(
      <LeagueDisputeResolveModal
        open
        leagueTitle="가을 리그"
        homeTeamName="성수 FC"
        awayTeamName="왕십리 유나이티드"
        reason="심판 오심"
        currentHomeScore={2}
        currentAwayScore={1}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('radio', { name: '무효' }));

    expect(screen.queryByLabelText('성수 FC')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('왕십리 유나이티드')).not.toBeInTheDocument();
    expect(screen.getByText('이 대진의 결과를 무효로 처리해요. 순위표에서 자동으로 빠져요.')).toBeInTheDocument();
  });

  it('무효 제출은 스코어 없이 note만 전달한다', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <LeagueDisputeResolveModal
        open
        leagueTitle="가을 리그"
        homeTeamName="성수 FC"
        awayTeamName="왕십리 유나이티드"
        reason="심판 오심"
        currentHomeScore={2}
        currentAwayScore={1}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );

    // 모달 오픈 60ms 뒤 첫 포커스 가능 요소(처리 방식 라디오)로 자동 포커스가 한 번 더
    // 이동한다 — 그 전에 타이핑하면 포커스를 빼앗겨 입력이 중간에 끊긴다.
    await new Promise((resolve) => setTimeout(resolve, 100));
    await user.click(screen.getByRole('radio', { name: '무효' }));
    await user.type(screen.getByLabelText(/처리 사유/), '경기 자체가 성립하지 않음');
    await user.click(screen.getByRole('button', { name: '확인' }));

    expect(onSubmit).toHaveBeenCalledWith('void', '경기 자체가 성립하지 않음');
  });

  it('정정 제출은 입력한 홈/원정 스코어를 함께 전달한다', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <LeagueDisputeResolveModal
        open
        leagueTitle="가을 리그"
        homeTeamName="성수 FC"
        awayTeamName="왕십리 유나이티드"
        reason="심판 오심"
        currentHomeScore={2}
        currentAwayScore={1}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );

    await new Promise((resolve) => setTimeout(resolve, 100));
    await user.type(screen.getByLabelText('성수 FC'), '3');
    await user.type(screen.getByLabelText('왕십리 유나이티드'), '1');
    await user.type(screen.getByLabelText(/처리 사유/), '재검토 완료');
    await user.click(screen.getByRole('button', { name: '확인' }));

    expect(onSubmit).toHaveBeenCalledWith('correction', '재검토 완료', 3, 1);
  });
});
