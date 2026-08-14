import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RevisionTimeline } from './revision-timeline';
import type { GameResultRevision } from '@/hooks/use-tournament-result-review';

/**
 * 알파 실측 결함(#380): "처리 이력" 타임라인이 백필된(중첩 `regulation` 형태) 리비전의
 * 점수를 `undefined:undefined`로 표시했다 -- `scoreText`가 `.home`/`.away`를 평평하게
 * 직접 읽었기 때문. 이 테스트는 그 회귀를 관찰 가능한 렌더 텍스트로 재현/방지한다.
 */
function revision(overrides: Partial<GameResultRevision> & { id: string }): GameResultRevision {
  return {
    gameId: 'game-1',
    revision: 1,
    state: 'OFFICIAL',
    score: { home: 0, away: 0 },
    eventsHash: 'hash-1',
    missingScorer: false,
    mvpParticipantId: null,
    reason: null,
    createdByActorType: 'SYSTEM',
    createdByUserId: null,
    createdBySystemActor: 'GAME_END_DERIVER',
    supersedesId: null,
    submittedAt: '2026-08-09T19:30:00.000Z',
    officialAt: '2026-08-09T19:30:00.000Z',
    createdAt: '2026-08-09T19:30:00.000Z',
    updatedAt: '2026-08-09T19:30:00.000Z',
    resultParticipants: [],
    ...overrides,
  };
}

describe('RevisionTimeline — 중첩(regulation) 스코어 리비전도 실제 점수를 보여준다', () => {
  it('백필된(중첩 regulation) 리비전의 점수를 undefined:undefined 가 아니라 실제 점수로 보여준다', () => {
    render(
      <RevisionTimeline
        revisions={[
          revision({
            id: 'rev-1',
            score: {
              regulation: { home: 2, away: 1 },
              penalty: null,
              goals: [],
              incomplete: false,
              provenance: 'TOURNAMENT_FIXTURE_RESULT',
            },
          }),
        ]}
      />,
    );

    expect(screen.getByText('2:1')).toBeInTheDocument();
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
  });

  it('중첩 리비전과 평평한 리비전 사이의 이전→이후 diff 문구에도 undefined 가 나오지 않는다', () => {
    render(
      <RevisionTimeline
        revisions={[
          // 최신(초안) -- 평평한 형태로 정상 저장됨
          revision({
            id: 'rev-2',
            revision: 2,
            state: 'DRAFT',
            supersedesId: 'rev-1',
            score: { home: 2, away: 1 },
          }),
          // 이전(공식 확정) -- 백필된 중첩 형태
          revision({
            id: 'rev-1',
            revision: 1,
            state: 'OFFICIAL',
            score: {
              regulation: null,
              penalty: null,
              goals: [],
              incomplete: true,
              provenance: 'TEAM_MATCH_COMPLETION_ONLY',
            },
          }),
        ]}
      />,
    );

    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
    // 이전 리비전은 regulation 이 null(스코어 미기록)이라 점수를 지어내지 않고
    // "기록 없음" 폴백을 보여준다.
    expect(screen.getByText('이전 기록 없음 → 2:1')).toBeInTheDocument();
  });
});
