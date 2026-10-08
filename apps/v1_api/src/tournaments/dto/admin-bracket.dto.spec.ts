import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FixtureGoalDto, CreateGroupDto, CreateGroupTeamDto, UpdateFixtureDto, TOURNAMENT_GROUP_PHASES } from './admin-bracket.dto';

describe('UpdateFixtureDto 번호 계약', () => {
  it('실제 whitelist 설정에서 새 번호를 받는다', async () => {
    expect(await validate(plainToInstance(UpdateFixtureDto, { fixtureNumber: 7 }), { whitelist: true, forbidNonWhitelisted: true })).toHaveLength(0);
  });
  it.each([null, 0, -1, 1.5, 2147483648, true, '7'])('잘못된 번호 %s를 거절한다', async (fixtureNumber) => {
    const errors = await validate(plainToInstance(UpdateFixtureDto, { fixtureNumber }), { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.some((error) => error.property === 'fixtureNumber')).toBe(true);
  });
  it('생략은 허용한다', async () => {
    expect(await validate(plainToInstance(UpdateFixtureDto, {}))).toHaveLength(0);
  });
});

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

describe('12강·16강·8강 입력 계약', () => {
  it.each(['round12', 'round16', 'quarter'])('%s를 정식 단계로 받는다', async (phase) => {
    expect(await validate(plainToInstance(CreateGroupDto, { name: '결선', phase }))).toHaveLength(0);
  });
  it('모르는 단계는 거절한다', async () => {
    const errors = await validate(plainToInstance(CreateGroupDto, { name: '결선', phase: 'round32' }));
    expect(errors.some((error) => error.property === 'phase')).toBe(true);
  });
  it('단계 목록은 DB enum 순서와 같다', () => {
    expect(TOURNAMENT_GROUP_PHASES).toEqual(['group', 'round16', 'round12', 'quarter', 'semi', 'final', 'third_place']);
  });
  it('부전승은 boolean만 받는다', async () => {
    const errors = await validate(plainToInstance(CreateGroupTeamDto, { groupId: '00000000-0000-4000-8000-000000000001', registrationId: '00000000-0000-4000-8000-000000000002', isBye: 'true' }));
    expect(errors.some((error) => error.property === 'isBye')).toBe(true);
  });
});
