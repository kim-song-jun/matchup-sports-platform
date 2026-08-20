import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PromotionCommitPanel } from './promotion-commit-panel';
import type { V1PromotionPreviewResponse } from '@/types/league-series';

function entry(teamId: string, teamName: string, tier: number, position: number, computedKind: 'promoted' | 'relegated' | 'stayed') {
  return {
    teamId,
    teamName,
    tier,
    position,
    computedKind,
    toTier: computedKind === 'promoted' ? tier - 1 : computedKind === 'relegated' ? tier + 1 : tier,
    toTierLabel: `${computedKind === 'promoted' ? tier - 1 : computedKind === 'relegated' ? tier + 1 : tier}부`,
  } as const;
}

const PREVIEW: V1PromotionPreviewResponse = {
  seriesId: 'series-1',
  seasonNo: 1,
  rule: { mode: 'ratio', ratio: 0.2, rounding: 'ceil', minSlots: 1 },
  alreadyDecided: false,
  warnings: [],
  tiers: [
    {
      tier: 1,
      tierLabel: '1부',
      leagueId: 'league-1',
      teamCount: 4,
      promoteCount: 0,
      relegateCount: 1,
      skippedByMajorityGuard: false,
      nextSeasonTeamCount: 4,
      entries: [
        entry('t1', '알파', 1, 1, 'stayed'),
        entry('t2', '브라보', 1, 2, 'stayed'),
        entry('t3', '찰리', 1, 3, 'stayed'),
        entry('t4', '델타', 1, 4, 'relegated'),
      ],
    },
    {
      tier: 2,
      tierLabel: '2부',
      leagueId: 'league-2',
      teamCount: 4,
      promoteCount: 1,
      relegateCount: 0,
      skippedByMajorityGuard: false,
      nextSeasonTeamCount: 4,
      entries: [
        entry('t5', '에코', 2, 1, 'promoted'),
        entry('t6', '폭스', 2, 2, 'stayed'),
        entry('t7', '골프', 2, 3, 'stayed'),
        entry('t8', '호텔', 2, 4, 'stayed'),
      ],
    },
  ],
};

function tierSection(label: string) {
  return screen.getByRole('heading', { name: label }).closest('section') as HTMLElement;
}

describe('PromotionCommitPanel', () => {
  it('규칙 계산 결과를 티어별로 보여준다', () => {
    render(<PromotionCommitPanel preview={PREVIEW} submitting={false} onCommit={vi.fn()} />);
    const tier1 = tierSection('1부');
    expect(within(tier1).getByText('델타')).toBeInTheDocument();
    expect(within(tier1).getByText(/지금 4팀 · 다음 시즌 예상/)).toBeInTheDocument();
  });

  it('팀을 불참으로 바꾸면 다음 시즌 예상 팀 수가 즉시 줄어든다', async () => {
    const user = userEvent.setup();
    render(<PromotionCommitPanel preview={PREVIEW} submitting={false} onCommit={vi.fn()} />);

    // 1부는 4팀 중 1팀 강등 + 2부에서 1팀 승격 = 그대로 4팀
    expect(within(tierSection('1부')).getByText('4팀')).toBeInTheDocument();

    // 승격 예정이던 2부 1위 '에코'가 다음 시즌에 참가하지 않는다면 1부는 3팀이 되어야 한다.
    await user.selectOptions(screen.getByLabelText('에코 승강 결정'), 'withdrawn');

    expect(within(tierSection('1부')).getByText('3팀')).toBeInTheDocument();
  });

  it('규칙과 다르게 정하면 원래 계산값을 함께 보여준다', async () => {
    const user = userEvent.setup();
    render(<PromotionCommitPanel preview={PREVIEW} submitting={false} onCommit={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText('델타 승강 결정'), 'stayed');

    expect(screen.getByText('규칙은 강등')).toBeInTheDocument();
    expect(screen.getByText(/규칙과 다르게 정한 팀 1개/)).toBeInTheDocument();
  });

  it('최종 승인 시 모든 팀의 결정을 빠짐없이 보낸다', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<PromotionCommitPanel preview={PREVIEW} submitting={false} onCommit={onCommit} />);

    await user.selectOptions(screen.getByLabelText('델타 승강 결정'), 'withdrawn');
    await user.click(screen.getByRole('button', { name: '승강 최종 승인' }));

    const entries = onCommit.mock.calls[0][0];
    // 서버가 "빠진 팀"을 422 로 막으므로 8팀 전부가 실려야 한다.
    expect(entries).toHaveLength(8);
    expect(entries.find((e: { teamId: string }) => e.teamId === 't4')).toMatchObject({
      kind: 'withdrawn',
      fromTier: 1,
      overrideNote: expect.any(String),
    });
    // 수정하지 않은 팀에는 사유를 붙이지 않는다.
    expect(entries.find((e: { teamId: string }) => e.teamId === 't1')).not.toHaveProperty('overrideNote');
  });

  it('과반 가드 경고를 그대로 노출한다', () => {
    const guarded: V1PromotionPreviewResponse = {
      ...PREVIEW,
      warnings: [{ tier: 2, code: 'MAJORITY_GUARD_SKIPPED', message: '2부는 팀이 3개뿐이라 승강을 건너뛰었어요.' }],
    };
    render(<PromotionCommitPanel preview={guarded} submitting={false} onCommit={vi.fn()} />);
    expect(screen.getByText('2부는 팀이 3개뿐이라 승강을 건너뛰었어요.')).toBeInTheDocument();
  });
});
