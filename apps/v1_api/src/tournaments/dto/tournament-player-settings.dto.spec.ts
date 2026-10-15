import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdatePlayerRosterSettingsDto } from './tournament-player.dto';

describe('참가 선수 번호·GK 설정 DTO', () => {
  it.each([{ goalkeeper: true }, { goalkeeper: false, jerseyNumber: 0 }, { jerseyNumber: null }])('허용된 설정 %j', async input => {
    expect(await validate(plainToInstance(UpdatePlayerRosterSettingsDto, input), { whitelist: true, forbidNonWhitelisted: true })).toHaveLength(0);
  });
  it.each([{ goalkeeper: null }, { goalkeeper: 'true' }, { jerseyNumber: -1 }, { jerseyNumber: 100 }, { jerseyNumber: 1.5 }, { eligibilityStatus: 'pro' }])('잘못된 설정은 거절 %j', async input => {
    expect((await validate(plainToInstance(UpdatePlayerRosterSettingsDto, input), { whitelist: true, forbidNonWhitelisted: true })).length).toBeGreaterThan(0);
  });
});
