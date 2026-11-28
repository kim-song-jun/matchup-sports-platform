import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import AdminRecordsCorrections from './records/corrections/page';
import AdminResultReview from './result-review/page';
import StaffRecordsCorrections from '../../../tournament-ops/tournaments/[id]/records/corrections/page';
import StaffResultReview from '../../../tournament-ops/tournaments/[id]/result-review/page';

const args = (query: Record<string, string | string[] | undefined>) => ({
  params: Promise.resolve({ id: 't-1' }),
  searchParams: Promise.resolve(query),
});

/** 옛 결과 검토·정정 주소는 어디서 열든 쿼리를 보존해 「결과」 한 화면으로 간다. */
describe('옛 결과 주소 리다이렉트', () => {
  it.each([
    ['어드민 결과 검토', AdminResultReview],
    ['어드민 결과 정정', AdminRecordsCorrections],
  ])('%s → /admin/live/:id/results', async (_name, Page) => {
    await expect(Page(args({ fixtureId: 'f1', from: 'admin' }))).rejects.toThrow('REDIRECT:/admin/live/t-1/results?fixtureId=f1&from=admin');
  });

  it.each([
    ['스태프 결과 검토', StaffResultReview],
    ['스태프 결과 정정', StaffRecordsCorrections],
  ])('%s → /tournament-ops/tournaments/:id/results', async (_name, Page) => {
    await expect(Page(args({ fixtureId: 'f1', from: 'admin' }))).rejects.toThrow('REDIRECT:/tournament-ops/tournaments/t-1/results?fixtureId=f1&from=admin');
  });

  it('쿼리 없이 열어도 결과 화면으로 간다', async () => {
    await expect(AdminResultReview(args({}))).rejects.toThrow('REDIRECT:/admin/live/t-1/results');
  });
});
