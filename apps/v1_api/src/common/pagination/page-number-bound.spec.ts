import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdminUserListQueryDto } from '../../admin/dto/admin.dto';
import { TournamentListQueryDto } from '../../tournaments/dto/tournament-read.dto';
import { ListTournamentReviewsQueryDto } from '../../tournaments/tournament-reviews.service';
import { MAX_PAGE_NUMBER } from './page-args';

// Query strings arrive as text; `@Type(() => Number)` turns '1e308' into an integer that `@IsInt` accepts,
// and `(page - 1) * limit` then overflows to Infinity at the database OFFSET/skip.
const DTOS = [
  ['public tournament list', TournamentListQueryDto],
  ['public tournament reviews', ListTournamentReviewsQueryDto],
  ['admin user list', AdminUserListQueryDto],
] as const;

async function pageErrors(dto: new () => object, page: string): Promise<string[]> {
  const errors = await validate(plainToInstance(dto, { page }));
  return errors.filter((error) => error.property === 'page').map((error) => Object.keys(error.constraints ?? {}).join());
}

describe('page number upper bound', () => {
  it.each(DTOS)('%s rejects a page that would overflow the offset', async (_name, dto) => {
    expect(await pageErrors(dto, '1e308')).toEqual(['max']);
    expect(await pageErrors(dto, String(MAX_PAGE_NUMBER + 1))).toEqual(['max']);
  });

  it.each(DTOS)('%s still accepts ordinary pages up to the bound', async (_name, dto) => {
    expect(await pageErrors(dto, '1')).toEqual([]);
    expect(await pageErrors(dto, String(MAX_PAGE_NUMBER))).toEqual([]);
  });
});
