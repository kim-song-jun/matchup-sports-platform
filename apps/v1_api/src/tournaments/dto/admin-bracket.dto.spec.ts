import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FixtureGoalDto } from './admin-bracket.dto';

describe('FixtureGoalDto', () => {
  it('trims playerName before validation', async () => {
    const dto = plainToInstance(FixtureGoalDto, {
      team: 'home',
      playerName: '  홍길동  ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.playerName).toBe('홍길동');
  });

  it('rejects a whitespace-only playerName', async () => {
    const dto = plainToInstance(FixtureGoalDto, {
      team: 'away',
      playerName: '   ',
    });

    const errors = await validate(dto);

    expect(dto.playerName).toBe('');
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'playerName',
          constraints: expect.objectContaining({ isNotEmpty: expect.any(String) }),
        }),
      ]),
    );
  });
});
