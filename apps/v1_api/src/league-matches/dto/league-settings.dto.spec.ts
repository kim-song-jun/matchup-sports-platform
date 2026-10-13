import { createGlobalValidationPipe } from '../../common/global-validation-pipe';
import { UpdateLeagueSettingsDto } from './league-settings.dto';

const body = { expectedUpdatedAt: '2026-10-13T00:00:00Z', title: '  리그 이름  ', rulesText: '', regionId: 'district', startsOn: '2098-01-01T00:00:00+09:00', endsOn: '2098-12-31T00:00:00+09:00', registrationDeadlineAt: null };
const parse = (input: object) => createGlobalValidationPipe().transform(input, { type: 'body', metatype: UpdateLeagueSettingsDto });
describe('리그 수정 HTTP DTO', () => {
  it('전체 스냅샷의 빈 설명·null 마감을 허용하고 제목 공백을 제거한다', async () => {
    expect(await parse(body)).toMatchObject({ title: '리그 이름', rulesText: '', registrationDeadlineAt: null });
  });
  it.each(Object.keys(body))('필수 %s 누락을 거절한다', async key => {
    const incomplete = { ...body } as Record<string, unknown>;
    delete incomplete[key];
    await expect(parse(incomplete)).rejects.toThrow();
  });
  it.each([{ title: '   ' }, { title: null }, { rulesText: null }, { startsOn: 'wrong' }, { expectedUpdatedAt: 'wrong' }, { regionId: '' }, { registrationDeadlineAt: '' }, { teamCount: 8 }, { uiOnly: true }])('잘못된 필드/화면 전용 필드를 거절한다: %j', async changes => {
    await expect(parse({ ...body, ...changes })).rejects.toThrow();
  });
});
