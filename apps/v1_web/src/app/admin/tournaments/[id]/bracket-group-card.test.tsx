/**
 * 설계안 B 핵심 계약: "팀 배정"이 더 이상 1팀씩 왕복하지 않고, 담아둔 여러 팀을 한 번의
 * 클릭으로 순차 일괄 배정하는가(마찰 ①의 실제 해소 여부). 오너 리포트("4팀이면 4번 반복")를
 * 직접 재현·검증한다 — mutate 호출 스파이만 확인하는 게 아니라 실제로 서로 다른
 * registrationId로 N번 호출되는지, 성공 토스트 문구가 배정 개수에 맞는지까지 본다.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { V1AdminBracketFixture, V1AdminBracketGroup, V1AdminBracketStanding } from '@/types/api';
import { BracketGroupCard } from './bracket-group-card';

function noopMutation() {
  return { mutate: vi.fn(), isPending: false } as unknown as ReturnType<
    typeof import('@/hooks/use-v1-api').useV1CreateFixture
  >;
}

describe('BracketGroupCard — 팀 일괄 배정', () => {
  const groupA: V1AdminBracketGroup = {
    id: 'group-a',
    tournamentId: 't-1',
    name: 'A조',
    phase: 'group',
    sortOrder: 0,
    advanceCount: 2,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    groupTeams: [],
  };

  const semiGroup: V1AdminBracketGroup = {
    id: 'semi-1',
    tournamentId: 't-1',
    name: '4강',
    phase: 'semi',
    sortOrder: 1,
    advanceCount: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    groupTeams: [],
  };

  const standings: V1AdminBracketStanding[] = [
    { id: 's-1', groupId: 'group-a', registrationId: 'r1', teamName: '강남FC', points: 9, wins: 3, draws: 0, losses: 0, goalsFor: 9, goalsAgainst: 1, goalDifference: 8, position: 1, recalculatedAt: null },
    { id: 's-2', groupId: 'group-a', registrationId: 'r2', teamName: '서초유나이티드', points: 6, wins: 2, draws: 0, losses: 1, goalsFor: 6, goalsAgainst: 4, goalDifference: 2, position: 2, recalculatedAt: null },
  ];

  const fixtures: V1AdminBracketFixture[] = [];

  it('예선 상위 진출팀 추천칩 2개를 담고 "2팀 배정"을 누르면 서로 다른 registrationId로 두 번 순차 호출된다', async () => {
    const mutateCalls: { groupId: string; registrationId: string }[] = [];
    const assignGroupTeam = {
      mutate: vi.fn((payload: { groupId: string; registrationId: string }, opts: { onSuccess: () => void }) => {
        mutateCalls.push(payload);
        opts.onSuccess();
      }),
      isPending: false,
    } as unknown as ReturnType<typeof import('@/hooks/use-v1-api').useV1AssignGroupTeam>;

    const showToast = vi.fn();

    render(
      <BracketGroupCard
        group={semiGroup}
        allGroups={[groupA, semiGroup]}
        allStandings={standings}
        fixtures={fixtures}
        confirmedTeamItems={[]}
        assignGroupTeam={assignGroupTeam}
        createFixture={noopMutation()}
        isAutoGenerating={false}
        onAutoGenerate={vi.fn()}
        onEditGroup={vi.fn()}
        onDeleteGroup={vi.fn()}
        onRemoveGroupTeam={vi.fn()}
        autoFocus={false}
        showToast={showToast}
      />,
    );

    // 추천칩 2개가 보여야 한다(예선 A조 상위 2팀)
    fireEvent.click(screen.getByRole('button', { name: /강남FC/ }));
    fireEvent.click(screen.getByRole('button', { name: /서초유나이티드/ }));

    // 담은 팀 2개 → 배정 버튼 라벨이 "2팀 배정"
    const submit = screen.getByRole('button', { name: '2팀 배정' });
    fireEvent.click(submit);

    await waitFor(() => expect(assignGroupTeam.mutate).toHaveBeenCalledTimes(2));

    expect(mutateCalls).toEqual([
      { groupId: 'semi-1', registrationId: 'r1' },
      { groupId: 'semi-1', registrationId: 'r2' },
    ]);
    expect(showToast).toHaveBeenCalledWith('2팀을 배정했어요.', 'success');
  });

  it('1팀만 담으면 단수 토스트 문구("팀을 배정했어요.")를 쓴다', async () => {
    const assignGroupTeam = {
      mutate: vi.fn((_payload: unknown, opts: { onSuccess: () => void }) => opts.onSuccess()),
      isPending: false,
    } as unknown as ReturnType<typeof import('@/hooks/use-v1-api').useV1AssignGroupTeam>;
    const showToast = vi.fn();

    render(
      <BracketGroupCard
        group={semiGroup}
        allGroups={[groupA, semiGroup]}
        allStandings={standings}
        fixtures={fixtures}
        confirmedTeamItems={[]}
        assignGroupTeam={assignGroupTeam}
        createFixture={noopMutation()}
        isAutoGenerating={false}
        onAutoGenerate={vi.fn()}
        onEditGroup={vi.fn()}
        onDeleteGroup={vi.fn()}
        onRemoveGroupTeam={vi.fn()}
        autoFocus={false}
        showToast={showToast}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /강남FC/ }));
    fireEvent.click(screen.getByRole('button', { name: '1팀 배정' }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('팀을 배정했어요.', 'success'));
    expect(assignGroupTeam.mutate).toHaveBeenCalledTimes(1);
  });

  it('조별(group) 단계 조는 추천칩 없이 "다른 팀 검색"만 보인다', () => {
    render(
      <BracketGroupCard
        group={groupA}
        allGroups={[groupA, semiGroup]}
        allStandings={standings}
        fixtures={fixtures}
        confirmedTeamItems={[{ id: 'r9', label: '잠실United' }]}
        assignGroupTeam={noopMutation() as unknown as ReturnType<typeof import('@/hooks/use-v1-api').useV1AssignGroupTeam>}
        createFixture={noopMutation()}
        isAutoGenerating={false}
        onAutoGenerate={vi.fn()}
        onEditGroup={vi.fn()}
        onDeleteGroup={vi.fn()}
        onRemoveGroupTeam={vi.fn()}
        autoFocus={false}
        showToast={vi.fn()}
      />,
    );

    expect(screen.queryByText(/예선 상위 진출팀이에요/)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('팀 검색')).toBeInTheDocument();
  });
});
