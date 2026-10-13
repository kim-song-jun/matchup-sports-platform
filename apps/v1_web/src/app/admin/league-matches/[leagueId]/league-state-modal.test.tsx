import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LeagueStateModal, leagueStateOptions } from './league-state-modal';

const mutate = vi.fn();
vi.mock('@/hooks/use-v1-api', () => ({ useV1ChangeLeagueState: () => ({ mutate, isPending: false }) }));

type Fixture = Parameters<typeof leagueStateOptions>[0]['fixtures'][number];
const fixture = (status: string, resultStage: string, gameState: string | null = null) =>
  ({ teamMatchId: `${status}-${resultStage}`, status, resultStage, gameState }) as unknown as Fixture;
const reasonOf = (options: ReturnType<typeof leagueStateOptions>, state: string) =>
  options.find((option) => option.state === state)?.disabledReason;

describe('leagueStateOptions — 서버 changeState 와 같은 전이 규칙', () => {
  it('준비 중: 진행 중·보류는 열리고 종료는 막힌다', () => {
    const options = leagueStateOptions({ state: 'draft', heldFromState: null, fixtures: [] });
    expect(options.map((option) => option.state)).toEqual(['active', 'on_hold', 'completed']);
    expect(reasonOf(options, 'active')).toBeNull();
    expect(reasonOf(options, 'completed')).toBe('진행 중인 리그만 종료할 수 있어요.');
  });

  it('진행 중: 시작한 경기가 있으면 준비 중을 막고, 남은 경기가 없을 때만 종료를 연다', () => {
    const started = leagueStateOptions({ state: 'active', heldFromState: null, fixtures: [fixture('matched', 'official', 'ENDED'), fixture('matched', 'not_entered')] });
    expect(reasonOf(started, 'draft')).toContain('이미 시작한 경기가 있어');
    expect(reasonOf(started, 'completed')).toContain('결과가 확정되지 않은 경기가 1개');

    const done = leagueStateOptions({ state: 'active', heldFromState: null, fixtures: [fixture('completed', 'official', 'ENDED'), fixture('cancelled', 'not_entered')] });
    expect(reasonOf(done, 'completed')).toBeNull();
  });

  it('보류 중에는 보류 전 상태로만, 종료된 리그는 진행 중으로만 돌아간다', () => {
    const held = leagueStateOptions({ state: 'on_hold', heldFromState: 'active', fixtures: [] });
    expect(reasonOf(held, 'active')).toBeNull();
    expect(reasonOf(held, 'draft')).toContain('보류 전 상태(진행 중)');

    const completed = leagueStateOptions({ state: 'completed', heldFromState: null, fixtures: [] });
    expect(reasonOf(completed, 'active')).toBeNull();
    expect(reasonOf(completed, 'draft')).toContain('먼저 진행 중으로');
    expect(reasonOf(completed, 'on_hold')).toBe('끝난 리그는 보류할 수 없어요.');
  });
});

describe('LeagueStateModal', () => {
  beforeEach(() => mutate.mockReset());

  it('보류는 사유를 써야 바꿀 수 있다', async () => {
    const onClose = vi.fn();
    render(<LeagueStateModal leagueId="league-1" series={{ state: 'active', heldFromState: null, fixtures: [] }} onClose={onClose} showToast={vi.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: /보류/ }));
    expect(screen.getByRole('button', { name: '바꾸기' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('사유 (필수)'), { target: { value: '구장 공사' } });
    fireEvent.click(screen.getByRole('button', { name: '바꾸기' }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith({ state: 'on_hold', reason: '구장 공사' }, expect.anything()));
  });

  it('보류 중에는 "보류 해제 → 이전 상태" 하나만 고를 수 있다', () => {
    render(<LeagueStateModal leagueId="league-1" series={{ state: 'on_hold', heldFromState: 'draft', fixtures: [] }} onClose={vi.fn()} showToast={vi.fn()} />);
    expect(screen.getByRole('radio', { name: /보류 해제 → 준비 중/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /^진행 중/ })).toBeDisabled();
  });
});
