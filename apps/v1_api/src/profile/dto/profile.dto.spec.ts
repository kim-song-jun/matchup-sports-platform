import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProfileDto } from './profile.dto';

describe('UpdateProfileDto', () => {
  it('allows an empty real name and phone while keeping nickname and gender required', async () => {
    const dto = plainToInstance(UpdateProfileDto, {
      realName: null,
      nickname: '러너01',
      email: null,
      phone: null,
      birthDate: null,
      profileImageUrl: null,
      gender: 'female',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  /**
   * 이 검증이 사라지면 남의 주소를 계정에 심어 두는 비용이 0 이 된다. 근본 차단은 소셜 링크
   * 쪽 게이트(auth.service.ts 의 assertLinkableByEmail)이지만, 형식조차 안 보면 그 게이트가
   * 막아야 할 시도 자체가 늘어난다.
   */
  it('rejects an email that is not an address', async () => {
    for (const email of ['not-an-email', 'a@', '@example.com', 'a b@example.com']) {
      const dto = plainToInstance(UpdateProfileDto, { nickname: '러너01', gender: 'female', email });
      const errors = await validate(dto);
      expect(errors.some((error) => error.property === 'email')).toBe(true);
    }
  });

  it('still accepts a real address, and null to clear it', async () => {
    for (const email of ['runner@example.com', null]) {
      const dto = plainToInstance(UpdateProfileDto, { nickname: '러너01', gender: 'female', email });
      const errors = await validate(dto);
      expect(errors.some((error) => error.property === 'email')).toBe(false);
    }
  });

  it('rejects a missing gender', async () => {
    const dto = plainToInstance(UpdateProfileDto, { nickname: '러너01' });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'gender')).toBe(true);
  });
  it('temporarily accepts deprecated displayName from a pre-realName client', async () => {
    const dto = plainToInstance(UpdateProfileDto, {
      displayName: '기존 클라이언트 이름',
      nickname: '러너01',
      gender: 'male',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });
});