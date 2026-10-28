import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GameCommandDto } from './game-command.dto';

const validCommand = {
  expectedVersion: 0,
  clientCommandId: 'command-1',
  occurredAt: '2026-10-28T00:00:00.000Z',
  payload: {},
};

describe('GameCommandDto takeover token transport contract', () => {
  it('allows omission so source authorization can decide whether a lease is required', async () => {
    await expect(validate(plainToInstance(GameCommandDto, validCommand))).resolves.toHaveLength(0);
  });

  it.each([null, '', '   ', '\t\n', 42, false])('rejects a provided invalid takeoverToken (%p)', async (takeoverToken) => {
    const errors = await validate(plainToInstance(GameCommandDto, { ...validCommand, takeoverToken }));
    expect(errors.map(({ property }) => property)).toContain('takeoverToken');
  });

  it('accepts a provided nonempty token for leased sources', async () => {
    const dto = plainToInstance(GameCommandDto, { ...validCommand, takeoverToken: ' lease-token ' });
    await expect(
      validate(dto),
    ).resolves.toHaveLength(0);
    expect(dto.takeoverToken).toBe(' lease-token ');
  });
});
