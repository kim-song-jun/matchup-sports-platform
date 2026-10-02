import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import type { V1TeamDetail } from '@/types/api';
import { TeamCreatePageClient, TeamEditPageClient } from './teams-form-client';

const api = vi.hoisted(() => ({
  detail: vi.fn(), update: vi.fn(), create: vi.fn(), push: vi.fn(), confirm: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: api.push, replace: vi.fn() }),
  usePathname: () => '/teams/team-futsal/edit',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/components/v1-ui/confirm-modal', () => ({
  useConfirm: () => ({ confirm: api.confirm, ConfirmModal: null }),
}));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1TeamDetail: api.detail,
  useV1UpdateTeam: () => ({ mutateAsync: api.update, isPending: false }),
  useV1CreateTeam: () => ({ mutateAsync: api.create, isPending: false }),
  useV1UploadImages: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useV1MasterRegions: () => ({ data: [{ id: 'region-seoul', name: '서울', parentId: null, level: 1 }] }),
  useV1MasterSports: () => ({ data: [{ id: 'sport-futsal', name: '풋살' }], isPending: false }),
  useV1Profile: () => ({ data: { regions: [] }, isPending: false }),
  useV1TeamNameAvailability: () => ({ data: undefined }),
}));

type LevelSource = Pick<V1TeamDetail['profile'], 'levelLabel' | 'skillLevelText' | 'minLevel' | 'maxLevel'>;
const unset: LevelSource = { levelLabel: null, skillLevelText: null, minLevel: null, maxLevel: null };

function teamWithLevel(level: LevelSource) {
  api.detail.mockReturnValue({
    data: {
      teamId: 'team-futsal', name: '레벨 보존 팀', sport: { sportId: 'sport-futsal', name: '풋살' },
      region: { regionId: 'region-seoul', name: '서울', parentName: null },
      profile: {
        logoUrl: null, coverImageUrl: null, introduction: '원래 소개', activityAreaText: null,
        activityDays: [], activityFrequency: null, activityTimeSlots: [], activityTypes: [], activityMemo: null,
        genderRule: '성별 무관', memberGoalCount: null, joinPolicy: 'approval_required', ...level,
      },
      memberCount: 1, membersVisibilityEnabled: false, version: 'version-1', viewer: { role: 'owner' },
    },
    isError: false, isLoading: false,
  });
}

async function editIntroduction() {
  render(<TeamEditPageClient teamId="team-futsal" />);
  const introduction = await screen.findByRole('textbox', { name: '팀 소개' });
  await waitFor(() => expect(introduction).toHaveValue('원래 소개'));
  fireEvent.change(introduction, { target: { value: '소개만 고쳤어요' } });
}

function save() {
  fireEvent.click(screen.getAllByRole('button', { name: '저장' })[0]);
}

describe('팀 레벨 편집 — 실제 client와 공용 폼 렌더', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/teams/team-futsal/edit');
    api.confirm.mockResolvedValue(false);
    api.update.mockResolvedValue({ teamId: 'team-futsal', detailRoute: '/teams/team-futsal' });
    api.create.mockResolvedValue({ teamId: 'new-team', detailRoute: '/teams/new-team' });
    teamWithLevel(unset);
  });

  it.each([
    ['미설정', unset],
    ['단일', { levelLabel: '중수', skillLevelText: null, minLevel: { code: 'intermediate', name: '중수' }, maxLevel: { code: 'intermediate', name: '중수' } }],
    ['범위', { levelLabel: '초보-중수', skillLevelText: null, minLevel: { code: 'novice', name: '초보' }, maxLevel: { code: 'intermediate', name: '중수' } }],
    ['전체 범위', { levelLabel: '입문-고수', skillLevelText: '전체 레벨', minLevel: { code: 'beginner', name: '입문' }, maxLevel: { code: 'advanced', name: '고수' } }],
    ['자유 텍스트', { levelLabel: '즐겁게 함께 운동', skillLevelText: '즐겁게 함께 운동', minLevel: null, maxLevel: null }],
  ] satisfies Array<[string, LevelSource]>)('%s 레벨을 건드리지 않은 소개 저장은 원본 코드·텍스트를 보존한다', async (_label, level) => {
    teamWithLevel(level);
    await editIntroduction();
    save();
    save();

    await waitFor(() => expect(api.update).toHaveBeenCalledWith(expect.objectContaining({
      introduction: '소개만 고쳤어요', version: 'version-1', memberGoalCount: 2,
      skillLevelText: level.skillLevelText, minLevelCode: level.minLevel?.code ?? null, maxLevelCode: level.maxLevel?.code ?? null,
    })));
    await waitFor(() => expect(api.push).toHaveBeenCalledWith('/teams/team-futsal'));
    expect(api.update).toHaveBeenCalledTimes(1);
  });

  it('미설정 레벨은 select와 미리보기에서 미설정으로 표시한다', async () => {
    await editIntroduction();
    const select = screen.getByRole('combobox', { name: '레벨' });
    expect(select).toHaveValue('');
    expect(within(select).getByRole('option', { name: '레벨 미설정' })).toHaveProperty('selected', true);
    expect(within(screen.getByRole('complementary', { name: '팀 미리보기' })).getByText('레벨 미설정')).toBeInTheDocument();
  });

  it.each([
    ['전체 레벨', 'beginner', 'advanced'],
    ['중수', 'intermediate', 'intermediate'],
    ['초보-중수', 'novice', 'intermediate'],
  ])('미설정에서 %s를 직접 선택하면 해당 코드 범위를 저장한다', async (value, minLevelCode, maxLevelCode) => {
    await editIntroduction();
    const select = screen.getByRole('combobox', { name: '레벨' });
    expect(select).toHaveValue('');
    fireEvent.change(select, { target: { value } });
    expect(select).toHaveValue(value);
    save();
    await waitFor(() => expect(api.update).toHaveBeenCalledWith(expect.objectContaining({ skillLevelText: value, minLevelCode, maxLevelCode })));
  });

  it('기존 범위가 기본 선택지에 없어도 그 값을 보여 주고 명시적으로 미설정으로 바꿀 수 있다', async () => {
    teamWithLevel({ levelLabel: '입문-중수', skillLevelText: null, minLevel: { code: 'beginner', name: '입문' }, maxLevel: { code: 'intermediate', name: '중수' } });
    await editIntroduction();
    const select = screen.getByRole('combobox', { name: '레벨' });
    expect(select).toHaveValue('입문-중수');
    fireEvent.change(select, { target: { value: '' } });
    save();
    await waitFor(() => expect(api.update).toHaveBeenCalledWith(expect.objectContaining({ skillLevelText: null, minLevelCode: null, maxLevelCode: null })));
  });

  it('전체→단일→전체 연속 선택 뒤 최종 선택만 저장한다', async () => {
    await editIntroduction();
    const select = screen.getByRole('combobox', { name: '레벨' });
    for (const value of ['전체 레벨', '중수', '전체 레벨']) fireEvent.change(select, { target: { value } });
    save();
    await waitFor(() => expect(api.update).toHaveBeenCalledWith(expect.objectContaining({ skillLevelText: '전체 레벨', minLevelCode: 'beginner', maxLevelCode: 'advanced' })));
    expect(api.update).toHaveBeenCalledTimes(1);
  });

  it('실패 후 소개만 다시 저장해도 null을 보존하고 실패를 성공 이동으로 숨기지 않는다', async () => {
    api.update.mockRejectedValueOnce(new V1ApiError({ status: 'error', statusCode: 409, code: 'VERSION_CONFLICT', message: 'stale', timestamp: '2026-10-02T00:00:00Z' }));
    await editIntroduction();
    save();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(api.push).not.toHaveBeenCalled();
    save();
    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(2));
    for (const [payload] of api.update.mock.calls) expect(payload).toMatchObject({ skillLevelText: null, minLevelCode: null, maxLevelCode: null });
    await waitFor(() => expect(api.push).toHaveBeenCalledWith('/teams/team-futsal'));
  });

  it('소개와 레벨을 고친 뒤 취소 확인에서 머물면 저장 요청 없이 초안을 유지한다', async () => {
    await editIntroduction();
    fireEvent.change(screen.getByRole('combobox', { name: '레벨' }), { target: { value: '전체 레벨' } });
    fireEvent.click(screen.getAllByRole('link', { name: '취소' })[0]);
    await waitFor(() => expect(api.confirm).toHaveBeenCalled());
    expect(api.update).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: '레벨' })).toHaveValue('전체 레벨');
    expect(screen.getByRole('textbox', { name: '팀 소개' })).toHaveValue('소개만 고쳤어요');
  });

  it('팀 만들기의 기본 전체 레벨은 기존 전체 범위 저장 계약을 유지한다', async () => {
    render(<TeamCreatePageClient />);
    fireEvent.change(screen.getByRole('textbox', { name: '팀 이름' }), { target: { value: '새 풋살 팀' } });
    fireEvent.click(screen.getByRole('button', { name: /더 꾸미기/ }));
    expect(screen.getByRole('combobox', { name: '레벨' })).toHaveValue('전체 레벨');
    fireEvent.click(screen.getAllByRole('button', { name: '팀 만들기' })[0]);
    await waitFor(() => expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ skillLevelText: '전체 레벨', minLevelCode: 'beginner', maxLevelCode: 'advanced' })));
  });
});
