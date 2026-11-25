import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdminPushSendDto } from './admin-push-send.dto';

describe('AdminPushSendDto', () => {
  it('accepts a relative in-app url', async () => {
    const dto = plainToInstance(AdminPushSendDto, {
      target: 'user',
      userId: '11111111-1111-4111-8111-111111111111',
      title: '점검 안내',
      url: '/notices/1',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects an absolute external url (open-redirect/phishing risk)', async () => {
    const dto = plainToInstance(AdminPushSendDto, {
      target: 'broadcast',
      title: '전체 공지',
      url: 'https://attacker.example/phish',
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'url')).toBe(true);
  });

  it('rejects a protocol-relative url (e.g. //attacker.example)', async () => {
    const dto = plainToInstance(AdminPushSendDto, {
      target: 'broadcast',
      title: '전체 공지',
      url: '//attacker.example/phish',
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'url')).toBe(true);
  });

  it('rejects a javascript: url', async () => {
    const dto = plainToInstance(AdminPushSendDto, {
      target: 'broadcast',
      title: '전체 공지',
      url: 'javascript:alert(1)',
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'url')).toBe(true);
  });

  it('rejects a backslash-prefixed url that WHATWG URL parsers treat as protocol-relative (open-redirect bypass)', async () => {
    const dto = plainToInstance(AdminPushSendDto, {
      target: 'broadcast',
      title: '전체 공지',
      url: '/\\evil.com',
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'url')).toBe(true);
  });

  it('rejects a url containing a backslash anywhere, not just at the start', async () => {
    const dto = plainToInstance(AdminPushSendDto, {
      target: 'broadcast',
      title: '전체 공지',
      url: '/notices/1\\evil.com',
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'url')).toBe(true);
  });

  describe('성별·대회/리그 대상', () => {
    const competitionId = '11111111-1111-4111-8111-111111111111';
    const props = async (plain: object) => (await validate(plainToInstance(AdminPushSendDto, plain))).map((e) => e.property);

    it('대회·리그 대상은 competitionId(uuid) 가 필수다', async () => {
      expect(await props({ target: 'competition', title: '안내' })).toContain('competitionId');
      expect(await props({ target: 'competition', competitionId: 'not-a-uuid', title: '안내' })).toContain('competitionId');
      expect(await props({ target: 'competition', competitionId, title: '안내' })).toEqual([]);
    });

    it('전체 회원 발송은 competitionId 없이 통과하고, 성별은 male·female 만 받는다', async () => {
      expect(await props({ target: 'broadcast', title: '안내' })).toEqual([]);
      expect(await props({ target: 'broadcast', gender: 'female', title: '안내' })).toEqual([]);
      expect(await props({ target: 'broadcast', gender: 'other', title: '안내' })).toContain('gender');
    });

    it('알 수 없는 대상은 거부한다', async () => {
      expect(await props({ target: 'team', title: '안내' })).toContain('target');
    });
  });
});
