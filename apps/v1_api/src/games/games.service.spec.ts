import { HttpException } from '@nestjs/common';
import { V1GameState } from '@prisma/client';
import { validate } from 'class-validator';
import { GameContractError } from './core';
import { GameCommandDto } from './dto/game-command.dto';
import {
  canonicalGameCommandPayloadHash,
  toGameHttpException,
} from './games.service';

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
});
