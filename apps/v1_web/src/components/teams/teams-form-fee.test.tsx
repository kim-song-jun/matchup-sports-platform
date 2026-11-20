import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetNavigationHistoryForTests, installNavigationHistory } from '@/lib/navigation-history';
import { TeamEditPageClient } from './teams-form-client';

const api = vi.hoisted(() => ({ detail: vi.fn(), update: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: api.push, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1TeamDetail: api.detail,
  useV1UpdateTeam: () => ({ mutateAsync: api.update, isPending: false }),
  useV1CreateTeam: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useV1UploadImages: () => ({ mutateAsync: vi.fn() }),
  useV1MasterRegions: () => ({ data: [{ id: 'region-seoul', name: '서울', parentId: null, level: 1 }] }),
  useV1MasterSports: () => ({ data: [{ id: 'sport-futsal', name: '풋살' }], isPending: false }),
  useV1Profile: () => ({ data: { regions: [] }, isPending: false }),
  useV1TeamNameAvailability: () => ({ data: undefined }),
}));

function team(membershipFee: number | null) {
  api.detail.mockReturnValue({
    data: {
      teamId: 'fee-team', name: '회비 팀', sport: { sportId: 'sport-futsal', name: '풋살' },
      region: { regionId: 'region-seoul', name: '서울', parentName: null },
      profile: {
        logoUrl: null, coverImageUrl: null, introduction: '원래 소개', activityAreaText: null,
        activityDays: [], activityFrequency: null, activityTimeSlots: [], activityTypes: [], activityMemo: null,
        genderRule: '성별 무관', memberGoalCount: null, membershipFee, joinPolicy: 'approval_required',
        levelLabel: null, skillLevelText: null, minLevel: null, maxLevel: null,
      },
      memberCount: 1, membersVisibilityEnabled: false, version: 'v1', viewer: { role: 'owner' },
    },
    isError: false, isLoading: false,
  });
}

async function edit() {
  render(<TeamEditPageClient teamId="fee-team" />);
  const introduction = await screen.findByRole('textbox', { name: '팀 소개' });
  await waitFor(() => expect(introduction).toHaveValue('원래 소개'));
}
function save() { fireEvent.click(screen.getAllByRole('button', { name: '저장' })[0]); }

describe('팀 회비 편집', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetNavigationHistoryForTests();
    window.history.replaceState({}, '', '/teams/fee-team/edit');
    installNavigationHistory();
    api.update.mockResolvedValue({ teamId: 'fee-team', detailRoute: '/teams/fee-team' });
  });
  afterEach(() => { cleanup(); __resetNavigationHistoryForTests(); });

  it('정하지 않은 팀은 건드리지 않고 저장해도 null을 보낸다', async () => {
    team(null);
    await edit();
    save();
    await waitFor(() => expect(api.update).toHaveBeenCalledWith(expect.objectContaining({ membershipFee: null })));
  });

  it('없음을 고르면 0, 있음에 금액을 쓰면 그 금액을 보낸다', async () => {
    team(null);
    await edit();
    fireEvent.click(screen.getByRole('button', { name: '없음' }));
    save();
    await waitFor(() => expect(api.update).toHaveBeenLastCalledWith(expect.objectContaining({ membershipFee: 0 })));

    fireEvent.click(screen.getByRole('button', { name: '있음' }));
    fireEvent.change(screen.getByRole('textbox', { name: '월 회비(원)' }), { target: { value: '30,000원' } });
    expect(screen.getByRole('textbox', { name: '월 회비(원)' })).toHaveValue('30,000');
    save();
    await waitFor(() => expect(api.update).toHaveBeenLastCalledWith(expect.objectContaining({ membershipFee: 30000 })));
  });

  it('저장된 회비는 있음과 금액으로 열린다', async () => {
    team(15000);
    await edit();
    expect(screen.getByRole('button', { name: '있음' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('textbox', { name: '월 회비(원)' })).toHaveValue('15,000');
  });
});
