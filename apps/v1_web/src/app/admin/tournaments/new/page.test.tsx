import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/app/providers';
import { useV1CreateTournament, useV1MasterSports } from '@/hooks/use-v1-api';
import AdminTournamentsNewPage from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1CreateTournament: vi.fn(),
  useV1MasterSports: vi.fn(),
}));

const useV1CreateTournamentMock = vi.mocked(useV1CreateTournament);
const useV1MasterSportsMock = vi.mocked(useV1MasterSports);

// SectionStepper(작성 단계 스크롤스파이)가 IntersectionObserver를 사용한다 —
// jsdom엔 구현체가 없으므로 렌더가 깨지지 않도록 최소 스텁만 제공한다(불가피한 브라우저 API mock).
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
    IntersectionObserverStub;
});

function renderPage() {
  return render(
    <Providers>
      <AdminTournamentsNewPage />
    </Providers>,
  );
}

describe('AdminTournamentsNewPage — 명단 제출 마감일', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  beforeEach(() => {
    useV1MasterSportsMock.mockReturnValue({
      data: [{ id: 'sport-futsal', name: '풋살', levels: [] }],
      isPending: false,
    } as unknown as ReturnType<typeof useV1MasterSports>);
    useV1CreateTournamentMock.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useV1CreateTournament>);
  });

  it('auto-fills the roster deadline to 7 days before the tournament start at 23:59', () => {
    renderPage();

    const scheduledAtInput = screen.getByLabelText('대회 시작');
    fireEvent.change(scheduledAtInput, { target: { value: '2026-05-15 09:00' } });

    const rosterDeadlineInput = screen.getByLabelText(/명단 제출 마감일/);
    expect(rosterDeadlineInput).toHaveValue('2026-05-08 23:59');
  });

  it('stops auto-filling once the admin edits the roster deadline directly, even if the start date changes again', () => {
    renderPage();

    const scheduledAtInput = screen.getByLabelText('대회 시작');
    fireEvent.change(scheduledAtInput, { target: { value: '2026-05-15 09:00' } });

    const rosterDeadlineInput = screen.getByLabelText(/명단 제출 마감일/);
    expect(rosterDeadlineInput).toHaveValue('2026-05-08 23:59');

    fireEvent.change(rosterDeadlineInput, { target: { value: '2026-05-01 10:00' } });
    expect(rosterDeadlineInput).toHaveValue('2026-05-01 10:00');

    fireEvent.change(scheduledAtInput, { target: { value: '2026-06-20 09:00' } });
    expect(rosterDeadlineInput).toHaveValue('2026-05-01 10:00');
  });

  it('does not auto-fill when the start date is left empty or invalid', () => {
    renderPage();

    const scheduledAtInput = screen.getByLabelText('대회 시작');
    fireEvent.change(scheduledAtInput, { target: { value: '2026-05-15' } }); // missing time — invalid format

    const rosterDeadlineInput = screen.getByLabelText(/명단 제출 마감일/);
    expect(rosterDeadlineInput).toHaveValue('');
  });

  it('shows a required error when the roster deadline is empty, and clears it once a value is entered', () => {
    renderPage();

    expect(screen.getByText('명단 제출 마감일을 입력해 주세요.')).toBeInTheDocument();

    const rosterDeadlineInput = screen.getByLabelText(/명단 제출 마감일/);
    fireEvent.change(rosterDeadlineInput, { target: { value: '2026-05-01 10:00' } });

    expect(screen.queryByText('명단 제출 마감일을 입력해 주세요.')).not.toBeInTheDocument();
  });

  it('keeps the submit button disabled while the roster deadline is missing, even when other required fields are filled', () => {
    renderPage();

    fireEvent.change(screen.getByLabelText(/종목/), { target: { value: 'sport-futsal' } });
    fireEvent.change(screen.getByLabelText(/대회명/), { target: { value: '2026 서울 풋살 오픈' } });
    fireEvent.change(screen.getByLabelText(/참가 팀 수/), { target: { value: '8' } });

    const submitButton = screen.getByRole('button', { name: '대회 만들기' });
    expect(submitButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/명단 제출 마감일/), {
      target: { value: '2026-05-01 10:00' },
    });

    expect(submitButton).not.toBeDisabled();
  });

  it('rejects an impossible-but-shape-matching roster deadline (e.g. month 99) without crashing, keeping submit disabled', () => {
    renderPage();

    fireEvent.change(screen.getByLabelText(/종목/), { target: { value: 'sport-futsal' } });
    fireEvent.change(screen.getByLabelText(/대회명/), { target: { value: '2026 서울 풋살 오픈' } });
    fireEvent.change(screen.getByLabelText(/참가 팀 수/), { target: { value: '8' } });

    const rosterDeadlineInput = screen.getByLabelText(/명단 제출 마감일/);
    fireEvent.change(rosterDeadlineInput, { target: { value: '2026-99-99 99:99' } });

    const submitButton = screen.getByRole('button', { name: '대회 만들기' });
    expect(submitButton).toBeDisabled();

    // Submitting via a disabled/invalid form must not throw (previously
    // datetimeTextToIso called Date(...).toISOString() on an Invalid Date,
    // which raises RangeError uncaught).
    expect(() => fireEvent.click(submitButton)).not.toThrow();
    expect(useV1CreateTournamentMock.mock.results[0]?.value.mutate).not.toHaveBeenCalled();
  });

  it('does not crash and skips the field when the tournament start date is impossible-but-shape-matching', () => {
    renderPage();

    fireEvent.change(screen.getByLabelText(/종목/), { target: { value: 'sport-futsal' } });
    fireEvent.change(screen.getByLabelText(/대회명/), { target: { value: '2026 서울 풋살 오픈' } });
    fireEvent.change(screen.getByLabelText(/참가 팀 수/), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText(/명단 제출 마감일/), { target: { value: '2026-05-01 10:00' } });

    expect(() =>
      fireEvent.change(screen.getByLabelText('대회 시작'), { target: { value: '2026-13-40 25:99' } }),
    ).not.toThrow();

    const submitButton = screen.getByRole('button', { name: '대회 만들기' });
    expect(submitButton).toBeDisabled();
  });
});
