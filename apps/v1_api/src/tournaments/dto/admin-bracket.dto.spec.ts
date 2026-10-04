import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FixtureGoalDto, CreateGroupDto, CreateGroupTeamDto } from './admin-bracket.dto';

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

describe('12강·8강 입력 계약', () => {
  it.each(['round12', 'quarter'])('%s를 정식 단계로 받는다', async (phase) => {
    expect(await validate(plainToInstance(CreateGroupDto, { name: '결선', phase }))).toHaveLength(0);
  });
  it('부전승은 boolean만 받는다', async () => {
    const errors = await validate(plainToInstance(CreateGroupTeamDto, { groupId: '00000000-0000-4000-8000-000000000001', registrationId: '00000000-0000-4000-8000-000000000002', isBye: 'true' }));
    expect(errors.some((error) => error.property === 'isBye')).toBe(true);
  });
});
