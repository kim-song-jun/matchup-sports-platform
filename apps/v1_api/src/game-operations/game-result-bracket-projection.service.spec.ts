/**
 * game-result-bracket-projection.service.spec.ts
 *
 * 승부차기 트랙 B: `GameResultBracketProjectionService.project()`의 승자 판정만 표적으로
 * 검증한다(`resolveWinnerSide`는 private이라 직접 부르지 않고, 실제 코드 경로인
 * `project()`를 통해 관찰 가능한 결과 -- 어느 쪽 registrationId가 다음 라운드 픽스처에
 * 배정되는지 -- 로만 검증한다).
 *
 * `$queryRaw`/`$executeRaw`는 태그드 템플릿이라 실제 SQL을 파싱할 필요가 없다 -- 이
 * 서비스가 호출하는 정확한 순서(lockEdges -> fixtures 조회 -> assertRegistrations ->
 * assignTarget)대로 `mockResolvedValueOnce`를 체이닝해 각 단계가 기대하는 행만 돌려준다.
 * 이 순서가 바뀌면 테스트 자체가 실패하므로(where 필터를 무시하는 가짜와 달리) 실제 서비스
 * 코드가 그 순서로 호출한다는 사실 자체를 이 테스트가 증명한다.
 */
import { GameResultBracketProjectionService } from './game-result-bracket-projection.service';
import type { OfficialRevisionRow, OfficialScore } from './game-result-official-projection.types';

const SOURCE_FIXTURE = 'fixture-source';
const TARGET_FIXTURE = 'fixture-target';
const TOURNAMENT = 'tournament-1';
const HOME_REG = 'registration-home';
const AWAY_REG = 'registration-away';

function revisionRow(overrides: Partial<OfficialRevisionRow> = {}): OfficialRevisionRow {
  return {
    revisionId: 'revision-1',
    gameId: 'game-1',
    revision: 1,
    score: { home: 1, away: 1 },
    sourceHash: 'hash-1',
    officialAt: new Date('2026-08-01T00:00:00Z'),
    reason: null,
    sourceType: 'TOURNAMENT_FIXTURE',
    currentOfficialRevisionId: 'revision-1',
    tournamentId: TOURNAMENT,
    tournamentFixtureId: SOURCE_FIXTURE,
    homeTeamId: 'team-home',
    awayTeamId: 'team-away',
    visibility: 'LIVE' as const,
    ...overrides,
  };
}

/**
 * Builds a fake tx whose `$queryRaw` answers, in call order, exactly what
 * `project()` issues for a single-edge WINNER advancement out of a level
 * (1-1) source fixture: (1) the advancement edge, (2) the locked source +
 * target fixture rows, (3) the two CONFIRMED registrations. `$executeRaw`
 * answers the final `assignTarget` UPDATE with "1 row touched".
 */
function makeTx() {
  const queryRaw = jest
    .fn()
    .mockResolvedValueOnce([
      {
        tournamentId: TOURNAMENT,
        sourceFixtureId: SOURCE_FIXTURE,
        sourceOutcome: 'WINNER',
        targetFixtureId: TARGET_FIXTURE,
        targetSide: 'HOME',
      },
    ])
    .mockResolvedValueOnce([
      {
        id: SOURCE_FIXTURE,
        tournamentId: TOURNAMENT,
        status: 'completed',
        homeRegistrationId: HOME_REG,
        awayRegistrationId: AWAY_REG,
      },
      {
        id: TARGET_FIXTURE,
        tournamentId: TOURNAMENT,
        status: 'scheduled',
        homeRegistrationId: null,
        awayRegistrationId: null,
      },
    ])
    .mockResolvedValueOnce([
      { id: HOME_REG, tournamentId: TOURNAMENT, status: 'confirmed' },
      { id: AWAY_REG, tournamentId: TOURNAMENT, status: 'confirmed' },
    ]);
  const executeRaw = jest.fn().mockResolvedValue(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { $queryRaw: queryRaw, $executeRaw: executeRaw } as any;
}

describe('GameResultBracketProjectionService penalty-aware winner resolution', () => {
  const service = new GameResultBracketProjectionService();

  it('정규시간이 무승부여도 승부차기 승자가 있으면 그 팀이 다음 라운드로 배정된다', async () => {
    const tx = makeTx();
    const score: OfficialScore = { home: 1, away: 1, penalties: { home: 5, away: 4 } };

    await service.project(tx, revisionRow(), score);

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const [strings, registrationId] = tx.$executeRaw.mock.calls[0];
    expect(String(strings.join(''))).toContain('home_registration_id');
    expect(registrationId).toBe(HOME_REG); // penalties.home(5) > penalties.away(4)
  });

  it('승부차기에서 원정팀이 이기면 원정팀 registrationId가 배정된다', async () => {
    const tx = makeTx();
    const score: OfficialScore = { home: 1, away: 1, penalties: { home: 3, away: 5 } };

    await service.project(tx, revisionRow(), score);

    const [, registrationId] = tx.$executeRaw.mock.calls[0];
    expect(registrationId).toBe(AWAY_REG);
  });

  it('정규시간 무승부 + 승부차기 미기록 → 여전히 BRACKET_RESULT_DRAW_UNSUPPORTED(회귀 방지)', async () => {
    const tx = makeTx();
    const score: OfficialScore = { home: 1, away: 1 };

    await expect(service.project(tx, revisionRow(), score)).rejects.toThrow(
      'BRACKET_RESULT_DRAW_UNSUPPORTED',
    );
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('승부차기 스코어 자체가 동점이면(입력 오류) 무승부로 취급해 거부한다', async () => {
    const tx = makeTx();
    const score: OfficialScore = { home: 1, away: 1, penalties: { home: 4, away: 4 } };

    await expect(service.project(tx, revisionRow(), score)).rejects.toThrow(
      'BRACKET_RESULT_DRAW_UNSUPPORTED',
    );
  });

  it('정규시간에 이미 승부가 갈렸으면 penalties가 있어도 정규시간 승자를 그대로 쓴다', async () => {
    const tx = makeTx();
    // Home won 2-1 in regulation; a stray penalties field (should never
    // reach here in practice -- GamesService.applyPenalties rejects this at
    // the `end` command -- but the projection itself must stay defensive)
    // must not override the decisive regulation result.
    const score: OfficialScore = { home: 2, away: 1, penalties: { home: 3, away: 5 } };

    await service.project(tx, revisionRow(), score);

    const [, registrationId] = tx.$executeRaw.mock.calls[0];
    expect(registrationId).toBe(HOME_REG);
  });
});
