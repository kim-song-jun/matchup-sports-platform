import 'reflect-metadata';
import { createGlobalValidationPipe } from '../../common/global-validation-pipe';
import { UpdateLeagueCoverImageDto } from './league-cover-image.dto';

const metadata = { type: 'body' as const, metatype: UpdateLeagueCoverImageDto };
const parse = (body: unknown) =>
  createGlobalValidationPipe().transform(body, metadata) as Promise<UpdateLeagueCoverImageDto>;

describe('UpdateLeagueCoverImageDto (전역 ValidationPipe 경로)', () => {
  it.each(['/uploads/2026/10/x.webp', null])('%p 는 통과한다(null 은 제거)', async (coverImageUrl) => {
    await expect(parse({ coverImageUrl })).resolves.toMatchObject({ coverImageUrl });
  });

  it.each([
    ['키 누락', {}],
    ['빈 문자열', { coverImageUrl: '' }],
    ['외부 URL', { coverImageUrl: 'https://cdn.example.com/a.png' }],
    ['javascript:', { coverImageUrl: 'javascript:alert(1)' }],
    ['.. 세그먼트', { coverImageUrl: '/uploads/../a' }],
    ['.private', { coverImageUrl: '/uploads/.private/x.png' }],
    ['쿼리', { coverImageUrl: '/uploads/a.webp?x=1' }],
    ['해시', { coverImageUrl: '/uploads/a.webp#h' }],
    ['빈 세그먼트', { coverImageUrl: '/uploads//a.webp' }],
    ['끝 슬래시', { coverImageUrl: '/uploads/a/' }],
    ['%22', { coverImageUrl: '/uploads/a%22.webp' }],
    ['1001자', { coverImageUrl: `/uploads/${'a'.repeat(992)}` }],
    ['숫자', { coverImageUrl: 5 }],
    ['모르는 필드', { coverImageUrl: null, extra: 1 }],
  ])('%s 는 400 VALIDATION_ERROR', async (_label, body) => {
    await expect(parse(body)).rejects.toMatchObject({ status: 400, response: { code: 'VALIDATION_ERROR' } });
  });

  it('1000자 경계는 통과한다', async () => {
    const url = `/uploads/${'a'.repeat(991)}`;
    expect(url).toHaveLength(1000);
    await expect(parse({ coverImageUrl: url })).resolves.toMatchObject({ coverImageUrl: url });
  });
});
