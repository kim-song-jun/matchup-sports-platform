import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { V1GameEventType } from '@prisma/client';
import {
  AppendGameEventDto,
  AssignGoalAssistDto,
  ReverseGameEventDto,
} from './game-event.dto';

const validAppend = {
  expectedVersion: 0,
  clientEventId: 'event-1',
  type: V1GameEventType.GOAL,
  period: 1,
  clockMs: 0,
  occurredAt: '2026-10-28T00:00:00.000Z',
  payload: {},
};

const validReverse = {
  expectedVersion: 0,
  clientEventId: 'reverse-1',
  reason: 'correction',
};

const validAssist = {
  expectedVersion: 0,
  clientEventId: 'assist-1',
  assistParticipantId: '87000000-0000-4000-8000-000000000001',
};

describe('game event DTO takeover token transport contract', () => {
  type TestDto = new () => { takeoverToken?: string };
  const cases: Array<{ name: string; dto: TestDto; validBody: object }> = [
    { name: 'append', dto: AppendGameEventDto, validBody: validAppend },
    { name: 'reverse', dto: ReverseGameEventDto, validBody: validReverse },
    { name: 'assist', dto: AssignGoalAssistDto, validBody: validAssist },
  ];

  it.each(cases)('$name allows token omission but rejects supplied invalid values', async ({ dto, validBody }) => {
    await expect(validate(plainToInstance(dto, validBody))).resolves.toHaveLength(0);

    for (const takeoverToken of [null, '', '   ', '\t\n', 42, false]) {
      const errors = await validate(plainToInstance(dto, { ...validBody, takeoverToken }));
      expect(errors.map(({ property }) => property)).toContain('takeoverToken');
    }

    const validTokenDto = plainToInstance(dto, { ...validBody, takeoverToken: ' lease-token ' });
    await expect(validate(validTokenDto)).resolves.toHaveLength(0);
    expect(validTokenDto.takeoverToken).toBe(' lease-token ');
  });
});
