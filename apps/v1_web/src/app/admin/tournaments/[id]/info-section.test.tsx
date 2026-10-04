/**
 * info-section.test.tsx
 *
 * 이 화면은 같은 값을 두 번 그리고 같은 편집 버튼을 두 곳에 두고 있었다(요약표 2개,
 * '대회 정보 수정' + '기본 정보 수정', 상금은 읽기 2곳 + 편집 1곳). 아래는 그 통합이
 * 되돌아가지 않도록 "한 번만 나온다"를 고정하고, 함께 고친 권한 게이팅을 검증한다.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1Tournament } from '@/types/api';
import { TournamentInfoSection } from './info-section';
import { TournamentAdminProvider } from './tournament-admin-context';

const { hooks } = vi.hoisted(() => ({
  hooks: { tournament: undefined as unknown, mutate: vi.fn(), showToast: vi.fn(), isPending: false },
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminTournament: () => ({ data: hooks.tournament }),
  useV1UpdateTournament: () => ({ mutate: hooks.mutate, isPending: hooks.isPending }),
  useV1UploadImages: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useV1MasterSports: () => ({ data: [] }),
  useV1LineupSizeOptions: () => ({ data: [], isPending: false, isError: false }),
}));

vi.mock('@/hooks/use-tournament-period-settings', () => ({
  useTournamentPeriodSettings: () => ({
    data: {
      tournamentId: 'tournament-1',
      competitionConfigVersionId: 'config-1',
      expectedVersion: 'version-1',
      periods: [{ code: 'FIRST_HALF', label: '전반', durationMinutes: 45, extraTime: false }],
      legacyPeriodCount: null,
      requiresDurationInput: false,
    },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useUpdateTournamentPeriodSettings: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}));

const tournament = {
  id: 'tournament-1',
  sportId: 'sport-1',
  title: 'Teameet Futsal Cup',
  status: 'open',
  format: 'group_knockout',
  registrationDeadlineAt: '2026-08-25T00:00:00.000Z',
  rosterDeadlineAt: '2026-08-28T00:00:00.000Z',
  bracketPublishedAt: null,
  bracketPublishScheduledAt: null,
  scheduledAt: '2026-08-30T00:00:00.000Z',
  scheduledEndAt: null,
  venue: '성수 풋살장',
  parkingInfo: null,
  latitude: null,
  longitude: null,
  coverImageUrl: null,
  teamCount: 8,
  minPlayers: 8,
  maxPlayers: 12,
  competitionConfigVersionId: null,
  lineupMaxPlayers: 5,
  lineupMinPlayers: 3,
  lineupSizeOptions: [],
  substitutionMode: 'rolling',
  maxSubstitutions: null,
  substitutionModeOptions: ['limited', 'rolling'],
  genderCategory: null,
  genderMinMale: null,
  genderMaxMale: null,
  genderMinFemale: null,
  genderMaxFemale: null,
  minMatchesPerTeam: null,
  entryFee: 50000,
  prizePool: 1000000,
  prizeSummary: '우승 트로피 + 상금',
  prizeBreakdown: '우승 600,000원',
  promoHomeEnabled: false,
  promoHomePriority: 0,
  promoListEnabled: false,
  promoListPriority: 0,
  bankName: '국민은행',
  bankAccount: '123-456',
  bankHolder: '티밋',
  rulesText: null,
  refundPolicyText: null,
  registrationCount: 5,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
} as unknown as V1Tournament;

function renderSection(canWrite: boolean, overrides: Partial<V1Tournament> = {}) {
  hooks.tournament = { ...tournament, ...overrides };
  // useV1AdminTournament/useV1UpdateTournament는 위에서 모킹되지만, CAS 충돌(409) 처리를
  // 위해 컴포넌트가 직접 부르는 useQueryClient()는 실제 QueryClientProvider가 있어야 한다.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TournamentAdminProvider value={{ tournamentId: 'tournament-1', role: canWrite ? 'PLATFORM_OPS' : 'SUPPORT_READONLY', canWrite, showToast: hooks.showToast }}>
        <TournamentInfoSection />
      </TournamentAdminProvider>
    </QueryClientProvider>,
  );
}

describe('TournamentInfoSection', () => {
  it('같은 값을 두 번 그리지 않는다', () => {
    renderSection(true);

    for (const label of ['신청 마감', '명단 마감', '참가비', '팀 수', '출전 인원', '교체 방식', '입금 계좌']) {
      expect(screen.getAllByText(label)).toHaveLength(1);
    }
    // 카드 제목과 업로더 자체 label이 겹쳐 '커버 이미지'가 두 번 뜬 적이 있다.
    expect(screen.getAllByText('커버 이미지')).toHaveLength(1);
  });

  it('편집 진입점은 관심사마다 하나씩이다', () => {
    renderSection(true);

    expect(screen.getAllByRole('button', { name: '대회 정보 수정' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: '홍보 카드 수정' })).toHaveLength(1);
    // 같은 모달을 여는 두 번째 버튼이 있었다.
    expect(screen.queryByRole('button', { name: '기본 정보 수정' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '프로모 설정' })).not.toBeInTheDocument();
  });

  it('상금은 편집기 한 곳에서만 읽고 고친다', () => {
    renderSection(true);

    expect(screen.getAllByRole('region', { name: '상금·시상 정보' })).toHaveLength(1);
    expect(screen.getAllByLabelText('상품 및 상금')).toHaveLength(1);
    // '상금 배분'은 편집기 안에서 한 번만 나온다 — 요약표가 같은 텍스트를 또 뿌리던
    // 읽기 블록이 사라졌다는 뜻이다.
    expect(screen.getAllByText('상금 배분')).toHaveLength(1);
  });

  it('상금 편집기는 저장된 값으로 채워져 열린다', () => {
    renderSection(true);

    // 초기값은 렌더 도중 setState 가 아니라 useState 초기화 함수로 한 번만 계산된다 —
    // 비어 있는 폼이 뜨면 운영자가 기존 상금을 지운 채 저장하게 된다.
    expect(screen.getByLabelText('상품 및 상금')).toHaveValue('우승 트로피 + 상금');
    expect(screen.getByDisplayValue('우승')).toBeInTheDocument();
    expect(screen.getByDisplayValue('600,000원')).toBeInTheDocument();
  });

  it('읽기 전용 관리자에게는 저장 경로를 열어 주지 않는다', () => {
    renderSection(false);

    expect(screen.queryByRole('button', { name: '대회 정보 수정' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '홍보 카드 수정' })).not.toBeInTheDocument();
    // 상금 저장 버튼과 입력이 함께 잠긴다 — 예전에는 둘 다 그대로 노출됐다.
    expect(screen.queryByRole('button', { name: '상금 정보 저장' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('상품 및 상금')).toBeDisabled();
  });
});

describe('TournamentInfoSection — 상금 행 모바일 전체 폭 actual caller (#1439)', () => {
  beforeEach(() => {
    hooks.mutate.mockReset();
    hooks.showToast.mockReset();
    hooks.isPending = false;
  });
  afterEach(() => {
    hooks.isPending = false;
  });

  it('저장된 공유 행의 반응형 class/DOM을 유지하며 연속 입력·미리보기·저장 payload를 연결한다', async () => {
    const user = userEvent.setup();
    renderSection(true, { prizeBreakdown: '우승 600,000원 / 상품 우승 트로피' });
    const card = within(screen.getByRole('region', { name: '상금·시상 정보' }));
    const name = card.getByRole('combobox', { name: '상금 항목 1 이름' });
    const value = card.getByRole('textbox', { name: '상금 항목 1 내용' });
    const remove = card.getByRole('button', { name: '상금 항목 1 삭제' });
    const row = name.parentElement;

    // 실제 shared renderer 연결을 검증한다. jsdom class assertion은 CSS pixel/alpha after가 아니다.
    expect(row).toHaveClass(
      'grid-cols-[minmax(0,1fr)_44px]',
      'sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_44px]',
    );
    expect(value).toHaveClass(
      'col-span-2', 'col-start-1', 'row-start-2',
      'sm:col-span-1', 'sm:col-start-2', 'sm:row-start-1',
    );
    expect(Array.from(row!.querySelectorAll('input, button'))).toEqual([name, value, remove]);
    expect(name).toHaveValue('우승');
    expect(value).toHaveValue('600,000원');
    expect(card.getByRole('textbox', { name: '상금 항목 2 내용' })).toHaveValue('우승 트로피');
    expect(name).toBeEnabled();
    expect(value).toBeEnabled();

    name.focus();
    await user.tab();
    expect(value).toHaveFocus();
    await user.tab();
    expect(remove).toHaveFocus();
    await user.clear(name);
    await user.type(name, '1위');
    await user.clear(value);
    await user.type(value, '650000');
    expect(card.getByRole('textbox', { name: '상금 항목 1 내용' })).toBe(value);
    expect(value).toHaveFocus();
    expect(value).toHaveValue('650000');
    const item = card.getByRole('textbox', { name: '상금 항목 2 내용' });
    await user.clear(item);
    await user.type(item, '우승 트로피·상품권');
    const pool = card.getByRole('textbox', { name: '총상금' });
    await user.clear(pool);
    await user.type(pool, '650000');
    const summary = card.getByRole('textbox', { name: '상품 및 상금' });
    await user.clear(summary);
    await user.type(summary, '수정된 시상 안내');

    expect(pool).toHaveValue('650,000');
    expect(card.getByText('650,000원')).toBeInTheDocument();
    expect(card.getByText('우승 트로피·상품권')).toBeInTheDocument();
    expect(card.getByText('배분 합계 650,000원')).toBeInTheDocument();
    expect(hooks.mutate).not.toHaveBeenCalled();
    await user.click(card.getByRole('button', { name: '상금 정보 저장' }));

    // 실제 component가 작성한 DTO payload를 mock mutation 경계에서 확인한다.
    // HTTP, 권한의 서버 재검증, 실제 저장/재조회는 이 fixture의 검증 범위 밖이다.
    expect(hooks.mutate).toHaveBeenCalledTimes(1);
    expect(hooks.mutate).toHaveBeenCalledWith({
      prizePool: 650000,
      prizeSummary: '수정된 시상 안내',
      prizeBreakdown: '1위 650,000원 / 상품 우승 트로피·상품권',
      expectedVersion: tournament.updatedAt,
    }, expect.anything());
  });

  it.each([
    { label: '읽기 전용', canWrite: false, pending: false },
    { label: '저장 중', canWrite: true, pending: true },
  ])('$label 상태에서는 실제 행·추가·삭제를 잠그고 저장된 입력값을 유지한다', async ({ canWrite, pending }) => {
    const user = userEvent.setup();
    hooks.isPending = pending;
    renderSection(canWrite);
    const card = within(screen.getByRole('region', { name: '상금·시상 정보' }));
    const name = card.getByRole('combobox', { name: '상금 항목 1 이름' });
    const value = card.getByRole('textbox', { name: '상금 항목 1 내용' });
    const remove = card.getByRole('button', { name: '상금 항목 1 삭제' });
    const add = card.getByRole('button', { name: '항목 추가' });
    for (const control of [name, value, remove, add, card.getByRole('textbox', { name: '총상금' }), card.getByRole('textbox', { name: '상품 및 상금' })]) {
      expect(control).toBeDisabled();
    }
    await user.type(name, '변경');
    await user.type(value, '999');
    await user.click(remove);
    await user.click(add);

    expect(name).toHaveValue('우승');
    expect(value).toHaveValue('600,000원');
    expect(card.getAllByRole('textbox', { name: /상금 항목 \d+ 내용/ })).toHaveLength(1);
    if (canWrite) {
      const save = card.getByRole('button', { name: '저장 중…' });
      expect(save).toBeDisabled();
      await user.click(save);
    } else {
      expect(card.queryByRole('button', { name: '상금 정보 저장' })).not.toBeInTheDocument();
    }
    expect(hooks.mutate).not.toHaveBeenCalled();
  });
});

// 명단 마감이 신청 마감보다 앞서면 신청을 받는 중에 명단이 먼저 닫힌다. 서버도 같은 규칙으로 400 을 준다.
describe('TournamentInfoSection — 명단 제출 마감은 신청 마감과 같거나 그 뒤', () => {
  beforeEach(() => {
    hooks.mutate.mockReset();
    hooks.showToast.mockReset();
  });

  function submitEdit(edit: () => void) {
    fireEvent.click(screen.getByRole('button', { name: '대회 정보 수정' }));
    edit();
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
  }

  it('신청 마감보다 앞선 명단 마감은 저장하지 않고 알린다', () => {
    renderSection(true);
    submitEdit(() => fireEvent.change(screen.getByLabelText('명단 제출 마감일'), { target: { value: '2026-08-20T09:00' } }));

    expect(hooks.showToast).toHaveBeenCalledWith('명단 제출 마감은 신청 마감과 같거나 그 뒤여야 해요.', 'error');
    expect(hooks.mutate).not.toHaveBeenCalled();
  });

  it.each([
    ['신청 마감 뒤로', '2026-08-26T09:00'],
    ['비우면', ''],
  ])('대조군: 명단 마감을 %s 저장한다', (_label, value) => {
    renderSection(true);
    submitEdit(() => fireEvent.change(screen.getByLabelText('명단 제출 마감일'), { target: { value } }));

    expect(hooks.mutate).toHaveBeenCalledTimes(1);
  });

  it('순서가 어긋난 채 만들어진 대회라도 마감을 안 건드리는 수정은 막지 않는다', () => {
    renderSection(true, { rosterDeadlineAt: '2026-08-20T00:00:00.000Z' });
    submitEdit(() => fireEvent.change(screen.getByLabelText(/대회명/), { target: { value: '새 대회명' } }));

    expect(hooks.mutate).toHaveBeenCalledTimes(1);
  });
});
