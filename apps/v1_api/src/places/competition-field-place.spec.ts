import { BadRequestException, NotFoundException } from '@nestjs/common';
import { assertFieldPlaceInput, fieldPlaceForMatch, registerCompetitionPlace, resolveCompetitionFieldPlace, tournamentFieldPlace } from './competition-field-place';
import type { PlaceSnapshot } from './place-snapshot';

const pinned: PlaceSnapshot = { name: '상암 구장', address: '서울 상암동', latitude: 37.5, longitude: 126.9,
  provider: 'kakao', providerPlaceId: 'synthetic-place' };
describe('competition field selection', () => {
  it('등록된 경기장의 전체 장소 스냅샷을 사용한다', () => {
    expect(tournamentFieldPlace({ name: 'A필드', placeSnapshot: { ...pinned } })).toEqual({ ...pinned, name: 'A필드' });
  });
  it('이름만 등록된 필드에는 지도 핀을 만들지 않는다', () => {
    expect(tournamentFieldPlace({ name: 'A필드' })).toEqual({ name: 'A필드', address: null, latitude: null,
      longitude: null, provider: null, providerPlaceId: null });
  });
  it('이름으로 가져온 필드가 현재 장소와 같으면 경기의 기존 주소와 핀을 보존한다', () => {
    expect(fieldPlaceForMatch({ name: ' 상암 구장 ', active: true, placeSnapshot: { ...pinned, latitude: 38 } }, pinned)).toEqual(pinned);
  });
  it('다른 이름의 경기장으로 변경하면 이전 좌표를 섞지 않는다', () => {
    expect(fieldPlaceForMatch({ name: 'B구장', active: true }, pinned)).toEqual({ name: 'B구장', address: null,
      latitude: null, longitude: null, provider: null, providerPlaceId: null });
  });
  it('비활성 필드를 거절한다', () => {
    expect(() => fieldPlaceForMatch({ name: 'A', active: false }, null)).toThrow(BadRequestException);
  });
  it('다른 대회의 필드를 선택할 수 없다', async () => {
    const tx = { $queryRaw: jest.fn(async () => []), v1TournamentField: { findFirst: jest.fn(async ({ where }: { where: { tournamentId: string } }) =>
      where.tournamentId === 'other-competition' ? { name: 'A', active: true } : null) } };
    await expect(resolveCompetitionFieldPlace(tx as never, 'mine', 'other-field', null)).rejects.toThrow(NotFoundException);
  });
  it('허용된 선택의 스냅샷을 실제로 반환한다', async () => {
    const tx = { $queryRaw: jest.fn(async () => []), v1TournamentField: { findFirst: jest.fn(async () => ({ name: 'A', active: true, placeSnapshot: { ...pinned } })) } };
    await expect(resolveCompetitionFieldPlace(tx as never, 'mine', 'field', null)).resolves.toEqual({ ...pinned, name: 'A' });
  });
  it('같은 필드의 실제 주소는 보존하고 선택 시 이름은 필드 이름으로 통일한다', async () => {
    const tx = { $queryRaw: jest.fn(async () => []), v1TournamentField: {
      findFirst: jest.fn(async () => ({ name: 'A필드', active: true, placeSnapshot: null })),
    } };
    await expect(resolveCompetitionFieldPlace(tx as never, 'mine', 'field-a', pinned, 'field-a')).resolves.toEqual({ ...pinned, name: 'A필드' });
  });
  it('필드 선택과 별도 장소 입력을 섞는 요청은 거절한다', () => {
    expect(() => assertFieldPlaceInput('field', true)).toThrow(BadRequestException);
    expect(() => assertFieldPlaceInput(null, true)).not.toThrow();
    expect(() => assertFieldPlaceInput(undefined, false)).not.toThrow();
  });

  it('직접 장소 입력도 등록 필드로 연결하며 같은 이름의 재저장은 같은 ID를 반환한다', async () => {
    const store: Array<{ id: string; name: string; active: boolean; placeSnapshot: PlaceSnapshot }> = [];
    const tx = { $executeRaw: jest.fn(async () => 1), v1TournamentField: {
      findMany: jest.fn(async () => store), create: jest.fn(async ({ data }: { data: { name: string; placeSnapshot: PlaceSnapshot } }) => {
        const row = { ...data, id: 'field-1', active: true }; store.push(row); return row;
      }),
    } };
    await expect(registerCompetitionPlace(tx as never, 'competition-1', pinned)).resolves.toBe('field-1');
    await expect(registerCompetitionPlace(tx as never, 'competition-1', { ...pinned, name: ' 상암 구장 ' })).resolves.toBe('field-1');
    expect(store).toHaveLength(1);
    expect(store[0].placeSnapshot).toEqual(pinned);
    await expect(registerCompetitionPlace(tx as never, 'competition-1', { ...pinned, address: '다른 주소' })).rejects.toMatchObject({ response: { code: 'FIELD_PLACE_CONFLICT' } });
    await expect(registerCompetitionPlace(tx as never, 'competition-1', { ...pinned, name: '장소 미정' })).resolves.toBeNull();
    expect(store).toHaveLength(1);
  });
});
