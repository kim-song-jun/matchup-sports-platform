import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTournamentDto, UpdateTournamentDto } from './admin-tournament.dto';

describe('대회 이미지 입력 계약', () => {
  it('생성/수정에서 두 이미지와 false를 whitelist로 보존한다', async () => {
    for (const payload of [
      plainToInstance(CreateTournamentDto, { sportId: '00000000-0000-4000-8000-000000000001', title: '대회', teamCount: 8, listImageUrl: '/uploads/list.webp', coverImageUrl: '/uploads/detail.webp', showDetailImage: false }),
      plainToInstance(UpdateTournamentDto, { expectedVersion: '2026-10-22T00:00:00.000Z', listImageUrl: null, showDetailImage: false }),
    ]) {
      expect(await validate(payload, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
      expect(payload.showDetailImage).toBe(false);
    }
  });
  it('문자열 boolean과 너무 긴 목록 이미지 URL은 거절한다', async () => {
    const payload = plainToInstance(UpdateTournamentDto, { expectedVersion: '2026-10-22T00:00:00.000Z', showDetailImage: 'false', listImageUrl: 'x'.repeat(1001) });
    expect((await validate(payload)).map((error) => error.property).sort()).toEqual(['listImageUrl', 'showDetailImage']);
  });
});
