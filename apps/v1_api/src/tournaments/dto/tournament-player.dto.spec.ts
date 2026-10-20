import { validateSync } from 'class-validator';
import { AddPlayerDto } from './tournament-player.dto';

describe('AddPlayerDto — 골레이 입력 계약', () => {
  const dto = (goalkeeper: unknown) => Object.assign(new AddPlayerDto(), {
    userId: '10000000-0000-4000-8000-000000000001', realName: '테스트 선수', goalkeeper,
  });
  it.each([true, false, undefined])('%s를 허용한다', (value) => {
    expect(validateSync(dto(value), { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
  });
  it.each([null, 'true', 'false', 0, 1])('%s를 거부한다', (value) => {
    expect(validateSync(dto(value), { whitelist: true, forbidNonWhitelisted: true }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ property: 'goalkeeper' })]));
  });
});
