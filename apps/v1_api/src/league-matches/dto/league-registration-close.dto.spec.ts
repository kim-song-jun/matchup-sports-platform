import 'reflect-metadata';
import { createGlobalValidationPipe } from '../../common/global-validation-pipe';
import { CloseLeagueRegistrationDto } from './league-registration-close.dto';

const metadata = { type: 'body' as const, metatype: CloseLeagueRegistrationDto };
const parse = (body: unknown) =>
  createGlobalValidationPipe().transform(body, metadata) as Promise<CloseLeagueRegistrationDto>;

describe('CloseLeagueRegistrationDto (전역 ValidationPipe 경로)', () => {
  it('사유는 선택이다', async () => {
    expect((await parse({})).reason).toBeUndefined();
  });

  it('사유는 trim 하고 공백만이면 null 로 만든다', async () => {
    expect((await parse({ reason: ' 정원 마감 ' })).reason).toBe('정원 마감');
    expect((await parse({ reason: '   ' })).reason).toBeNull();
  });

  it('200자는 통과하고 201자·숫자·모르는 필드는 거부한다', async () => {
    await expect(parse({ reason: 'a'.repeat(200) })).resolves.toBeDefined();
    await expect(parse({ reason: 'a'.repeat(201) })).rejects.toMatchObject({ status: 400 });
    await expect(parse({ reason: 5 })).rejects.toMatchObject({ status: 400 });
    await expect(parse({ registrationDeadlineAt: '2030-01-01' })).rejects.toMatchObject({ status: 400 });
  });
});
