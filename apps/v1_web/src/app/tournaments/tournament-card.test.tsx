import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    kind: 'regular_tournament',
    registrationDeadlineAt: null,
    scheduledAt: null,
    scheduledEndAt: null,
    venue: null,
    coverImageUrl: null,
    teamCount: 16,
    genderCategory: 'mixed',
    entryFee: 0,
    entryFeeConfigured: true,
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
    campaignSlug: null,
    confirmedCount: 0,
    pendingPaymentCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('TournamentCard — 신청 마감 계약', () => {
  const deadline = '2026-10-08T00:00:00.000Z';

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    { condition: '마감 직전', now: '2026-10-07T23:59:59.999Z', overrides: {}, expected: '모집 중' },
    { condition: '마감과 같은 시각', now: deadline, overrides: {}, expected: '모집 중' },
    { condition: '마감 직후', now: '2026-10-08T00:00:00.001Z', overrides: {}, expected: '모집 마감' },
    { condition: '마감 후 정원이 거의 찬 대회', now: '2026-10-08T00:00:00.001Z', overrides: { confirmedCount: 5 }, expected: '모집 마감' },
    { condition: '마감 전 정원이 거의 찬 대회', now: '2026-10-07T23:59:59.999Z', overrides: { confirmedCount: 5 }, expected: '거의 마감' },
    { condition: '마감 전 정원이 찬 대회', now: '2026-10-07T23:59:59.999Z', overrides: { confirmedCount: 6 }, expected: '모집 마감' },
    { condition: '마감 전 대기 팀으로 정원이 찬 대회', now: '2026-10-07T23:59:59.999Z', overrides: { pendingPaymentCount: 6 }, expected: '모집 마감' },
    { condition: '정원이 0인 대회', now: deadline, overrides: { teamCount: 0 }, expected: '모집 마감' },
    { condition: '마감을 정하지 않은 대회', now: '2026-10-08T00:00:00.001Z', overrides: { registrationDeadlineAt: null }, expected: '모집 중' },
    { condition: '마감 후 준비 중인 대회', now: '2026-10-08T00:00:00.001Z', overrides: { status: 'draft' }, expected: '준비 중' },
    { condition: '마감 후 닫힌 대회', now: '2026-10-08T00:00:00.001Z', overrides: { status: 'closed' }, expected: '모집 마감' },
    { condition: '마감 후 진행 중인 대회', now: '2026-10-08T00:00:00.001Z', overrides: { status: 'in_progress' }, expected: '진행 중' },
    { condition: '마감 후 종료된 대회', now: '2026-10-08T00:00:00.001Z', overrides: { status: 'completed' }, expected: '종료' },
    { condition: '마감 후 취소된 대회', now: '2026-10-08T00:00:00.001Z', overrides: { status: 'cancelled' }, expected: '취소' },
  ] as const)('$condition일 때 배지와 링크 이름은 $expected예요', ({ now, overrides, expected }) => {
    // Given: #48 API의 모집 상태·마감·정원이며 시간만 경계별로 고정한다.
    vi.setSystemTime(new Date(now));
    const item = buildItem({
      id: '363a481c-9b33-446f-b848-c78bd1d0ad7d',
      title: '(테스트) 제2회 BUFF 백석대',
      teamCount: 6,
      registrationDeadlineAt: deadline,
      ...overrides,
    });

    // When: 실제 목록이 소비하는 카드와 공유 UI를 렌더한다.
    render(<TournamentCard item={item} />);

    // Then: 보이는 배지와 스크린리더의 링크 이름이 같은 신청 상태를 말한다.
    expect(screen.getByText(expected, { exact: true })).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAccessibleName(`${item.title} — 풋살 — ${expected}`);
  });
});

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
 * 진행바를 포기했다(리그 전용 목록이 같은 이유로 같은 선택을 했었다 — 그 화면은
 * 통합 목록으로 흡수돼 사라졌다).
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
 * #7 (실사용자 발견 버그, 2026-09-19): 정원이 이미 다 찬 대회는 관리자가 아직 상태를
 * '마감'으로 바꾸지 않았어도 상단 배지가 하단 정원 표시와 어긋나면 안 된다.
 */
describe('TournamentCard — 정원이 다 찼으면 상태가 open이어도 마감 배지를 보여준다', () => {
  it('정원이 가득 찼는데 status는 아직 open이면 "모집 중"을 보여주지 않는다', () => {
    const { container } = render(
      <TournamentCard item={buildItem({ status: 'open', teamCount: 4, confirmedCount: 4 })} />,
    );
    const text = (container.textContent ?? '').replace(/\s+/g, ' ');
    expect(text).not.toContain('모집 중');
  });

  it('입금대기 팀까지 합쳐 정원이 찼어도 마감으로 본다', () => {
    const { container } = render(
      <TournamentCard
        item={buildItem({ status: 'open', teamCount: 4, confirmedCount: 2, pendingPaymentCount: 2 })}
      />,
    );
    const text = (container.textContent ?? '').replace(/\s+/g, ' ');
    expect(text).not.toContain('모집 중');
  });

  it('정원이 남아 있으면 그대로 "모집 중"을 보여준다 — 대조군', () => {
    const { container } = render(
      <TournamentCard item={buildItem({ status: 'open', teamCount: 4, confirmedCount: 2 })} />,
    );
    const text = (container.textContent ?? '').replace(/\s+/g, ' ');
    expect(text).toContain('모집 중');
  });

  it('리그는 정원 개념이 없어 이 분기를 타지 않는다 — status 그대로', () => {
    const item = buildItem({ kind: 'regular_league', status: 'open', confirmedCount: 2 });
    delete (item as { teamCount?: number }).teamCount;
    const { container } = render(<TournamentCard item={item} />);
    const text = (container.textContent ?? '').replace(/\s+/g, ' ');
    expect(text).toContain('모집 중');
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

describe('TournamentCard — 모집 상태와 하단 정보', () => {
  it.each([
    { status: 'open', confirmedCount: 14, pendingPaymentCount: 1, expected: '모집 중' },
    { status: 'open', confirmedCount: 11, pendingPaymentCount: 5, expected: '거의 마감' },
    { status: 'open', confirmedCount: 16, pendingPaymentCount: 0, expected: '거의 마감' },
    { status: 'open', confirmedCount: 19, pendingPaymentCount: 0, expected: '거의 마감' },
    { status: 'open', confirmedCount: 15, pendingPaymentCount: 5, expected: '모집 마감' },
    { status: 'closed', confirmedCount: 4, pendingPaymentCount: 0, expected: '모집 마감' },
    { status: 'in_progress', confirmedCount: 18, pendingPaymentCount: 0, expected: '진행 중' },
    { status: 'completed', confirmedCount: 20, pendingPaymentCount: 0, expected: '종료' },
    { status: 'cancelled', confirmedCount: 18, pendingPaymentCount: 0, expected: '취소' },
  ] as const)('$status · 확정 $confirmedCount + 대기 $pendingPaymentCount → $expected', ({ expected, ...values }) => {
    render(<TournamentCard item={buildItem({ ...values, teamCount: 20 })} />);
    expect(screen.getByRole('link')).toHaveAccessibleName(expect.stringContaining(`— ${expected}`));
    expect(screen.getAllByText(expected, { exact: true })).toHaveLength(1);
    if (expected !== '거의 마감') expect(screen.queryByText('거의 마감')).not.toBeInTheDocument();
  });

  it('확정과 입금 대기 수를 나눈 예약 현황과 금액을 표시하고 막대는 하나만 유지한다', () => {
    render(<TournamentCard item={buildItem({ entryFee: 300000, confirmedCount: 11, pendingPaymentCount: 5, teamCount: 20 })} />);
    expect(screen.getByText('참가비', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('300,000원', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('11 + 5 / 20 팀 예약', { exact: true })).toBeInTheDocument();
    expect(screen.queryByText('16/20팀 예약', { exact: true })).not.toBeInTheDocument();
    expect(screen.getByText('입금대기 5팀', { exact: true })).toBeInTheDocument();
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
  });

  it('대기 팀이 없으면 대기 안내 없이 확정 수만 보여준다', () => {
    render(<TournamentCard item={buildItem({ confirmedCount: 8, pendingPaymentCount: 0, teamCount: 20 })} />);
    expect(screen.getByText('8/20팀 확정', { exact: true })).toBeInTheDocument();
    expect(screen.queryByText(/(?:입금|확인)대기/)).not.toBeInTheDocument();
  });

  it('무료 대회에는 입금대기 대신 확인대기를 표시한다', () => {
    render(<TournamentCard item={buildItem({ entryFee: 0, confirmedCount: 11, pendingPaymentCount: 5, teamCount: 20 })} />);
    expect(screen.getByText('무료', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('확인대기 5팀', { exact: true })).toBeInTheDocument();
    expect(screen.queryByText(/입금대기/)).not.toBeInTheDocument();
  });
});

describe('TournamentCard — 참가비 표시', () => {
  it('미설정 리그는 "무료" 도 참가비 블록도 그리지 않고, 정원 요약은 남는다', () => {
    render(
      <TournamentCard
        item={buildItem({ kind: 'regular_league', entryFee: 0, entryFeeConfigured: false, teamCount: 8, confirmedCount: 3 })}
      />,
    );

    const footer = screen.getByTestId('tournament-card-footer');
    expect(footer).not.toHaveTextContent('참가비');
    expect(footer).not.toHaveTextContent('무료');
    expect(footer).toHaveTextContent('3/8팀 확정');
  });

  it('설정된 리그는 금액을, 0원 확정이면 "무료" 를 그린다', () => {
    const { rerender } = render(
      <TournamentCard item={buildItem({ kind: 'regular_league', entryFee: 80000, entryFeeConfigured: true })} />,
    );
    expect(screen.getByTestId('tournament-card-footer')).toHaveTextContent('참가비80,000원');

    rerender(<TournamentCard item={buildItem({ kind: 'regular_league', entryFee: 0, entryFeeConfigured: true })} />);
    expect(screen.getByTestId('tournament-card-footer')).toHaveTextContent('참가비무료');
  });

  it('대조군: 대회는 무료든 유료든 참가비를 그대로 그린다', () => {
    const { rerender } = render(<TournamentCard item={buildItem({ kind: 'regular_tournament', entryFee: 0 })} />);
    expect(screen.getByTestId('tournament-card-footer')).toHaveTextContent('참가비무료');

    rerender(<TournamentCard item={buildItem({ kind: 'regular_tournament', entryFee: 30000 })} />);
    expect(screen.getByTestId('tournament-card-footer')).toHaveTextContent('참가비30,000원');
  });
});
