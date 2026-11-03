import { assertLegacyAwardScopes, assertNamedAwardScopes } from './multi-finals-scope';
import type { Prisma } from '@prisma/client';

describe('시상 범위는 실제 대회 방식과 설정을 따른다', () => {
  it.each(['league', 'knockout', 'group_knockout', undefined])('기존 방식 %s는 임의 범위를 새로 만들 수 없다', format => {
    expect(() => assertLegacyAwardScopes(format, ['overall', 'upper', 'lower'])).not.toThrow();
    expect(() => assertLegacyAwardScopes(format, ['존재하지 않는 결선'])).toThrow();
  });
  it('새 방식도 설정에 존재하는 결선 이름만 저장할 수 있다', async () => {
    const tx = { v1Tournament: { findFirst: jest.fn().mockResolvedValue({ format: 'league_knockouts', multiFinals: { finals: [{ name: '챔피언' }, { name: '챌린지' }, { name: '프렌즈' }] } }) } } as unknown as Prisma.TransactionClient;
    expect(() => assertLegacyAwardScopes('league_knockouts', ['프렌즈'])).not.toThrow();
    await expect(assertNamedAwardScopes(tx, 't', ['overall', '프렌즈'])).resolves.toBeUndefined();
    await expect(assertNamedAwardScopes(tx, 't', ['없는 결선'])).rejects.toMatchObject({ response: { code: 'AWARD_TRACK_UNSUPPORTED' } });
  });
});
