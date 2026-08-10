import { HttpException } from '@nestjs/common';
import { V1GameState, type V1GameParticipant } from '@prisma/client';
import { validate } from 'class-validator';
import { GameContractError } from './core';
import { GameCommandDto } from './dto/game-command.dto';
import {
  canonicalGameCommandPayloadHash,
  extractEndPenalties,
  gameAuthorizationAction,
  gameOperationAuditActor,
  groupParticipantsByLineupId,
  toGameHttpException,
} from './games.service';

function participant(overrides: Partial<V1GameParticipant>): V1GameParticipant {
  return {
    id: 'participant-id',
    gameId: 'game-id',
    sideId: 'side-id',
    lineupId: 'lineup-id',
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
