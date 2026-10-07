import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useV1MyRegistrations } from '@/hooks/use-v1-api';
import { clearStoredV1Session, saveStoredV1Session } from '@/lib/session-storage';
import { LeagueJoinGuideCard } from './league-join-guide-card';

vi.mock('@/hooks/use-v1-api', () => ({
  useV1MyRegistrations: vi.fn(),
}));

const myRegistrationsMock = vi.mocked(useV1MyRegistrations);
const DEADLINE = '2026-10-12T14:59:00.000Z';
const PAST = '2026-10-07T05:20:00.000Z';

type Props = Parameters<typeof LeagueJoinGuideCard>[0];
const base: Props = {
  leagueId: 'lg-1',
  state: 'active',
  registrationOpen: true,
  registrationDeadlineAt: DEADLINE,
  entryFee: 70000,
  entryFeeConfigured: true,
};
const renderCard = (over: Partial<Props> = {}) =>
  render(<LeagueJoinGuideCard {...base} {...over} />);

const APPLY = 'a[href="/tournaments/lg-1/apply"]';
const OTHER_LEAGUES = 'a[href="/tournaments?kind=league"]';

beforeEach(() => {
  clearStoredV1Session();
  myRegistrationsMock.mockReturnValue({ data: [], isPending: false } as never);
});
afterEach(() => clearStoredV1Session());

describe('열림 카드 — 신청을 받는 중', () => {
  it('참가비·입금 방법·마감·신청 버튼을 보여 주고 계좌번호는 어디에도 없다', () => {
    const { container } = renderCard();

    expect(screen.getByRole('heading', { level: 3, name: '참가 안내' })).toBeInTheDocument();
    expect(screen.getByText('모집 중')).toBeInTheDocument();
    expect(screen.getByText('팀당 70,000원')).toBeInTheDocument();
    expect(screen.getByText('계좌이체 · 신청 후 안내해요')).toBeInTheDocument();
    expect(screen.getByText(/10월 12일/)).toBeInTheDocument();
    expect(container.querySelector(APPLY)).toHaveTextContent('참가 신청');
    // 공개 화면에는 계좌 정보가 없다 — 은행·계좌번호 모양이 하나도 새지 않는다.
    expect(container.textContent).not.toMatch(/\d{2,}-\d{2,}-\d{2,}|예금주|은행/);
  });

  it('참가비를 0원으로 확정한 리그는 "무료"만 말하고 입금 방법 행은 없다', () => {
    renderCard({ entryFee: 0, entryFeeConfigured: true });

    expect(screen.getByText('무료')).toBeInTheDocument();
    expect(screen.queryByText('입금 방법')).not.toBeInTheDocument();
  });

  it('참가비 미설정(0원)이면 "무료"를 말하지 않는다 — 참가비 행 자체가 없다', () => {
    const { container } = renderCard({ entryFee: 0, entryFeeConfigured: false });

    expect(screen.queryByText('참가비')).not.toBeInTheDocument();
    expect(screen.queryByText('무료')).not.toBeInTheDocument();
    expect(screen.queryByText('입금 방법')).not.toBeInTheDocument();
    // 그래도 받는 중이니 신청 입구는 있다.
    expect(container.querySelector(APPLY)).toBeInTheDocument();
  });

  it('마감이 비어 있어도 받는 중이면 입구는 그리고 "신청 마감" 행만 뺀다', () => {
    const { container } = renderCard({ registrationDeadlineAt: null });

    expect(container.querySelector(APPLY)).toBeInTheDocument();
    expect(screen.queryByText('신청 마감')).not.toBeInTheDocument();
  });

  it('보류(on_hold) 리그도 신청을 받는 중이면 그린다', () => {
    const { container } = renderCard({ state: 'on_hold' });

    expect(screen.getByText('모집 중')).toBeInTheDocument();
    expect(container.querySelector(APPLY)).toBeInTheDocument();
  });
});

describe('닫힘 카드 — 마감이 지났다', () => {
  const closed = { registrationOpen: false, registrationDeadlineAt: PAST } satisfies Partial<Props>;

  it('마감 안내와 다른 리그 링크만 있고 신청 버튼·참가비는 없다', () => {
    const { container } = renderCard(closed);

    expect(screen.getByText('모집 마감')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '신청이 마감됐어요' })).toBeInTheDocument();
    expect(screen.getByText(/10월 7일.*에 마감됐어요\. 이미 신청한 팀은 확정 결과를 기다려 주세요\./)).toBeInTheDocument();
    const link = container.querySelector(OTHER_LEAGUES);
    expect(link).toHaveTextContent('다른 리그 둘러보기');
    expect(container.querySelector(APPLY)).not.toBeInTheDocument();
    expect(screen.queryByText('참가비')).not.toBeInTheDocument();
    expect(screen.queryByText(/70,000/)).not.toBeInTheDocument();
  });

  it('같은 입력에서 열림↔닫힘만 바꾸면 신청 버튼과 다른 리그 링크가 맞바뀐다', () => {
    const open = renderCard();
    expect(open.container.querySelector(APPLY)).toBeInTheDocument();
    expect(open.container.querySelector(OTHER_LEAGUES)).not.toBeInTheDocument();
    open.unmount();

    const shut = renderCard(closed);
    expect(shut.container.querySelector(APPLY)).not.toBeInTheDocument();
    expect(shut.container.querySelector(OTHER_LEAGUES)).toBeInTheDocument();
  });

  it('보류(on_hold) 리그도 마감이 지났으면 닫힘 카드를 그린다', () => {
    renderCard({ ...closed, state: 'on_hold' });

    expect(screen.getByText('모집 마감')).toBeInTheDocument();
  });
});

describe('마감 미설정', () => {
  const noDeadline = { registrationOpen: false, registrationDeadlineAt: null } satisfies Partial<Props>;

  it('참가비를 확정한 리그는 안내 전용 카드 — 버튼과 링크가 없고 내 신청도 조회하지 않는다', () => {
    saveStoredV1Session({ userId: 'captain' });
    const { container } = renderCard(noDeadline);

    expect(screen.getByText('신청 준비 중')).toBeInTheDocument();
    expect(screen.getByText('팀당 70,000원')).toBeInTheDocument();
    expect(screen.getByText('계좌이체 · 신청 후 안내해요')).toBeInTheDocument();
    expect(screen.getByText('신청 일정은 아직 정해지지 않았어요.')).toBeInTheDocument();
    expect(container.querySelector('a')).not.toBeInTheDocument();
    expect(container.querySelector('button')).not.toBeInTheDocument();
    expect(myRegistrationsMock).toHaveBeenCalledWith('lg-1', expect.objectContaining({ enabled: false }));
  });

  it('0원으로 확정한 리그의 안내 전용 카드는 "무료"만 말한다', () => {
    renderCard({ ...noDeadline, entryFee: 0 });

    expect(screen.getByText('무료')).toBeInTheDocument();
    expect(screen.queryByText('입금 방법')).not.toBeInTheDocument();
  });

  it('참가비도 미설정이면 아무것도 그리지 않는다 — alpha 의 기존 리그', () => {
    const { container } = renderCard({ ...noDeadline, entryFee: 0, entryFeeConfigured: false });

    expect(container).toBeEmptyDOMElement();
  });
});

describe('그리지 않는 경우', () => {
  it('끝난 리그는 열림·닫힘 어느 쪽 입력이어도 그리지 않는다', () => {
    const open = renderCard({ state: 'completed' });
    expect(open.container).toBeEmptyDOMElement();
    open.unmount();

    const shut = renderCard({ state: 'completed', registrationOpen: false, registrationDeadlineAt: PAST });
    expect(shut.container).toBeEmptyDOMElement();
  });

  it('내 팀이 이미 신청했으면 열림 카드도 닫힘 카드도 그리지 않는다', () => {
    saveStoredV1Session({ userId: 'captain' });
    myRegistrationsMock.mockReturnValue({
      data: [{ id: 'reg-1', status: 'confirmed' }],
      isPending: false,
    } as never);

    const open = renderCard();
    expect(open.container).toBeEmptyDOMElement();
    open.unmount();

    const shut = renderCard({ registrationOpen: false, registrationDeadlineAt: PAST });
    expect(shut.container).toBeEmptyDOMElement();
  });

  it('취소한 신청만 있으면 없는 것으로 본다 — 다시 신청할 수 있다', async () => {
    saveStoredV1Session({ userId: 'captain' });
    myRegistrationsMock.mockReturnValue({
      data: [{ id: 'reg-old', status: 'cancelled' }],
      isPending: false,
    } as never);

    const { container } = renderCard();

    await waitFor(() => expect(container.querySelector(APPLY)).toBeInTheDocument());
  });

  it('세션 힌트가 있는데 내 신청 조회가 끝나기 전에는 열림·닫힘 카드를 그리지 않는다', async () => {
    saveStoredV1Session({ userId: 'captain' });
    myRegistrationsMock.mockReturnValue({ data: undefined, isPending: true } as never);

    const open = renderCard();
    await waitFor(() =>
      expect(myRegistrationsMock).toHaveBeenLastCalledWith('lg-1', expect.objectContaining({ enabled: true })),
    );
    expect(open.container).toBeEmptyDOMElement();
    open.unmount();

    const shut = renderCard({ registrationOpen: false, registrationDeadlineAt: PAST });
    await waitFor(() =>
      expect(myRegistrationsMock).toHaveBeenLastCalledWith('lg-1', expect.objectContaining({ enabled: true })),
    );
    expect(shut.container).toBeEmptyDOMElement();
  });

  it('비로그인은 조회가 꺼져 있어 isPending 이어도 기다리지 않고 바로 그린다', () => {
    // react-query 는 꺼진 쿼리도 isPending=true 로 돌려준다 — 그걸 대기로 읽으면 카드가 영영 안 뜬다.
    myRegistrationsMock.mockReturnValue({ data: undefined, isPending: true } as never);

    const { container } = renderCard();

    expect(myRegistrationsMock).toHaveBeenCalledWith('lg-1', expect.objectContaining({ enabled: false }));
    expect(container.querySelector(APPLY)).toBeInTheDocument();
  });

  it('조회가 실패하면 신청 없음으로 보고 카드를 그린다', async () => {
    saveStoredV1Session({ userId: 'captain' });
    myRegistrationsMock.mockReturnValue({ data: undefined, isPending: false, isError: true } as never);

    const { container } = renderCard();

    await waitFor(() => expect(container.querySelector(APPLY)).toBeInTheDocument());
  });
});
