import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { V1GameRosterView } from '@/hooks/use-v1-game-roster';
import { disciplineBannerMessages, GameRosterDisciplineBanners } from './game-roster-discipline-banners';

type View = Pick<V1GameRosterView, 'gameState' | 'suspended' | 'base' | 'disciplineRules'>;

const person = (userId: string, displayName: string) => ({
  userId,
  displayName,
  jerseyNumber: null,
  goalkeeper: false,
  accountLinked: true,
  participantId: null,
});
const RULES = { yellowAccumulationLimit: 2, redCardSuspensionMatches: 1 };

function view(overrides: Partial<View> = {}): View {
  return {
    gameState: 'SCHEDULED',
    disciplineRules: RULES,
    suspended: [{ ...person('u1', '김도윤'), reason: '퇴장 1회', remainingMatches: 1, cards: { yellowTotal: 0, redTotal: 1 } }],
    base: [
      { ...person('u1', '김도윤'), status: 'SUSPENDED', cards: { yellowTotal: 0, redTotal: 1 } },
      { ...person('u2', '박서준'), status: 'PARTICIPATING', cards: { yellowTotal: 1, redTotal: 0 } },
      { ...person('u3', '최민재'), status: 'PARTICIPATING', cards: null },
      { ...person('u4', '이준호'), status: 'EXCLUDED', cards: { yellowTotal: 1, redTotal: 0 } },
    ],
    ...overrides,
  };
}

describe('disciplineBannerMessages', () => {
  it('정지 선수와, 경고 한 장이면 정지인 출전 선수를 따로 알린다 — 빠진 선수·카드 없는 선수는 세지 않는다', () => {
    expect(disciplineBannerMessages(view())).toEqual({
      suspended: '출전정지 1명은 이 경기에 나설 수 없어요. 김도윤 — 명단에서 자동으로 빠졌어요.',
      imminent: '경고 임박 1명 — 박서준. 이번 경기에서 경고를 받으면 다음 경기부터 출전정지예요.',
    });
  });

  it('규정이 없거나 정지·임박이 없으면 안내가 없다', () => {
    expect(disciplineBannerMessages(view({ disciplineRules: null, suspended: [] }))).toEqual({ suspended: null, imminent: null });
    expect(disciplineBannerMessages(view({ disciplineRules: { yellowAccumulationLimit: 3, redCardSuspensionMatches: null } })).imminent).toBeNull();
  });

  it('시작한 경기에는 안내하지 않는다', () => {
    expect(disciplineBannerMessages(view({ gameState: 'LIVE' }))).toEqual({ suspended: null, imminent: null });
  });
});

describe('GameRosterDisciplineBanners', () => {
  it('두 안내를 각각 상태 영역으로 그린다', () => {
    render(<GameRosterDisciplineBanners view={view()} />);
    expect(screen.getAllByRole('status')).toHaveLength(2);
    expect(screen.getByText(/출전정지 1명은 이 경기에 나설 수 없어요/)).toBeInTheDocument();
    expect(screen.getByText(/경고 임박 1명 — 박서준/)).toBeInTheDocument();
  });

  it('안내할 것이 없으면 아무것도 그리지 않는다', () => {
    const { container } = render(<GameRosterDisciplineBanners view={view({ suspended: [], disciplineRules: null })} />);
    expect(container).toBeEmptyDOMElement();
  });
});
