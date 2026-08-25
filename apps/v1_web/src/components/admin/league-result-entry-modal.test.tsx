/**
 * U1 확장(2026-08-25): 결과 입력·정정 모달의 선택적 득점·도움 기록.
 * 잠그는 계약 —
 *  1. participants 를 주면 섹션이 뜨고, 선수 추가→입력→제출 시 onSubmit 4번째 인자로
 *     0-0 행을 제외한 participantStats 가 나간다.
 *  2. 사이드 득점 합 > 팀 스코어면 경고가 뜨고 제출이 잠긴다(서버 규칙과 동일).
 *  3. participants 미제공이면 섹션이 없고 기존 흐름은 빈 배열로 제출된다.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { V1LeagueFixtureParticipantsResponse } from '@/types/league-match';
import { LeagueResultEntryModal } from './league-result-entry-modal';

const PARTICIPANTS: V1LeagueFixtureParticipantsResponse = {
  leagueId: 'league-1',
  teamMatchId: 'tm-1',
  home: {
    teamName: '성수 FC',
    players: [
      { participantId: 'p-h1', name: '김성수' },
      { participantId: 'p-h2', name: '박왕십' },
    ],
  },
  away: { teamName: '왕십리 유나이티드', players: [{ participantId: 'p-a1', name: '이유나' }] },
};

function renderModal(overrides: Partial<Parameters<typeof LeagueResultEntryModal>[0]> = {}) {
  const onSubmit = vi.fn();
  render(
    <LeagueResultEntryModal
      open
      mode="entry"
      homeTeamName="성수 FC"
      awayTeamName="왕십리 유나이티드"
      weekLabel="1주차"
      participants={PARTICIPANTS}
      onSubmit={onSubmit}
      onClose={vi.fn()}
      {...overrides}
    />,
  );
  return { onSubmit };
}

async function fillBaseForm(user: ReturnType<typeof userEvent.setup>) {
  // 모달 오픈 60ms 뒤 첫 입력으로 오토포커스가 한 번 더 이동한다 — 그 전에 타이핑하면
  // 포커스를 빼앗겨 입력이 중간에 끊긴다(league-match-disputes/page.test.tsx 와 같은 함정,
  // CI 저속 환경에서 실제 재현됨). 오토포커스가 끝난 뒤부터 입력한다.
  await new Promise((resolve) => setTimeout(resolve, 100));
  await user.type(screen.getByLabelText('성수 FC'), '2');
  await user.type(screen.getByLabelText('왕십리 유나이티드'), '1');
  await user.type(screen.getByLabelText(/사유/), '실측 결과 입력');
}

describe('LeagueResultEntryModal 득점·도움 기록', () => {
  it('선수를 추가해 득점·도움을 넣으면 onSubmit 에 0-0 행을 제외한 participantStats 가 실린다', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal();
    await fillBaseForm(user);

    await user.selectOptions(screen.getByLabelText('성수 FC 선수 추가'), 'p-h1');
    await user.type(screen.getByLabelText('김성수 득점'), '2');
    await user.type(screen.getByLabelText('김성수 도움'), '1');
    // 추가만 하고 아무 것도 안 채운 행은 제출에서 빠져야 한다.
    await user.selectOptions(screen.getByLabelText('왕십리 유나이티드 선수 추가'), 'p-a1');

    await user.click(screen.getByRole('button', { name: '확인' }));

    expect(onSubmit).toHaveBeenCalledWith(2, 1, '실측 결과 입력', [
      { participantId: 'p-h1', goals: 2, assists: 1 },
    ]);
  });

  it('사이드 득점 합이 팀 스코어를 넘으면 경고를 띄우고 제출을 잠근다', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal();
    await fillBaseForm(user);

    await user.selectOptions(screen.getByLabelText('성수 FC 선수 추가'), 'p-h1');
    await user.type(screen.getByLabelText('김성수 득점'), '3');

    expect(screen.getByRole('alert')).toHaveTextContent('선수 득점·도움 합이 팀 스코어보다 많아요');
    await user.click(screen.getByRole('button', { name: '확인' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('participants 미제공이면 섹션이 없고 빈 배열로 제출된다', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal({ participants: null });
    await fillBaseForm(user);

    expect(screen.queryByText(/득점·도움 기록/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '확인' }));
    expect(onSubmit).toHaveBeenCalledWith(2, 1, '실측 결과 입력', []);
  });
});
