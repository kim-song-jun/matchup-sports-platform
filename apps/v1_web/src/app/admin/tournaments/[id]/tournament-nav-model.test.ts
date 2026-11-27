import { describe, expect, it } from 'vitest';
import type { V1TournamentStatus } from '@/types/api';
import { buildTournamentNav, type TournamentNavInput } from './tournament-nav-model';

const input = (overrides: Partial<TournamentNavInput> = {}): TournamentNavInput => ({
  id: 'tournament-1',
  status: 'open',
  staffSurface: false,
  restricted: false,
  localPopups: false,
  ...overrides,
});

const tabSlugs = (value: TournamentNavInput) => buildTournamentNav(value).tabs.map((tab) => tab.slug);
const moreOf = (value: TournamentNavInput) =>
  buildTournamentNav(value).more.map((group) => [group.label, group.items.map((item) => item.slug)]);

describe('buildTournamentNav', () => {
  it.each(['draft', 'open', 'closed', 'cancelled'] as V1TournamentStatus[])(
    '%s 는 탭 [개요,신청,대진,공지,대회 정보] 이고 시상·리뷰·통계는 더보기「대회 후」에 있다',
    (status) => {
      const nav = buildTournamentNav(input({ status }));
      expect(nav.tabs.map((tab) => tab.label)).toEqual(['개요', '신청', '대진', '공지', '대회 정보']);
      expect(moreOf(input({ status }))).toEqual([
        ['홍보', ['sponsors', 'popups', 'campaign']],
        ['운영', ['discipline']],
        ['대회 후', ['reviews', 'awards', 'statistics']],
      ]);
    },
  );

  it.each(['in_progress', 'completed'] as V1TournamentStatus[])(
    '%s 는 탭 [개요,신청,대진,공지,시상,리뷰 관리,통계] 이고 대회 정보가 더보기「운영」으로 간다(양방향)',
    (status) => {
      const nav = buildTournamentNav(input({ status }));
      expect(nav.tabs.map((tab) => tab.label)).toEqual(['개요', '신청', '대진', '공지', '시상', '리뷰 관리', '통계']);
      expect(nav.tabs.map((tab) => tab.slug)).not.toContain('info');
      expect(moreOf(input({ status }))).toEqual([
        ['홍보', ['sponsors', 'popups', 'campaign']],
        ['운영', ['info', 'discipline']],
      ]);
      // 진행 전 상태에서는 반대로 대회 정보가 탭에 있고 더보기「운영」에는 없다.
      expect(tabSlugs(input({ status: 'open' }))).toContain('info');
      expect(moreOf(input({ status: 'open' })).find(([label]) => label === '운영')?.[1]).not.toContain('info');
    },
  );

  it('팝업은 전역 팝업 화면으로 가는 외부 주소이고 안내 문구가 붙는다', () => {
    const popup = buildTournamentNav(input()).more[0].items.find((item) => item.slug === 'popups');
    expect(popup?.externalHref).toBe(`/admin/content?tab=popups&targetPath=${encodeURIComponent('/tournaments/tournament-1')}`);
    expect(popup?.externalNote).toBe('전역 팝업 화면으로 이동해요');
  });

  it('스태프 면은 팝업·징계 현황이 없고 빈 묶음은 버린다', () => {
    const staff = input({ staffSurface: true });
    expect(moreOf(staff)).toEqual([
      ['홍보', ['sponsors', 'campaign']],
      ['대회 후', ['reviews', 'awards', 'statistics']],
    ]);
    // 진행 중 스태프 면: 「운영」 에는 대회 정보만 남는다.
    expect(moreOf({ ...staff, status: 'in_progress' })).toEqual([
      ['홍보', ['sponsors', 'campaign']],
      ['운영', ['info']],
    ]);
  });

  it('공개 샘플은 징계 현황이 없고 팝업이 외부 주소 없이 샘플 경로 슬러그다', () => {
    const sample = input({ restricted: true, localPopups: true });
    const groups = buildTournamentNav(sample).more;
    expect(groups.map((group) => group.label)).toEqual(['홍보', '대회 후']);
    const popup = groups[0].items.find((item) => item.slug === 'popups');
    expect(popup).toEqual({ slug: 'popups', label: '팝업' });
  });

  it('건수는 0 이거나 없으면 count 가 없다', () => {
    const counted = buildTournamentNav(input({ counts: { registrations: 3, fixtures: 0, announcements: 12 } })).tabs;
    expect(counted.find((tab) => tab.slug === 'registrations')?.count).toBe(3);
    expect(counted.find((tab) => tab.slug === 'bracket')).not.toHaveProperty('count');
    expect(counted.find((tab) => tab.slug === 'announcements')?.count).toBe(12);
    expect(counted.find((tab) => tab.slug === 'overview')).not.toHaveProperty('count');
    for (const tab of buildTournamentNav(input()).tabs) expect(tab).not.toHaveProperty('count');
  });
});
