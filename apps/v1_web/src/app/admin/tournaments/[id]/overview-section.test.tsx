/**
 * overview-section.test.tsx
 *
 * 개요는 「지금 무엇이 비었는지」를 보여 주고 **고칠 화면으로 바로 보내는** 것이 존재 이유다.
 * 목록만 뜨고 링크가 엉뚱한 데로 가면 화면이 없는 것과 같다.
 */
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1Tournament } from '@/types/api';
import type { StagePlan } from '@/types/stage-plan';
import { TournamentOverviewSection } from './overview-section';

const h = vi.hoisted(() => ({
  tournamentQuery: { current: {} as Record<string, unknown> },
  search: 'x=1',
  replace: vi.fn(),
  basePath: undefined as string | undefined,
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminTournament: () => h.tournamentQuery.current,
}));

vi.mock('./tournament-admin-context', () => ({
  useTournamentAdmin: () => ({ tournamentId: 'tournament-1', basePath: h.basePath, canWrite: true, showToast: vi.fn() }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/tournaments/tournament-1/overview',
  useSearchParams: () => new URLSearchParams(h.search),
  useRouter: () => ({ replace: h.replace }),
}));

const BASE = '/admin/tournaments/tournament-1';

beforeEach(() => {
  h.search = 'x=1';
  h.basePath = undefined;
  h.replace.mockClear();
});

/** 비어 있는 설정이 하나도 없는 접수 중 대회 — 각 시험이 필요한 값만 바꾼다. */
function renderWith(tournament: Partial<V1Tournament>) {
  h.tournamentQuery.current = {
    data: {
      id: 'tournament-1',
      status: 'open',
      venue: '서울 풋살장',
      registrationDeadlineAt: '2099-08-25T09:00:00+09:00',
      rosterDeadlineAt: '2099-08-28T09:00:00+09:00',
      scheduledAt: '2099-08-30T09:00:00+09:00',
      scheduledEndAt: null,
      bracketPublishedAt: '2020-01-01T09:00:00+09:00',
      bracketPublishScheduledAt: null,
      coverImageUrl: '/uploads/2026/08/cover.webp',
      entryFee: 0,
      bankAccount: null,
      prizePool: 1000000,
      prizeSummary: null,
      prizeBreakdown: null,
      minPlayers: 6,
      maxPlayers: 10,
      teamCount: 8,
      registrationCount: 5,
      operationCounts: { registrations: 5, fixtures: 12, announcements: 2 },
      ...tournament,
    },
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  };
  return render(<TournamentOverviewSection />);
}

const checklist = () => screen.getByRole('region', { name: '채워야 할 설정' });

/** 설정 행 하나 — 이름이 같은 글자는 행 안의 label 로만 찾는다. */
function row(label: string) {
  const found = within(checklist())
    .getAllByRole('listitem')
    .find((item) => within(item).queryByText(label, { selector: 'p' }));
  if (!found) throw new Error(`「${label}」 행이 없어요.`);
  return found;
}

describe('TournamentOverviewSection — 채워야 할 설정', () => {
  it('필요 항목은 해당 섹션 시트 딥링크로, 대진·공지는 그 탭으로 보낸다', () => {
    renderWith({
      venue: null,
      entryFee: 30000,
      bankAccount: null,
      operationCounts: { registrations: 5, fixtures: 0, announcements: 0 },
    });

    expect(within(row('장소')).getByRole('link', { name: '장소 정하기' })).toHaveAttribute('href', `${BASE}/info?edit=schedule`);
    expect(within(row('정산 계좌')).getByRole('link')).toHaveAttribute('href', `${BASE}/info?edit=entry`);
    expect(within(row('대진')).getByRole('link')).toHaveAttribute('href', `${BASE}/bracket`);
    expect(within(row('공지')).getByRole('link')).toHaveAttribute('href', `${BASE}/announcements`);
  });

  it('스태프 면처럼 기본 경로가 다르면 그 경로 아래로 보낸다', () => {
    h.basePath = '/tournament-management/tournaments/tournament-1';
    renderWith({ venue: null, operationCounts: { registrations: 5, fixtures: 12, announcements: 0 } });

    expect(within(row('장소')).getByRole('link')).toHaveAttribute(
      'href',
      '/tournament-management/tournaments/tournament-1/info?edit=schedule',
    );
    expect(within(row('공지')).getByRole('link')).toHaveAttribute(
      'href',
      '/tournament-management/tournaments/tournament-1/announcements',
    );
  });

  it('주 버튼은 필요 첫 항목 하나뿐이다', () => {
    renderWith({ venue: null, entryFee: 30000, bankAccount: null });

    const primary = within(checklist())
      .getAllByRole('link')
      .filter((link) => link.className.includes('tm-btn-primary'));
    expect(primary).toHaveLength(1);
    expect(primary[0]).toHaveTextContent('장소 정하기');
    // 두 번째 필요 항목은 글자 링크다.
    expect(within(row('정산 계좌')).getByRole('link').className).not.toContain('tm-btn');
    expect(within(row('정산 계좌')).getByRole('link')).toHaveTextContent('계좌 입력하기');
  });

  it('필요 항목이 없으면 주 버튼이 없다', () => {
    renderWith({ operationCounts: { registrations: 5, fixtures: 12, announcements: 0 } });
    expect(within(checklist()).queryByRole('link', { name: /정하기|입력하기/ })).not.toBeInTheDocument();
    expect(within(checklist()).getAllByRole('link').every((link) => !link.className.includes('tm-btn-primary'))).toBe(true);
  });

  it('초안은 기본값 확인 항목과 안내 한 줄을 보이고 접수 중에는 기본값 확인이 없다', () => {
    const draft = renderWith({ status: 'draft', venue: null, coverImageUrl: null });

    const badges = within(checklist()).getAllByText(/^(필요|기본값 확인|선택)$/).map((badge) => badge.textContent);
    expect(badges).toEqual(['필요', '기본값 확인', '기본값 확인', '선택']);
    expect(within(checklist()).getByText('접수를 시작하기 전에 확인해 주세요.')).toBeInTheDocument();
    expect(within(row('참가 조건')).getByRole('link')).toHaveAttribute('href', `${BASE}/info?edit=entry`);
    expect(within(row('경기 규칙')).getByRole('link')).toHaveAttribute('href', `${BASE}/info?edit=rules`);
    draft.unmount();

    renderWith({ status: 'open', venue: null, coverImageUrl: null });
    expect(within(checklist()).queryByText('기본값 확인')).not.toBeInTheDocument();
    expect(within(checklist()).queryByText('접수를 시작하기 전에 확인해 주세요.')).not.toBeInTheDocument();
  });

  it('필요 단계 배지는 주황, 나머지는 회색 배지다', () => {
    renderWith({ status: 'draft', venue: null });
    const classOf = (text: string) => within(checklist()).getAllByText(text)[0].className;
    expect(classOf('필요')).toContain('tm-badge-orange');
    expect(classOf('기본값 확인')).toContain('tm-badge-grey');
  });

  it('머리 건수는 모든 단계의 항목 수다', () => {
    renderWith({ status: 'draft', venue: null, coverImageUrl: null, operationCounts: { registrations: 0, fixtures: 0, announcements: 0 } });
    // 필요 1 + 기본값 확인 2 + 선택(공개 화면·대진·공지) 3
    expect(within(checklist()).getByRole('heading', { name: '채워야 할 설정 6건' })).toBeInTheDocument();
    expect(within(checklist()).getAllByRole('listitem')).toHaveLength(6);
  });

  it('다 채워졌으면 확인 메시지를 보인다', () => {
    renderWith({});

    expect(screen.queryByRole('region', { name: '채워야 할 설정' })).not.toBeInTheDocument();
    expect(screen.getByText('비어 있는 설정이 없어요.')).toBeInTheDocument();
  });

  it('여러 단계 초안의 단계 구성 항목은 대진 탭 링크다', () => {
    renderWith({ status: 'draft', format: 'league_knockouts', stagePlan: { version: 1, stages: [] } as StagePlan });

    const link = within(row('단계 구성')).getByRole('link');
    expect(link).toHaveAttribute('href', `${BASE}/bracket`);
    expect(link).toHaveTextContent('대진');
  });
});

describe('TournamentOverviewSection — 요약·KPI', () => {
  it('초안 + 모든 건수 0 이면 KPI 줄이 없고, 공지가 1건이라도 있으면 보인다', () => {
    const empty = renderWith({
      status: 'draft',
      registrationCount: 0,
      operationCounts: { registrations: 0, fixtures: 0, announcements: 0 },
    });
    expect(screen.queryByRole('link', { name: /신청 팀/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^경기 / })).not.toBeInTheDocument();
    empty.unmount();

    renderWith({
      status: 'draft',
      registrationCount: 0,
      operationCounts: { registrations: 0, fixtures: 0, announcements: 1 },
    });
    expect(screen.getByRole('link', { name: /공지 1건/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /신청 팀 0팀/ })).toBeInTheDocument();
  });

  it('operationCounts 가 없는 응답도 NaN·undefined 없이 그린다', () => {
    const { container } = renderWith({ operationCounts: undefined, registrationCount: 5 });

    expect(screen.getByRole('link', { name: /신청 팀 5팀/ })).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/undefined|NaN/);
  });

  it('규모 숫자는 해당 탭 링크이고 보조 줄이 사실을 말한다', () => {
    renderWith({ bracketPublishedAt: null, bracketPublishScheduledAt: '2099-09-01T00:00:00+09:00' });

    const registrations = screen.getByRole('link', { name: /신청 팀 5팀/ });
    expect(registrations).toHaveAttribute('href', `${BASE}/registrations`);
    expect(registrations).toHaveTextContent('정원 8팀');
    const fixtures = screen.getByRole('link', { name: /경기 12개/ });
    expect(fixtures).toHaveAttribute('href', `${BASE}/bracket`);
    expect(fixtures).toHaveTextContent('대진표 아직 비공개');
    expect(screen.getByRole('link', { name: /공지 2건/ })).toHaveAttribute('href', `${BASE}/announcements`);
  });

  it.each([
    [{ operationCounts: { registrations: 5, fixtures: 12, announcements: 0 } }, /공지 0건/, '아직 없어요'],
    [{ operationCounts: { registrations: 5, fixtures: 0, announcements: 2 } }, /경기 0개/, '아직 없어요'],
    [{}, /경기 12개/, '대진표 공개'],
  ] as [Partial<V1Tournament>, RegExp, string][])('보조 줄 — %#', (overrides, name, sub) => {
    renderWith(overrides);
    expect(screen.getByRole('link', { name })).toHaveTextContent(sub);
  });

  it('상태 알약은 밴드에 중복해서 그리지 않는다', () => {
    renderWith({});

    const band = screen.getByRole('region', { name: '대회 진행 상태' });
    expect(within(band).queryByText('접수 중')).not.toBeInTheDocument();
    expect(within(band).getByText(/접수 마감까지/)).toBeInTheDocument();
  });

  it('명단 제출 마감이 없으면 아직 없어요로 보인다', () => {
    renderWith({ rosterDeadlineAt: null });

    const band = screen.getByRole('region', { name: '대회 진행 상태' });
    expect(within(band).getByText('명단 제출 마감')).toBeInTheDocument();
    expect(within(band).getByText('아직 없어요')).toBeInTheDocument();
    expect(within(band).getByText('경기 일정')).toBeInTheDocument();
    expect(within(band).getByText('신청 마감')).toBeInTheDocument();
  });

  it('마감이 지났는데 접수 중이면 확인 필요로 표시한다', () => {
    renderWith({ registrationDeadlineAt: '2020-01-01T09:00:00+09:00' });

    const band = screen.getByRole('region', { name: '대회 진행 상태' });
    expect(within(band).getByText('확인 필요')).toBeInTheDocument();
    expect(within(band).getByText('접수 마감 시각이 지났는데 아직 접수 중이에요.')).toBeInTheDocument();
  });
});

describe('TournamentOverviewSection — 참가자 화면', () => {
  it('공개 중·비공개·취소 사유를 글자로 말하고 참가자 화면 링크를 가진다', () => {
    const open = renderWith({ isPublic: true });
    let card = screen.getByRole('region', { name: '참가자 화면' });
    expect(within(card).getByText('공개 중')).toBeInTheDocument();
    expect(within(card).getByText('공개 대회 목록과 검색, 홈 화면에 보여요.')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: /참가자에게 보이는 화면 열기/ })).toHaveAttribute(
      'href',
      '/tournaments/tournament-1?from=%2Fadmin%2Ftournaments%2Ftournament-1',
    );
    open.unmount();

    const hidden = renderWith({ isPublic: false });
    card = screen.getByRole('region', { name: '참가자 화면' });
    expect(within(card).getByText('비공개')).toBeInTheDocument();
    expect(within(card).getByText('일반 사용자에게 숨겨져요.')).toBeInTheDocument();
    hidden.unmount();

    renderWith({ status: 'cancelled', isPublic: true });
    card = screen.getByRole('region', { name: '참가자 화면' });
    expect(within(card).getByText('노출 안 됨')).toBeInTheDocument();
    expect(
      within(card).getByText('취소된 대회는 공개 설정과 관계없이 일반 사용자 화면에 보이지 않아요.'),
    ).toBeInTheDocument();
    expect(within(card).queryByText('공개 중')).not.toBeInTheDocument();
  });
});

describe('TournamentOverviewSection — 방금 만든 초안 안내', () => {
  it('created=1 이면 초안 안내를 보이고 쿼리에서 created 만 뺀 주소로 replace 한다', () => {
    h.search = 'created=1&x=2';
    renderWith({ status: 'draft' });

    expect(screen.getByRole('status')).toHaveTextContent(
      '초안을 만들었어요. 접수를 시작하기 전까지 참가자에게 보이지 않아요.',
    );
    expect(h.replace).toHaveBeenCalledTimes(1);
    expect(h.replace).toHaveBeenCalledWith('/admin/tournaments/tournament-1/overview?x=2', { scroll: false });
  });

  it('created=1 이어도 초안이 아니면 안내는 없고 주소 정리(replace)는 계속한다', () => {
    h.search = 'created=1&x=2';
    renderWith({ status: 'open' });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(h.replace).toHaveBeenCalledTimes(1);
    expect(h.replace).toHaveBeenCalledWith('/admin/tournaments/tournament-1/overview?x=2', { scroll: false });
  });

  it('같은 화면에서 접수를 시작해 초안이 아니게 되면 안내가 사라진다', () => {
    h.search = 'created=1';
    const view = renderWith({ status: 'draft' });
    expect(screen.getByRole('status')).toBeInTheDocument();

    h.tournamentQuery.current = {
      ...h.tournamentQuery.current,
      data: { ...(h.tournamentQuery.current.data as object), status: 'open' },
    };
    view.rerender(<TournamentOverviewSection />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('created 외 쿼리가 없으면 쿼리 없는 경로로 replace 한다', () => {
    h.search = 'created=1';
    renderWith({ status: 'draft' });
    expect(h.replace).toHaveBeenCalledWith('/admin/tournaments/tournament-1/overview', { scroll: false });
  });

  it('created 가 없으면 초안이어도 안내가 없고 replace 도 부르지 않는다', () => {
    h.search = 'x=1';
    renderWith({ status: 'draft' });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(h.replace).not.toHaveBeenCalled();
  });

  it('주소에서 created 가 사라진 뒤에도 같은 화면에 있는 동안 안내는 남는다', () => {
    h.search = 'created=1';
    const view = renderWith({ status: 'draft' });
    expect(screen.getByRole('status')).toBeInTheDocument();

    h.search = '';
    view.rerender(<TournamentOverviewSection />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(h.replace).toHaveBeenCalledTimes(1);
  });
});
