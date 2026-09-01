import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { publicAssetPath } from '@/lib/assets';
import type { V1TournamentListItem } from '@/types/api';
import { TournamentCard } from './tournament-card';

function buildItem(overrides: Partial<V1TournamentListItem> = {}): V1TournamentListItem {
  return {
    id: 'tournament-1',
    sportId: 'sport-futsal',
    sport: { code: 'futsal', name: '풋살' },
    title: '2026 서울 풋살 오픈',
    status: 'open',
    format: 'knockout',
    registrationDeadlineAt: null,
    scheduledAt: null,
    scheduledEndAt: null,
    venue: null,
    coverImageUrl: null,
    teamCount: 16,
    genderCategory: 'mixed',
    entryFee: 0,
    prizePool: null,
    prizeSummary: null,
    prizeBreakdown: null,
    promoHomeEnabled: false,
    promoHomeTitle: null,
    promoHomeSubtitle: null,
    promoHomeImageUrl: null,
    promoHomeBadgeText: null,
    promoHomeDateText: null,
    promoHomeTeamsText: null,
    promoHomeLocationText: null,
    promoHomePrizeText: null,
    promoHomePriority: 0,
    promoListEnabled: false,
    promoListTitle: null,
    promoListSubtitle: null,
    promoListImageUrl: null,
    promoListBadgeText: null,
    promoListDateText: null,
    promoListTeamsText: null,
    promoListLocationText: null,
    promoListPrizeText: null,
    promoListPriority: 0,
    confirmedCount: 0,
    pendingPaymentCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as V1TournamentListItem;
}

describe('TournamentCard — 커버 이미지 fallback', () => {
  it('renders a sport-glyph SVG fallback (no <img>) when coverImageUrl is missing', () => {
    const { container } = render(<TournamentCard item={buildItem({ coverImageUrl: null })} />);

    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('still renders the real <img> when coverImageUrl is present (regression guard)', () => {
    const { container } = render(
      <TournamentCard item={buildItem({ coverImageUrl: '/uploads/cover-real.jpg' })} />,
    );

    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', publicAssetPath('/uploads/cover-real.jpg'));
  });

  it('falls back to promoHomeImageUrl when coverImageUrl is missing but a promo photo exists', () => {
    const { container } = render(
      <TournamentCard
        item={buildItem({ coverImageUrl: null, promoHomeImageUrl: '/uploads/promo-home.jpg' })}
      />,
    );

    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', publicAssetPath('/uploads/promo-home.jpg'));
  });

  it('prefers coverImageUrl over promoHomeImageUrl when both are present', () => {
    const { container } = render(
      <TournamentCard
        item={buildItem({
          coverImageUrl: '/uploads/cover-real.jpg',
          promoHomeImageUrl: '/uploads/promo-home.jpg',
        })}
      />,
    );

    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', publicAssetPath('/uploads/cover-real.jpg'));
  });

  it('renders the sport-glyph fallback when neither coverImageUrl nor promoHomeImageUrl exist', () => {
    const { container } = render(
      <TournamentCard item={buildItem({ coverImageUrl: null, promoHomeImageUrl: null })} />,
    );

    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('shows the tournament gender category without guessing for legacy rows', () => {
    const { rerender } = render(
      <TournamentCard item={buildItem({ genderCategory: 'female' })} />,
    );

    expect(screen.getByLabelText('성별 카테고리: 여성부')).toBeInTheDocument();
    rerender(<TournamentCard item={buildItem({ genderCategory: null })} />);
    expect(screen.getByLabelText('성별 카테고리: 성별 구분 없음')).toBeInTheDocument();
  });
});

/**
 * **정원은 대회에만 있다 — 리그 카드에 쓰레기 값이 뜨지 않는지 본다.**
 *
 * 거울 행은 `v1_tournaments` 에 살고 `team_count` 가 `@default(8)` 이라, 서버가 생략하지
 * 않으면 리그 카드에 **"8팀"** 이 뜬다(alpha 실측: 리그 4개 전부 8, 실제 참가는 2팀).
 * 그리고 정원 진행바는 리그에서 **항상 100%** 로 보인다 — 리그 목록이 같은 이유로 이미
 * 진행바를 포기했다(`league-matches-list-client.tsx:200`).
 *
 * 그래서 **문자열이 아니라 컨테이너(진행바)의 부재**로 단언한다. 문자열 부재만 보면
 * "무엇이 있으면 안 되는지" 를 안 보게 된다.
 */
describe('TournamentCard — 리그는 정원을 그리지 않는다', () => {
  /** 리그 거울: 서버가 `teamCount` 를 생략하고 `kind` 로 종류를 말한다. */
  const leagueItem = () => {
    const item = buildItem({ kind: 'regular_league', confirmedCount: 2 });
    delete (item as { teamCount?: number }).teamCount;
    return item;
  };

  it('리그 카드에 정원 진행바가 없다', () => {
    render(<TournamentCard item={leagueItem()} />);
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('대회 카드에는 정원 진행바가 있다 — 대조군', () => {
    // 이 대조군이 없으면 진행바를 통째로 지워도 위 테스트가 통과한다.
    render(<TournamentCard item={buildItem({ teamCount: 16, confirmedCount: 4 })} />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('리그 카드는 참가 팀 수를 confirmedCount 로 적는다 — "/정원" 이 없다', () => {
    const { container } = render(<TournamentCard item={leagueItem()} />);
    const text = (container.textContent ?? '').replace(/\s+/g, ' ');
    expect(text).toContain('2');
    expect(text).toContain('팀 참가');
    // 스키마 기본값 8 이 새어 나오면 여기서 잡힌다.
    expect(text).not.toContain('8');
    expect(text).not.toContain('팀 확정');
  });

  it('대회 카드는 확정/정원을 적는다 — 대조군', () => {
    const { container } = render(<TournamentCard item={buildItem({ teamCount: 16, confirmedCount: 4 })} />);
    const text = (container.textContent ?? '').replace(/\s+/g, ' ');
    expect(text).toContain('16');
    expect(text).toContain('팀 확정');
    expect(text).not.toContain('팀 참가');
  });
});

/**
 * 한 목록에 대회와 리그가 섞이면 **어느 쪽인지 카드에서 보여야 한다.**
 * 상태 배지(모집중·진행중·종료)는 두 종류가 글자까지 같아서 구분에 못 쓴다.
 */
describe('TournamentCard — 통합 목록에서 리그를 알아볼 수 있다', () => {
  const leagueItem = () => {
    const item = buildItem({ kind: 'regular_league', confirmedCount: 2 });
    delete (item as { teamCount?: number }).teamCount;
    return item;
  };

  it('리그 카드에 "리그" 배지가 있다', () => {
    render(<TournamentCard item={leagueItem()} />);
    expect(screen.getByLabelText('정규 리그')).toBeInTheDocument();
  });

  it('대회 카드에는 "리그" 배지가 없다 — 대조군', () => {
    render(<TournamentCard item={buildItem({ teamCount: 16, confirmedCount: 4 })} />);
    expect(screen.queryByLabelText('정규 리그')).toBeNull();
  });

  /**
   * 리그 거울은 `genderCategory` 를 채우는 경로가 없어 항상 null 이고, 그러면 라벨이
   * "성별 구분 없음" 으로 떨어진다 — 모든 리그 카드에 같은 배지가 하나씩 더 붙는다.
   * 정원(`teamCount`) 을 뺀 것과 같은 이유로 이 자리도 안 그린다.
   */
  it('리그 카드에 성별 배지를 그리지 않는다', () => {
    render(<TournamentCard item={leagueItem()} />);
    expect(screen.queryByLabelText(/^성별 카테고리:/)).toBeNull();
  });

  it('대회 카드에는 성별 배지가 있다 — 대조군', () => {
    render(<TournamentCard item={buildItem({ teamCount: 16, confirmedCount: 4 })} />);
    expect(screen.getByLabelText(/^성별 카테고리:/)).toBeInTheDocument();
  });

  /**
   * **`isLeagueCompetition` 을 여기 쓰면 이 테스트가 red 가 된다.**
   * ```
   * 리그 방식 대회   format='league'  kind='regular_tournament'   ← 진짜 대회 (alpha 실측 7건)
   * 정규 리그 시즌   kind='regular_league'                        ← 거울 행
   * isLeagueCompetition   둘 다 true
   * ```
   * 그 헬퍼는 *"리그처럼 그릴까"* 에 답한다 — 리그 방식 대회도 순위표를 쓰므로 맞다.
   * 하지만 *"정원·성별 데이터가 있나"* 는 **무엇인가**의 질문이고, 리그 방식 대회는
   * 진짜 대회라 둘 다 있다. 배지를 헬퍼로 고르면 **대회를 리그라고 말하게 된다.**
   */
  it('리그 방식으로 치르는 대회는 리그가 아니다 — 배지도 정원도 대회 그대로', () => {
    render(
      <TournamentCard
        item={buildItem({ format: 'league', kind: 'regular_tournament', teamCount: 16, confirmedCount: 4 })}
      />,
    );
    expect(screen.queryByLabelText('정규 리그')).toBeNull();
    expect(screen.getByLabelText(/^성별 카테고리:/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
});
