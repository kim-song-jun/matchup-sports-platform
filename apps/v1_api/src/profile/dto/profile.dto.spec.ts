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