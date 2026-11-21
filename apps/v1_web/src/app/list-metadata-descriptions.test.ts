import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/matches/matches-client', () => ({ MatchListPageClient: () => null }));
vi.mock('@/components/team-matches/team-matches-client', () => ({ TeamMatchListPageClient: () => null }));
vi.mock('@/components/notices/notices-client', () => ({ NoticeListPageClient: () => null }));

// 검색 결과 스니펫이 의미 있는 문장이 되려면 설명이 한 줄 제목 수준(35~45자)을 넘어야 한다.
const MIN_LIST_DESCRIPTION_LENGTH = 70;

describe('공개 목록 화면의 메타 설명', () => {
  it.each([
    ['개인 매치', () => import('./matches/page')],
    ['팀매치', () => import('./team-matches/page')],
    ['공지사항', () => import('./notices/page')],
    ['이벤트', () => import('./events/layout')],
  ])('%s 목록 설명은 70자 이상이다', async (_label, load) => {
    const { metadata } = await load();
    expect(String(metadata.description).length).toBeGreaterThanOrEqual(MIN_LIST_DESCRIPTION_LENGTH);
  });
});
