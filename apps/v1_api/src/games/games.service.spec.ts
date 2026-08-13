import { HttpException } from '@nestjs/common';
import { V1GameState, type V1GameParticipant } from '@prisma/client';
import { validate } from 'class-validator';
import { GameContractError } from './core';
import { GameCommandDto } from './dto/game-command.dto';
import {
  canonicalGameCommandPayloadHash,
  extractEndPenalties,
  gameAuthorizationAction,
  gameCommandAuditAction,
  gameOperationAuditActor,
  groupParticipantsByLineupId,
  latestLineupStateBySideId,
  resolveLineupRosterRegistration,
  staffLineupSubmitRequiresTakeover,
  toGameHttpException,
} from './games.service';

function participant(overrides: Partial<V1GameParticipant>): V1GameParticipant {
  return {
    id: 'participant-id',
    gameId: 'game-id',
    sideId: 'side-id',
    lineupId: 'lineup-id',
    userId: null,
    displayNameSnapshot: 'Player',
    jerseyNumber: null,
    position: null,
    positionX: null,
    positionY: null,
    started: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('GamesService command boundary', () => {
  it('hashes semantic command payloads deterministically while distinguishing changed payloads', () => {
    const first = canonicalGameCommandPayloadHash({
      expectedVersion: 0,
      payload: { note: 'kickoff', nested: { b: 2, a: 1 } },
      command: 'start',
    });
    const reordered = canonicalGameCommandPayloadHash({
      command: 'start',
      payload: { nested: { a: 1, b: 2 }, note: 'kickoff' },
      expectedVersion: 0,
    });
    const changed = canonicalGameCommandPayloadHash({
      command: 'pause',
      payload: { nested: { a: 1, b: 2 }, note: 'kickoff' },
      expectedVersion: 0,
    });

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(reordered).toBe(first);
    expect(changed).not.toBe(first);
  });

  it('maps named contract failures to their frozen HTTP statuses and preserves details', () => {
    const conflict = toGameHttpException(
      new GameContractError('VERSION_CONFLICT', 'stale', {
        expectedVersion: 1,
        currentVersion: 2,
      }),
    );
    const mismatch = toGameHttpException(
      new GameContractError('COMMAND_IDEMPOTENCY_KEY_MISMATCH', 'mismatch'),
    );

    expect(conflict).toBeInstanceOf(HttpException);
    expect(conflict.getStatus()).toBe(409);
    expect(conflict.getResponse()).toEqual({
      code: 'VERSION_CONFLICT',
      message: 'stale',
      details: { expectedVersion: 1, currentVersion: 2 },
    });
    expect(mismatch.getStatus()).toBe(422);
  });

  it('rejects malformed lifecycle DTO input before it can reach persistence', async () => {
    const dto = Object.assign(new GameCommandDto(), {
      expectedVersion: -1,
      clientCommandId: '',
      takeoverToken: '',
      occurredAt: 'not-a-date',
      payload: [],
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property).sort()).toEqual([
      'clientCommandId',
      'expectedVersion',
      'occurredAt',
      'payload',
      'takeoverToken',
    ]);
  });

  it('keeps the persisted game state enum pinned to the current generated client', () => {
    expect(Object.values(V1GameState)).toEqual([
      'SCHEDULED',
      'LIVE',
      'PAUSED',
      'ENDED',
      'CANCELLED',
    ]);
  });

  it.each([
    ['game_start', 'tournament_command'],
    ['game_end', 'tournament_command'],
    // 이슈 #375 — end-period/start-period/revert-period은 next_period가 쓰던
    // tournament_command 굵기의 권한을 그대로 물려받는다. next_period 자체도
    // 배포 호환용으로 당분간 계속 받으므로(game-command.dto.ts의
    // @deprecated 문서) 함께 매핑돼야 한다.
    ['game_end_period', 'tournament_command'],
    ['game_start_period', 'tournament_command'],
    ['game_revert_period', 'tournament_command'],
    ['game_next_period', 'tournament_command'],
    ['game_cancel', 'cancel'],
    ['event_append', 'event_append'],
    ['event_reverse', 'event_reverse'],
    ['lineup_save', 'lineup_mutate'],
    ['lineup_submit', 'lineup_mutate'],
    ['result_revision_create', 'team_result_submit'],
    ['result_revision_submit', 'team_result_submit'],
    ['result_revision_approve', 'opponent_result_decide'],
    ['result_revision_change_request', 'opponent_result_decide'],
  ] as const)('maps durable command %s to a fresh authorization action', (command, action) => {
    expect(gameAuthorizationAction(command)).toBe(action);
  });

  it('rejects unknown durable commands instead of skipping authorization', () => {
    expect(() => gameAuthorizationAction('unknown_command')).toThrow(
      'Unsupported game command action: unknown_command',
    );
    expect(() => gameAuthorizationAction('game_destroy')).toThrow(
      'Unsupported game command action: game_destroy',
    );
  });

  // 이슈 #375 — 하이픈이 들어간 커맨드 이름(`end-period` 등)을 그냥
  // `game_${command}` 템플릿에 넣으면 감사 로그 액션 문자열에 하이픈이
  // 섞여(`game_end-period`) 나머지 액션들의 스네이크케이스 관례와 어긋난다.
  // 실제로 이 매핑이 깨지면 gameAuthorizationAction의 switch 어느 case에도
  // 안 걸려 executeCommand가 즉시 예외를 던진다 — 이 테스트가 그 회귀를
  // 직접 잡는다.
  it.each([
    ['start', 'game_start'],
    ['pause', 'game_pause'],
    ['resume', 'game_resume'],
    ['end', 'game_end'],
    ['end-period', 'game_end_period'],
    ['start-period', 'game_start_period'],
    ['revert-period', 'game_revert_period'],
    ['next-period', 'game_next_period'],
  ] as const)('maps command %s to the audit action %s (hyphens become underscores)', (command, action) => {
    expect(gameCommandAuditAction(command)).toBe(action);
    // 어느 커맨드로 만들어졌든, 결과 액션 문자열은 항상
    // gameAuthorizationAction이 이해하는 값이어야 한다 — 매핑 두 개가
    // 서로 어긋나면 executeCommand가 런타임에만 발견되는 예외를 던진다.
    expect(() => gameAuthorizationAction(gameCommandAuditAction(command))).not.toThrow();
  });

  it('maps game principals to actor-neutral audit identities', () => {
    expect(
      gameOperationAuditActor({
        actorType: 'USER',
        actorUserId: 'ops-user',
        role: 'platform_ops',
      }),
    ).toEqual({ type: 'PLATFORM_OPS', id: 'ops-user' });
    expect(
      gameOperationAuditActor({
        actorType: 'USER',
        actorUserId: 'staff-user',
        role: 'field_operator',
      }),
    ).toEqual({ type: 'TOURNAMENT_STAFF', id: 'staff-user' });
    expect(
      gameOperationAuditActor({
        actorType: 'USER',
        actorUserId: 'team-user',
        role: 'team_manager',
      }),
    ).toEqual({ type: 'TEAM_MANAGER', id: 'team-user' });
    expect(
      gameOperationAuditActor({ actorType: 'SYSTEM', systemActor: 'PROJECTION_REPAIR' }),
    ).toEqual({ type: 'SYSTEM', id: 'PROJECTION_REPAIR' });
  });

  describe('staffLineupSubmitRequiresTakeover (알파 2026-08-11: 스태프 라인업 제출이 TAKEOVER_TOKEN_EXPIRED로 막히던 사고)', () => {
    it('경기가 아직 시작되지 않았으면(SCHEDULED) 스태프도 토큰 없이 제출할 수 있다', () => {
      expect(staffLineupSubmitRequiresTakeover(V1GameState.SCHEDULED)).toBe(false);
    });

    it.each([
      ['LIVE', V1GameState.LIVE],
      ['PAUSED', V1GameState.PAUSED],
      ['ENDED', V1GameState.ENDED],
      ['CANCELLED', V1GameState.CANCELLED],
    ] as const)(
      '경기가 SCHEDULED를 벗어났으면(%s) 스태프도 기존대로 인계 토큰이 필요하다',
      (_label, state) => {
        expect(staffLineupSubmitRequiresTakeover(state)).toBe(true);
      },
    );
  });

  describe('groupParticipantsByLineupId (Task 21: listLineups() participants roster)', () => {
    it('buckets participants under their own lineupId and preserves each bucket\'s row order', () => {
      const homeOne = participant({ id: 'p1', lineupId: 'lineup-home', jerseyNumber: 7 });
      const homeTwo = participant({ id: 'p2', lineupId: 'lineup-home', jerseyNumber: 10 });
      const away = participant({ id: 'p3', lineupId: 'lineup-away', jerseyNumber: 9 });

      const grouped = groupParticipantsByLineupId([homeOne, homeTwo, away]);

      expect(grouped.get('lineup-home')).toEqual([homeOne, homeTwo]);
      expect(grouped.get('lineup-away')).toEqual([away]);
    });

    it('returns an empty map for no participants, and undefined for a lineupId with none -- listLineups() falls back to []', () => {
      expect(groupParticipantsByLineupId([]).size).toBe(0);
      expect(groupParticipantsByLineupId([]).get('any-lineup-id')).toBeUndefined();
    });

    it('never merges rows from two different lineups into the same bucket', () => {
      const rows = [
        participant({ id: 'a', lineupId: 'lineup-1' }),
        participant({ id: 'b', lineupId: 'lineup-2' }),
        participant({ id: 'c', lineupId: 'lineup-1' }),
      ];

      const grouped = groupParticipantsByLineupId(rows);

      expect(grouped.get('lineup-1')?.map((row) => row.id)).toEqual(['a', 'c']);
      expect(grouped.get('lineup-2')?.map((row) => row.id)).toEqual(['b']);
    });
  });

  describe('extractEndPenalties (트랙 B: end 커맨드의 승부차기 payload 파싱)', () => {
    it('payload.penalties가 없으면 undefined(대부분의 end 커맨드는 승부차기가 없다)', () => {
      expect(extractEndPenalties({})).toBeUndefined();
    });

    it('유효한 { home, away }를 그대로 반환한다', () => {
      expect(extractEndPenalties({ penalties: { home: 5, away: 4 } })).toEqual({ home: 5, away: 4 });
    });

    it('home === away(승부가 갈리지 않음)면 422 TOURNAMENT_PENALTY_INVALID', () => {
      expect(() => extractEndPenalties({ penalties: { home: 3, away: 3 } })).toThrow(HttpException);
      try {
        extractEndPenalties({ penalties: { home: 3, away: 3 } });
      } catch (error) {
        expect((error as HttpException).getStatus()).toBe(422);
        expect((error as HttpException).getResponse()).toEqual(
          expect.objectContaining({ code: 'TOURNAMENT_PENALTY_INVALID' }),
        );
      }
    });

    it.each([
      ['home이 음수', { home: -1, away: 4 }],
      ['away가 정수가 아님', { home: 5, away: 4.5 }],
      ['home이 숫자가 아님', { home: '5', away: 4 }],
      ['배열', [5, 4]],
      ['null', null],
    ])('penalties가 구조를 갖추지 못하면(%s) 422 TOURNAMENT_PENALTY_INVALID', (_label, penalties) => {
      expect(() => extractEndPenalties({ penalties })).toThrow(HttpException);
    });
  });
});

/**
 * 대회 경기 라인업이 참가 등록 명단(V1TournamentPlayer)에서만 만들어지게 되면서 생긴
 * 두 판정 지점. 응답에 선수 실명이 들어가므로 "누가 어느 팀 명단을 볼 수 있는가"는
 * PII 경계 그 자체다.
 */
describe('resolveLineupRosterRegistration', () => {
  const home = { id: 'reg-home', teamId: 'team-home' };
  const away = { id: 'reg-away', teamId: 'team-away' };

  it('참가팀 매니저는 자기 팀 사이드의 등록 명단을 읽는다', () => {
    expect(
      resolveLineupRosterRegistration({
        actorRole: 'team_manager',
        actorTeamId: 'team-home',
        sideTeamId: 'team-home',
        homeRegistration: home,
        awayRegistration: away,
      }),
    ).toEqual({ registrationId: 'reg-home' });
  });

  // 이 분기가 무너지면 상대팀 선수 실명이 그대로 넘어간다.
  it('참가팀 매니저가 상대팀 사이드를 요청하면 거부한다', () => {
    expect(
      resolveLineupRosterRegistration({
        actorRole: 'team_manager',
        actorTeamId: 'team-home',
        sideTeamId: 'team-away',
        homeRegistration: home,
        awayRegistration: away,
      }),
    ).toEqual({ denied: 'forbidden' });
  });

  it('팀 오너도 같은 제한을 받는다', () => {
    expect(
      resolveLineupRosterRegistration({
        actorRole: 'team_owner',
        actorTeamId: 'team-home',
        sideTeamId: 'team-away',
        homeRegistration: home,
        awayRegistration: away,
      }),
    ).toEqual({ denied: 'forbidden' });
  });

  // 팀 매니저가 자리를 비운 대회 당일에 운영진이 대신 명단을 짜야 한다.
  it('대회 스태프는 양 팀 어느 쪽이든 읽을 수 있다', () => {
    for (const role of ['tournament_director', 'field_operator', 'platform_ops']) {
      expect(
        resolveLineupRosterRegistration({
          actorRole: role,
          actorTeamId: null,
          sideTeamId: 'team-away',
          homeRegistration: home,
          awayRegistration: away,
        }),
      ).toEqual({ registrationId: 'reg-away' });
    }
  });

  it('사이드에 대응하는 대회 등록이 없으면 빈 명단이 아니라 없음으로 구분한다', () => {
    expect(
      resolveLineupRosterRegistration({
        actorRole: 'platform_ops',
        actorTeamId: null,
        sideTeamId: 'team-ghost',
        homeRegistration: home,
        awayRegistration: away,
      }),
    ).toEqual({ denied: 'registration_not_found' });
  });
});

describe('latestLineupStateBySideId', () => {
  // 라인업은 저장할 때마다 행이 쌓인다 — 옛 리비전을 집으면 이미 제출한 라인업이
  // 일정 화면에서 "미작성"으로 표시된다.
  it('사이드별로 가장 높은 revision의 상태를 고른다 (입력 순서와 무관)', () => {
    const latest = latestLineupStateBySideId([
      { sideId: 'side-a', state: 'DRAFT', revision: 1 },
      { sideId: 'side-a', state: 'SUBMITTED', revision: 3 },
      { sideId: 'side-a', state: 'DRAFT', revision: 2 },
      { sideId: 'side-b', state: 'LOCKED', revision: 1 },
    ]);
    expect(latest.get('side-a')).toBe('SUBMITTED');
    expect(latest.get('side-b')).toBe('LOCKED');
  });

  it('라인업이 하나도 없으면 빈 맵이다 — 화면은 이걸 "미작성"으로 읽는다', () => {
    expect(latestLineupStateBySideId([]).size).toBe(0);
  });
});
