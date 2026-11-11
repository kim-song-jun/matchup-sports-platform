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
import type { V1Sport, V1Tournament } from '@/types/api';
import { resolveNextImageSrc } from '@/test/next-image';
import { TournamentInfoSection } from './info-section';
import { TournamentAdminProvider } from './tournament-admin-context';

const { hooks } = vi.hoisted(() => ({
  hooks: { tournament: undefined as unknown, stageMutate: vi.fn(), mutate: vi.fn(), showToast: vi.fn(), isPending: false, masterSports: vi.fn<() => V1Sport[]>(() => []) },
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminTournament: () => ({ data: hooks.tournament }),
  useV1UpdateTournament: () => ({ mutate: hooks.mutate, isPending: hooks.isPending }),
  useV1SetStageTieBreakOrder: () => ({ mutate: hooks.stageMutate, isPending: false }),
  useV1UploadImages: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useV1MasterSports: () => ({ data: hooks.masterSports() }),
  useV1PlaceSearch: () => ({ data: undefined, isFetching: false, isError: false, error: null }),
  useV1PublicKakaoMapsKey: () => ({ data: { kakaoMapsJsKey: null }, isLoading: false }),
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
      kind: 'regular_tournament',
      stageOverrides: [], groupOverrides: [],
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
  it('상세 이미지 숨김은 CAS 버전과 함께 저장하고 사진을 지우지 않는다', () => {
    renderSection(true, { listImageUrl: '/uploads/list.webp', coverImageUrl: '/uploads/detail.webp', showDetailImage: true });
    fireEvent.click(screen.getByRole('switch', { name: '상세 이미지 표시' }));
    expect(hooks.mutate).toHaveBeenCalledWith({ showDetailImage: false, expectedVersion: tournament.updatedAt }, expect.any(Object));
  });

  it('같은 값을 두 번 그리지 않는다', () => {
    renderSection(true);

    for (const label of ['신청 마감', '명단 마감', '참가비', '팀 수', '출전 인원', '교체 방식', '입금 계좌']) {
      expect(screen.getAllByText(label)).toHaveLength(1);
    }
    expect(screen.getAllByText('목록 이미지 (선택)')).toHaveLength(1);
    expect(screen.getAllByText('상세 이미지 (선택)')).toHaveLength(1);
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
    expect(screen.getByRole('switch', { name: '상세 이미지 표시' })).toBeDisabled();
    expect(screen.getByLabelText('목록 이미지')).toBeDisabled();
  });
});

describe('TournamentInfoSection — 종목 기본 이미지', () => {
  beforeEach(() => {
    hooks.masterSports.mockReturnValue([
      { id: 'sport-1', code: 'futsal', name: '풋살', levels: [] },
    ]);
  });
  afterEach(() => {
    hooks.masterSports.mockReturnValue([]);
  });

  it('이미지가 없는 풋살 대회는 목록과 상세 미리보기에 풋살 기본 이미지를 표시한다', () => {
    // Given: 종목 코드와 표시 이름이 다른 실제 마스터 응답, 업로드 이미지가 없는 대회.
    const images = { listImageUrl: null, coverImageUrl: null };

    // When: 실제 관리자 정보 섹션과 공유 이미지 필드를 렌더한다.
    renderSection(true, images);

    // Then: 두 미리보기 모두 공용 그래픽이 아닌 해당 종목의 이미지를 고른다.
    const listPreview = screen.getByRole('img', { name: '목록 이미지 미리보기' });
    const detailPreview = screen.getByRole('img', { name: '상세 이미지 미리보기' });
    expect.soft(resolveNextImageSrc(listPreview.querySelector('img'))).toBe('/illustrations/sport-futsal-640.webp');
    expect.soft(resolveNextImageSrc(detailPreview.querySelector('img'))).toBe('/illustrations/sport-futsal-640.webp');
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
      prizeBreakdown: '@teameet/prizes/v1:' + JSON.stringify([{ category: '팀 시상', label: '1위', amount: '650,000원' }, { category: '기타 시상', label: '상품', amount: '우승 트로피·상품권' }]),
      expectedVersion: tournament.updatedAt,
    }, expect.anything());
  });

  it('바뀐 게 없으면 저장 요청을 보내지 않고 안내만 한다', async () => {
    const user = userEvent.setup();
    renderSection(true);
    const card = within(screen.getByRole('region', { name: '상금·시상 정보' }));
    await user.click(card.getByRole('button', { name: '상금 정보 저장' }));
    expect(hooks.mutate).not.toHaveBeenCalled();
    expect(hooks.showToast).toHaveBeenCalledWith('바뀐 내용이 없어요.');
  });

  it('값을 바꾸면 저장 요청을 보낸다', async () => {
    const user = userEvent.setup();
    renderSection(true);
    const card = within(screen.getByRole('region', { name: '상금·시상 정보' }));
    const summary = card.getByRole('textbox', { name: '상품 및 상금' });
    await user.type(summary, '!');
    await user.click(card.getByRole('button', { name: '상금 정보 저장' }));
    expect(hooks.mutate).toHaveBeenCalledWith(expect.objectContaining({ prizeSummary: '우승 트로피 + 상금!' }), expect.anything());
  });

  it('시상 항목을 모두 삭제해 저장하면 null을 보내 기존 시상을 비운다', async () => {
    const user = userEvent.setup();
    renderSection(true);
    const card = within(screen.getByRole('region', { name: '상금·시상 정보' }));
    await user.click(card.getByRole('button', { name: '상금 항목 1 삭제' }));
    await user.click(card.getByRole('button', { name: '상금 정보 저장' }));
    expect(hooks.mutate).toHaveBeenCalledWith(expect.objectContaining({ prizeBreakdown: null }), expect.anything());
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
    const add = card.getByRole('button', { name: '팀 시상 추가' });
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

describe('TournamentInfoSection — 장소 스냅샷', () => {
  beforeEach(() => {
    hooks.mutate.mockReset();
    hooks.showToast.mockReset();
  });

  function save(edit: () => void) {
    fireEvent.click(screen.getByRole('button', { name: '대회 정보 수정' }));
    edit();
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    return hooks.mutate.mock.calls[0][0] as Record<string, unknown>;
  }

  it('장소를 건드리지 않은 수정은 장소 필드를 하나도 보내지 않는다 — 서버가 스냅샷을 교체하지 않게', () => {
    renderSection(true, { venueProvider: 'kakao', venueProviderId: 'kakao-1', latitude: 37.5, longitude: 127 } as Partial<V1Tournament>);
    const body = save(() => fireEvent.change(screen.getByLabelText(/대회명/), { target: { value: '새 대회명' } }));

    expect(Object.keys(body).filter((key) => key.startsWith('venue') || key === 'latitude')).toEqual([]);
  });

  it('장소 이름을 바꾸면 venue 를 보낸다 — 이름만 직접 입력한 값이라 좌표 키는 없다', () => {
    renderSection(true);
    const body = save(() => fireEvent.change(screen.getByLabelText('장소'), { target: { value: '뚝섬 풋살장' } }));

    expect(body).toMatchObject({ venue: '뚝섬 풋살장' });
    expect(Object.keys(body)).not.toContain('venueLatitude');
  });
});


describe('대회 형식 수정', () => {
  beforeEach(() => { hooks.mutate.mockReset(); hooks.showToast.mockReset(); });

  it.each(['league', 'knockout'] as const)('현재 형식을 채우고 %s 변경을 저장 요청에 포함한다', (format) => {
    renderSection(true, { formatChangeBlockedReason: null });
    fireEvent.click(screen.getByRole('button', { name: '대회 정보 수정' }));
    expect(screen.getByLabelText('대회 형식')).toHaveValue('group_knockout');
    fireEvent.change(screen.getByLabelText('대회 형식'), { target: { value: format } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(hooks.mutate).toHaveBeenCalledWith({ format, expectedVersion: tournament.updatedAt }, expect.any(Object));
  });

  it('조/대진이 있으면 선택을 잠그고 서버의 해제 안내를 보여준다', () => {
    const reason = '조나 대진이 만들어져 있어요. 경기와 조를 모두 삭제한 뒤 변경해 주세요.';
    renderSection(true, { formatChangeBlockedReason: reason });
    fireEvent.click(screen.getByRole('button', { name: '대회 정보 수정' }));
    expect(screen.getByLabelText('대회 형식')).toBeDisabled();
    expect(screen.getByText(reason)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/대회명/), { target: { value: '변경된 이름' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(hooks.mutate).toHaveBeenCalledWith({ title: '변경된 이름', expectedVersion: tournament.updatedAt }, expect.any(Object));
  });

  it.each(['in_progress', 'completed'] as const)('%s 대회는 형식 선택을 잠근다', (status) => {
    renderSection(true, { status });
    fireEvent.click(screen.getByRole('button', { name: '대회 정보 수정' }));
    expect(screen.getByLabelText('대회 형식')).toBeDisabled();
  });
});


describe('6강 방식 수정 payload', () => {
  beforeEach(() => { hooks.mutate.mockReset(); hooks.showToast.mockReset(); });
  it('6팀 토너먼트에서 선택한 방식만 CAS 버전과 함께 저장한다', () => {
    renderSection(true, { format: 'knockout', teamCount: 6, sixTeamMode: false });
    fireEvent.click(screen.getByRole('button', { name: '대회 정보 수정' }));
    fireEvent.change(screen.getByLabelText('6팀 토너먼트 진행'), { target: { value: 'six' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(hooks.mutate).toHaveBeenCalledWith({ sixTeamMode: true, expectedVersion: tournament.updatedAt }, expect.any(Object));
  });
  it('이미 선택된 6강 방식은 불러오고 다른 필드 수정에 끼워 보내지 않는다', () => {
    renderSection(true, { format: 'knockout', teamCount: 6, sixTeamMode: true });
    fireEvent.click(screen.getByRole('button', { name: '대회 정보 수정' }));
    expect(screen.getByLabelText('6팀 토너먼트 진행')).toHaveValue('six');
    fireEvent.change(screen.getByLabelText(/대회명/), { target: { value: '새 대회명' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(hooks.mutate).toHaveBeenCalledWith({ title: '새 대회명', expectedVersion: tournament.updatedAt }, expect.any(Object));
  });
});

describe('동점일 때 순서 수정', () => {
  const GOALS_FIRST: V1Tournament['tieBreakOrder'] = ['points', 'goal_difference', 'goals_for', 'head_to_head', 'fair_play', 'fewest_goals_against', 'seeded_draw'];
  const DEFAULT_ORDER: V1Tournament['tieBreakOrder'] = ['points', 'head_to_head', 'goal_difference', 'goals_for', 'fair_play', 'fewest_goals_against', 'seeded_draw'];
  const CUSTOM: V1Tournament['tieBreakOrder'] = ['points', 'head_to_head', 'goal_difference', 'fair_play', 'goals_for', 'fewest_goals_against', 'seeded_draw'];
  beforeEach(() => { hooks.mutate.mockReset(); hooks.showToast.mockReset(); });

  it('요약 카드에 프리셋 이름과 지금 쓰는 순서를 보여준다 — 안 고른 대회는 기본 순서', () => {
    const { unmount } = renderSection(true, { tieBreakOrder: GOALS_FIRST });
    expect(screen.getByText('득실차 우선 · 승점 → 득실차 → 다득점 → 맞대결 → 페어플레이 → 추첨')).toBeInTheDocument();
    unmount();
    const second = renderSection(true, { tieBreakOrder: DEFAULT_ORDER });
    expect(screen.getByText('맞대결 우선 · 승점 → 맞대결 → 득실차 → 다득점 → 페어플레이 → 추첨')).toBeInTheDocument();
    second.unmount();
    renderSection(true, { tieBreakOrder: CUSTOM });
    expect(screen.getByText(/^직접 정한 순서 · /)).toBeInTheDocument();
  });

  it('조별 순위가 없는 토너먼트 방식에는 순서 칸도 요약도 없다', () => {
    renderSection(true, { format: 'knockout', tieBreakOrder: DEFAULT_ORDER });
    expect(screen.queryByText('동점 순서')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '대회 정보 수정' }));
    expect(screen.queryByRole('heading', { name: '동점일 때 순서' })).toBeNull();
  });

  it('수정 창이 지금 순서에 맞는 프리셋을 고른 채로 열리고, 다른 프리셋을 골라 저장하면 그 순서를 CAS 버전과 함께 보낸다', () => {
    renderSection(true, { tieBreakOrder: DEFAULT_ORDER });
    fireEvent.click(screen.getByRole('button', { name: '대회 정보 수정' }));
    expect(screen.getByRole('radio', { name: /맞대결 우선/ })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /득실차 우선/ }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(hooks.mutate).toHaveBeenCalledWith({ tieBreakOrder: GOALS_FIRST, expectedVersion: tournament.updatedAt }, expect.any(Object));
  });

  it('직접 정하기로 시트를 열어 순서를 옮기고 적용하면 직접 정한 순서를 보낸다', () => {
    renderSection(true, { tieBreakOrder: DEFAULT_ORDER });
    fireEvent.click(screen.getByRole('button', { name: '대회 정보 수정' }));
    fireEvent.click(screen.getByRole('radio', { name: /직접 정하기/ }));
    const sheet = screen.getByRole('dialog', { name: '직접 정하기' });
    fireEvent.click(within(sheet).getByRole('button', { name: '페어플레이 한 칸 위로' }));
    fireEvent.click(within(sheet).getByRole('button', { name: '이 순서로 정하기' }));
    expect(screen.queryByRole('dialog', { name: '직접 정하기' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(hooks.mutate).toHaveBeenCalledWith({
      tieBreakOrder: ['points', 'head_to_head', 'goal_difference', 'fair_play', 'goals_for', 'fewest_goals_against', 'seeded_draw'],
      expectedVersion: tournament.updatedAt,
    }, expect.any(Object));
  });

  it('순서를 옮긴 뒤 순위표가 없는 토너먼트 방식으로 바꾸면 숨은 순서는 보내지 않는다', () => {
    renderSection(true, { tieBreakOrder: DEFAULT_ORDER });
    fireEvent.click(screen.getByRole('button', { name: '대회 정보 수정' }));
    fireEvent.click(screen.getByRole('radio', { name: /득실차 우선/ }));
    fireEvent.change(screen.getByLabelText('대회 형식'), { target: { value: 'knockout' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(hooks.mutate).toHaveBeenCalledWith({ format: 'knockout', expectedVersion: tournament.updatedAt }, expect.any(Object));
  });

  it('순서를 건드리지 않고 다른 칸만 고치면 순서를 보내지 않는다', () => {
    renderSection(true, { tieBreakOrder: GOALS_FIRST });
    fireEvent.click(screen.getByRole('button', { name: '대회 정보 수정' }));
    fireEvent.change(screen.getByLabelText(/대회명/), { target: { value: '새 대회명' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(hooks.mutate).toHaveBeenCalledWith({ title: '새 대회명', expectedVersion: tournament.updatedAt }, expect.any(Object));
  });

  it('기본 프리셋(맞대결 우선)으로 되돌리면 null 을 보낸다', () => {
    renderSection(true, { tieBreakOrder: GOALS_FIRST });
    fireEvent.click(screen.getByRole('button', { name: '대회 정보 수정' }));
    fireEvent.click(screen.getByRole('radio', { name: /맞대결 우선/ }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(hooks.mutate).toHaveBeenCalledWith({ tieBreakOrder: null, expectedVersion: tournament.updatedAt }, expect.any(Object));
  });

  it('이 순서를 상속한 단계에 결과가 확정돼 잠기면 서버의 사유를 보여주고 카드를 끄며, 다른 칸 저장은 막지 않는다', () => {
    const reason = '이 순서를 따르는 단계의 경기 결과가 확정돼서 바꿀 수 없어요.';
    renderSection(true, { tieBreakOrder: GOALS_FIRST, tieBreakOrderBlockedReason: reason });
    fireEvent.click(screen.getByRole('button', { name: '대회 정보 수정' }));
    expect(screen.getByText(reason)).toBeInTheDocument();
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/대회명/), { target: { value: '새 대회명' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(hooks.mutate).toHaveBeenCalledWith({ title: '새 대회명', expectedVersion: tournament.updatedAt }, expect.any(Object));
  });
});

describe('6강 결승 직행 순서 수정', () => {
  const sixTeam = { format: 'knockout', teamCount: 6, sixTeamMode: true } as Partial<V1Tournament>;
  beforeEach(() => { hooks.mutate.mockReset(); hooks.showToast.mockReset(); });

  it('6강 방식이 아니면 순서 칸이 없다', () => {
    renderSection(true, { format: 'knockout', teamCount: 6, sixTeamMode: false });
    fireEvent.click(screen.getByRole('button', { name: '대회 정보 수정' }));
    expect(screen.queryByRole('heading', { name: '결승 직행팀 고르는 순서' })).toBeNull();
  });

  it('기본 순서와 운영자 선택 고정 칸을 보여주고, 옮겨 저장하면 바뀐 순서만 보낸다', () => {
    renderSection(true, sixTeam);
    fireEvent.click(screen.getByRole('button', { name: '대회 정보 수정' }));
    expect(screen.getByRole('heading', { name: '결승 직행팀 고르는 순서' })).toBeInTheDocument();
    expect(screen.getByText('운영자 선택')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '득실차 한 칸 위로' }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(hooks.mutate).toHaveBeenCalledWith({ sixTeamDirectFinalOrder: ['goal_difference', 'goals_for', 'fewest_goals_against'], expectedVersion: tournament.updatedAt }, expect.any(Object));
  });

  it('건드리지 않으면 순서를 보내지 않는다', () => {
    renderSection(true, { ...sixTeam, sixTeamDirectFinalOrder: ['goal_difference', 'goals_for', 'fewest_goals_against'] });
    fireEvent.click(screen.getByRole('button', { name: '대회 정보 수정' }));
    fireEvent.change(screen.getByLabelText(/대회명/), { target: { value: '새 대회명' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(hooks.mutate).toHaveBeenLastCalledWith({ title: '새 대회명', expectedVersion: tournament.updatedAt }, expect.any(Object));
  });

  it('기본 순서로 되돌리면 null 을 보낸다', () => {
    renderSection(true, { ...sixTeam, sixTeamDirectFinalOrder: ['goal_difference', 'goals_for', 'fewest_goals_against'] });
    fireEvent.click(screen.getByRole('button', { name: '대회 정보 수정' }));
    fireEvent.click(screen.getByRole('button', { name: '기본 순서로 되돌리기' }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(hooks.mutate).toHaveBeenLastCalledWith({ sixTeamDirectFinalOrder: null, expectedVersion: tournament.updatedAt }, expect.any(Object));
  });

  it('6강 결과가 확정돼 잠기면 사유를 보여주고 버튼을 끈다', () => {
    const reason = '6강 경기 결과가 확정돼서 바꿀 수 없어요.';
    renderSection(true, { ...sixTeam, sixTeamDirectFinalOrderBlockedReason: reason });
    fireEvent.click(screen.getByRole('button', { name: '대회 정보 수정' }));
    expect(screen.getByText(reason)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '득실차 한 칸 위로' })).toBeDisabled();
  });
});

describe('단계별 동점 순서 카드', () => {
  const stageTieBreak = {
    tournamentOrder: ['points', 'head_to_head', 'goal_difference', 'goals_for', 'fair_play', 'fewest_goals_against', 'seeded_draw'],
    stages: [
      { stageKey: 'preliminary', stageName: '예선 조별리그', ranked: true, order: null, resolvedOrder: ['points', 'head_to_head', 'goal_difference', 'goals_for', 'fair_play', 'fewest_goals_against', 'seeded_draw'], lockedReason: null },
      { stageKey: 'final', stageName: '결선 토너먼트', ranked: false, order: null, resolvedOrder: [], lockedReason: null },
    ],
  } as V1Tournament['stageTieBreak'];
  beforeEach(() => { hooks.stageMutate.mockReset(); });

  it('단계형 대회가 아니면 카드가 없다', () => {
    renderSection(true);
    expect(screen.queryByRole('heading', { name: '단계별 동점 순서' })).toBeNull();
  });

  it('단계 select 를 고르면 단계 구성 revision 과 함께 바로 저장한다', () => {
    renderSection(true, { stageTieBreak, stagePlanRevision: 7 });
    expect(screen.getByRole('heading', { name: '단계별 동점 순서' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('1단계 · 예선 조별리그'), { target: { value: 'goals_for_first' } });
    expect(hooks.stageMutate).toHaveBeenCalledWith(
      { stageKey: 'preliminary', expectedRevision: 7, order: ['points', 'goals_for', 'goal_difference', 'fewest_goals_against', 'head_to_head', 'fair_play', 'seeded_draw'] },
      expect.any(Object),
    );
  });

  it('쓰기 권한이 없으면 select 가 꺼져 있다', () => {
    renderSection(false, { stageTieBreak, stagePlanRevision: 7 });
    expect(screen.getByLabelText('1단계 · 예선 조별리그')).toBeDisabled();
  });
});
