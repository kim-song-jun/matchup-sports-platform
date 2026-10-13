import { createGlobalValidationPipe } from '../../common/global-validation-pipe';
import { UpdateLeagueSettingsDto } from './league-settings.dto';

const body = { expectedUpdatedAt: '2026-10-13T00:00:00Z', title: '  리그 이름  ', rulesText: '', regionId: 'district', startsOn: '2098-01-01T00:00:00+09:00', endsOn: '2098-12-31T00:00:00+09:00', registrationDeadlineAt: null, plannedFixtureCount: null };
const parse = (input: object) => createGlobalValidationPipe().transform(input, { type: 'body', metatype: UpdateLeagueSettingsDto });
describe('리그 수정 HTTP DTO', () => {
  it('전체 스냅샷의 빈 설명·null 마감을 허용하고 제목 공백을 제거한다', async () => {
    expect(await parse(body)).toMatchObject({ title: '리그 이름', rulesText: '', registrationDeadlineAt: null, plannedFixtureCount: null });
  });
  it('총 경기 수 1~500을 허용한다', async () => {
    expect(await parse({ ...body, plannedFixtureCount: 1 })).toMatchObject({ plannedFixtureCount: 1 });
    expect(await parse({ ...body, plannedFixtureCount: 500 })).toMatchObject({ plannedFixtureCount: 500 });
  });
  it.each(Object.keys(body).filter(key => key !== 'plannedFixtureCount'))('필수 %s 누락을 거절한다', async key => {
    const incomplete = { ...body } as Record<string, unknown>;
    delete incomplete[key];
    await expect(parse(incomplete)).rejects.toThrow();
  });
  it('이전 화면 호환을 위해 총 경기 수가 빠진 요청도 허용한다', async () => {
    const { plannedFixtureCount: _plannedFixtureCount, ...legacyBody } = body;
    await expect(parse(legacyBody)).resolves.toMatchObject({ title: '리그 이름' });
  });
  it.each([{ title: '   ' }, { title: null }, { rulesText: null }, { startsOn: 'wrong' }, { expectedUpdatedAt: 'wrong' }, { regionId: '' }, { registrationDeadlineAt: '' }, { plannedFixtureCount: 0 }, { plannedFixtureCount: 501 }, { plannedFixtureCount: '3' }, { teamCount: 8 }, { uiOnly: true }])('잘못된 필드/화면 전용 필드를 거절한다: %j', async changes => {
    await expect(parse({ ...body, ...changes })).rejects.toThrow();
  });
});
