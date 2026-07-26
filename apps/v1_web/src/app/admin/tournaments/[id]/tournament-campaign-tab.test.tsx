import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import type {
  V1AdminTournamentCampaignPreview,
  V1TournamentCampaign,
} from '@/types/tournament-campaign';
import { TournamentCampaignTab } from './tournament-campaign-tab';

type QueryState<T> = {
  data: T | undefined;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: ReturnType<typeof vi.fn>;
};

type HookMocks = {
  campaignQuery: QueryState<V1TournamentCampaign>;
  previewQuery: QueryState<V1AdminTournamentCampaignPreview>;
  createMutate: ReturnType<typeof vi.fn>;
  updateMutate: ReturnType<typeof vi.fn>;
  statusMutate: ReturnType<typeof vi.fn>;
};

const mocks = vi.hoisted<HookMocks>(() => ({
  campaignQuery: {
    data: undefined,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  },
  previewQuery: {
    data: undefined,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  },
  createMutate: vi.fn(),
  updateMutate: vi.fn(),
  statusMutate: vi.fn(),
}));

vi.mock('@/hooks/use-v1-tournament-campaign', () => ({
  useV1AdminTournamentCampaign: () => mocks.campaignQuery,
  useV1AdminTournamentCampaignPreview: () => mocks.previewQuery,
  useV1CreateTournamentCampaign: () => ({ mutate: mocks.createMutate, isPending: false }),
  useV1UpdateTournamentCampaign: () => ({ mutate: mocks.updateMutate, isPending: false }),
  useV1ChangeTournamentCampaignStatus: () => ({ mutate: mocks.statusMutate, isPending: false }),
}));

const content = {
  version: 1 as const,
  hero: {
    title: 'Teameet Futsal Cup',
    summary: '도심에서 펼쳐지는 하루 완결형 풋살 대회',
    imageUrl: '/uploads/tournaments/campaign.jpg',
  },
  intro: {
    title: '대회 소개',
    body: '경기 정보는 실제 대회 데이터와 연결되고 캠페인 설명만 별도로 편집돼요.',
  },
  highlightsSectionTitle: '대회 하이라이트',
  highlights: [{ title: '하루 완결', body: '예선부터 결승까지 하루에 진행해요.' }],
  faqSectionTitle: '자주 묻는 질문',
  faq: [{ question: '참가 자격이 있나요?', answer: '등록된 팀이면 신청할 수 있어요.' }],
};

const campaign: V1TournamentCampaign = {
  id: 'campaign-1',
  tournamentId: 'tournament-1',
  slug: 'teameet-futsal-cup',
  status: 'draft',
  content,
  publishedAt: null,
  archivedAt: null,
  createdAt: '2026-07-14T00:00:00.000Z',
  updatedAt: '2026-07-14T00:00:00.000Z',
};

const preview: V1AdminTournamentCampaignPreview = {
  id: campaign.id,
  slug: campaign.slug,
  status: campaign.status,
  content,
  publishedAt: campaign.publishedAt,
  updatedAt: campaign.updatedAt,
  tournament: {
    id: 'tournament-1',
    title: 'Teameet Futsal Cup',
    status: 'open',
    format: 'group_knockout',
    sport: { code: 'futsal', name: '풋살' },
    scheduledAt: '2026-08-15T00:00:00.000Z',
    scheduledEndAt: '2026-08-16T00:00:00.000Z',
    registrationDeadlineAt: '2026-08-08T00:00:00.000Z',
    venue: '서울 풋살장',
    coverImageUrl: '/uploads/tournaments/campaign.jpg',
    teamCount: 8,
    minPlayers: 6,
    maxPlayers: 10,
    entryFee: 300000,
    rulesText: '대회 규정을 준수해 주세요.',
    refundPolicyText: '마감 전 취소는 전액 환불돼요.',
    prizePool: 4000000,
    prizeSummary: '총 400만원 상당 상금',
    prizeBreakdown: null,
    sponsors: [],
    confirmedCount: 4,
    pendingPaymentCount: 0,
    registrationAvailability: 'available',
    participantTeams: [],
  },
};

function notFoundError() {
  return new V1ApiError({
    status: 'error',
    statusCode: 404,
    code: 'TOURNAMENT_CAMPAIGN_NOT_FOUND',
    message: '캠페인을 찾을 수 없어요.',
    timestamp: '2026-07-14T00:00:00.000Z',
  });
}

function renderTab(canWrite = true) {
  const showToast = vi.fn();
  render(
    <TournamentCampaignTab
      tournamentId="tournament-1"
      canWrite={canWrite}
      showToast={showToast}
    />,
  );
  return { showToast };
}

describe('TournamentCampaignTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(mocks.campaignQuery, {
      data: campaign,
      isPending: false,
      isError: false,
      error: null,
    });
    Object.assign(mocks.previewQuery, {
      data: preview,
      isPending: false,
      isError: false,
      error: null,
    });
  });

  it('treats only a typed 404 as the no-row create state and validates every required content section', async () => {
    const user = userEvent.setup();
    Object.assign(mocks.campaignQuery, { data: undefined, isError: true, error: notFoundError() });
    Object.assign(mocks.previewQuery, { data: undefined, isError: true, error: notFoundError() });
    renderTab();

    expect(screen.getByText('캠페인이 아직 없어요')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '캠페인 만들기' }));
    await user.click(screen.getByRole('button', { name: '캠페인 생성' }));

    expect(screen.getByText('캠페인 주소를 입력해 주세요.')).toBeInTheDocument();
    expect(screen.getByText('히어로 제목을 입력해 주세요.')).toBeInTheDocument();
    expect(screen.getByText('소개 제목을 입력해 주세요.')).toBeInTheDocument();
    expect(screen.getByText('소개 내용을 입력해 주세요.')).toBeInTheDocument();
    expect(screen.getByText('하이라이트 섹션 제목을 입력해 주세요.')).toBeInTheDocument();
    expect(screen.getByText('FAQ 섹션 제목을 입력해 주세요.')).toBeInTheDocument();
    expect(mocks.createMutate).not.toHaveBeenCalled();
  });

  it('creates the full typed campaign payload after required fields pass validation', async () => {
    const user = userEvent.setup();
    Object.assign(mocks.campaignQuery, { data: undefined, isError: true, error: notFoundError() });
    Object.assign(mocks.previewQuery, { data: undefined, isError: true, error: notFoundError() });
    renderTab();
    await user.click(screen.getByRole('button', { name: '캠페인 만들기' }));

    await user.type(screen.getByLabelText('캠페인 주소'), 'summer-cup');
    await user.type(screen.getByLabelText('히어로 제목'), '여름 풋살 컵');
    await user.type(screen.getByLabelText('소개 제목'), '대회 소개');
    await user.type(screen.getByLabelText('소개 내용'), '여름에 함께 뛰는 대회예요.');
    await user.type(screen.getByLabelText('하이라이트 섹션 제목'), '경기 특징');
    await user.type(screen.getByLabelText('FAQ 섹션 제목'), '참가 안내');
    await user.click(screen.getByRole('button', { name: '캠페인 생성' }));

    expect(mocks.createMutate).toHaveBeenCalledWith(
      {
        slug: 'summer-cup',
        content: {
          version: 1,
          hero: { title: '여름 풋살 컵' },
          intro: { title: '대회 소개', body: '여름에 함께 뛰는 대회예요.' },
          highlightsSectionTitle: '경기 특징',
          highlights: [],
          faqSectionTitle: '참가 안내',
          faq: [],
        },
      },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });

  it('surfaces non-404 query errors instead of presenting a create state', async () => {
    const apiError = new V1ApiError({
      status: 'error',
      statusCode: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: '캠페인 저장소에 연결할 수 없어요.',
      timestamp: '2026-07-14T00:00:00.000Z',
    });
    Object.assign(mocks.campaignQuery, { data: undefined, isError: true, error: apiError });
    renderTab();

    expect(screen.getByText('캠페인 저장소에 연결할 수 없어요.')).toBeInTheDocument();
    expect(screen.queryByText('캠페인이 아직 없어요')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
    expect(mocks.campaignQuery.refetch).toHaveBeenCalled();
  });

  it('does not treat a malformed success response without campaign data as an empty row', () => {
    Object.assign(mocks.campaignQuery, {
      data: undefined,
      isError: false,
      error: null,
    });
    renderTab();

    expect(screen.getByText('캠페인 정보를 불러오지 못했어요.')).toBeInTheDocument();
    expect(screen.queryByText('캠페인이 아직 없어요')).not.toBeInTheDocument();
  });

  it('renders the dedicated preview through the shared campaign template and keeps row identity visible', () => {
    renderTab();

    expect(screen.getByText('teameet-futsal-cup')).toBeInTheDocument();
    expect(screen.getByText('초안')).toBeInTheDocument();
    const previewRegion = screen.getByRole('region', { name: '캠페인 미리보기' });
    expect(within(previewRegion).getByRole('heading', { name: 'Teameet Futsal Cup', level: 1 })).toBeInTheDocument();
    expect(within(previewRegion).getByRole('heading', { name: '대회 하이라이트' })).toBeInTheDocument();
    expect(within(previewRegion).getByRole('heading', { name: '자주 묻는 질문' })).toBeInTheDocument();
    expect(previewRegion.querySelector('[data-preview="true"]')).toBeInTheDocument();
  });

  it('updates content while keeping a previously published slug locked', async () => {
    const user = userEvent.setup();
    Object.assign(mocks.campaignQuery, {
      data: { ...campaign, publishedAt: '2026-07-14T01:00:00.000Z' },
    });
    renderTab();
    await user.click(screen.getByRole('button', { name: '캠페인 편집' }));

    expect(screen.getByLabelText('캠페인 주소')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('히어로 제목'), { target: { value: '수정된 대회 제목' } });
    await user.click(screen.getByRole('button', { name: '변경 저장' }));

    expect(mocks.updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          hero: expect.objectContaining({ title: '수정된 대회 제목' }),
          highlightsSectionTitle: '대회 하이라이트',
          faqSectionTitle: '자주 묻는 질문',
        }),
      }),
      expect.any(Object),
    );
    expect(mocks.updateMutate.mock.calls[0]?.[0]).not.toHaveProperty('slug');
  });

  it('requires a reason to publish and sends the audited lifecycle payload', async () => {
    const user = userEvent.setup();
    renderTab();
    await user.click(screen.getByRole('button', { name: '공개하기' }));
    const publishDialog = screen.getByRole('dialog', { name: '캠페인 상태 변경' });
    expect(within(publishDialog).getByRole('button', { name: '확인' })).toBeDisabled();
    const reasonField = within(publishDialog).getByLabelText(/사유/);
    await user.type(reasonField, '운영 검수 완료');
    expect(reasonField).toHaveValue('운영 검수 완료');
    const submitButton = within(publishDialog).getByRole('button', { name: '확인' });
    expect(submitButton).toBeEnabled();
    await user.click(submitButton);
    expect(mocks.statusMutate).toHaveBeenCalledWith(
      { status: 'published', reason: '운영 검수 완료' },
      expect.any(Object),
    );
  });

  it.each([
    { action: '초안으로 전환', status: 'draft', reason: '문구 재검수 필요' },
    { action: '보관하기', status: 'archived', reason: '대회 종료 후 보관' },
  ])('sends the required reason when a published campaign moves to $status', async ({ action, status, reason }) => {
    const user = userEvent.setup();
    Object.assign(mocks.campaignQuery, { data: { ...campaign, status: 'published' } });
    renderTab();

    await user.click(screen.getByRole('button', { name: action }));
    const dialog = screen.getByRole('dialog', { name: '캠페인 상태 변경' });
    await user.type(within(dialog).getByLabelText(/사유/), reason);
    await user.click(within(dialog).getByRole('button', { name: '확인' }));

    expect(mocks.statusMutate).toHaveBeenCalledWith(
      { status, reason },
      expect.any(Object),
    );
  });

  it('keeps archived campaign identity and permits only the draft restoration transition', () => {
    Object.assign(mocks.campaignQuery, {
      data: {
        ...campaign,
        status: 'archived',
        publishedAt: '2026-07-14T01:00:00.000Z',
        archivedAt: '2026-07-14T02:00:00.000Z',
      },
    });
    renderTab();

    expect(screen.getByText('teameet-futsal-cup')).toBeInTheDocument();
    expect(screen.getByText('보관')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '초안으로 전환' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '캠페인 만들기' })).not.toBeInTheDocument();
  });

  it('keeps support access read-only without create, edit, or lifecycle affordances', () => {
    renderTab(false);

    expect(screen.getByRole('region', { name: '캠페인 미리보기' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '캠페인 편집' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '공개하기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '보관하기' })).not.toBeInTheDocument();
  });
});
