import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GameSummaryHeader } from './game-summary-header';
import type { TournamentGameDetail } from '@/hooks/use-tournament-result-review';

/**
 * **화면에 `undefined` 가 찍히던 자리(#35).**
 *
 * 역할 라벨 맵이 대회 스태프 4개만 갖고 있었는데, 정본이 "리그도 같은 콘솔" 로 확정하면서
 * 이 화면을 **팀 쪽 역할**(`team_owner` 등)로도 지나게 됐다. 맵에 없는 키를 템플릿 리터럴에
 * 넣으니 `"종료 · undefined"` 가 나갔다(2026-09-06 alpha 실측).
 */
const gameWith = (actorRole: TournamentGameDetail['actorRole']): TournamentGameDetail =>
  ({
    id: 'g-1',
    state: 'ENDED',
    actorRole,
    sides: [
      { sideKey: 'HOME', displayNameSnapshot: 'A팀' },
      { sideKey: 'AWAY', displayNameSnapshot: 'B팀' },
    ],
  }) as unknown as TournamentGameDetail;

describe('GameSummaryHeader 역할 라벨', () => {
  it('팀 역할도 사람이 읽는 말로 보여준다 — 리그 대진이 이 화면을 지난다', () => {
    render(<GameSummaryHeader game={gameWith('team_owner')} currentRevision={null} />);

    expect(screen.getByText(/팀장/)).toBeInTheDocument();
    // **이 단언이 핵심이다.** 맵에 없으면 여기 `undefined` 가 찍혔다.
    expect(document.body.textContent).not.toContain('undefined');
  });

  it('대회 스태프 역할은 그대로다 (회귀)', () => {
    render(<GameSummaryHeader game={gameWith('platform_ops')} currentRevision={null} />);

    expect(screen.getByText(/플랫폼 운영자/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('undefined');
  });

  it('서버가 아직 모르는 역할을 보내도 undefined 를 찍지 않는다', () => {
    // 타입은 다 덮지만, 서버가 새 역할을 **먼저** 내보내는 순간이 있다.
    render(
      <GameSummaryHeader
        game={gameWith('brand_new_role' as TournamentGameDetail['actorRole'])}
        currentRevision={null}
      />,
    );

    expect(document.body.textContent).not.toContain('undefined');
  });
});
