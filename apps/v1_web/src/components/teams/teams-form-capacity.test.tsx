import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { __resetNavigationHistoryForTests, installNavigationHistory } from '@/lib/navigation-history';
import { TeamCreatePageClient, TeamEditPageClient } from './teams-form-client';

const api = vi.hoisted(() => ({ detail: vi.fn(), update: vi.fn(), create: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: api.push, replace: api.replace, back: api.back }),
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1TeamDetail: api.detail,
  useV1UpdateTeam: () => ({ mutateAsync: api.update, isPending: false }),
  useV1CreateTeam: () => ({ mutateAsync: api.create, isPending: false }),
  useV1UploadImages: () => ({ mutateAsync: vi.fn() }),
  useV1MasterRegions: () => ({ data: [{ id: 'region-seoul', name: '서울', parentId: null, level: 1 }] }),
  useV1MasterSports: () => ({ data: [{ id: 'sport-futsal', name: '풋살' }], isPending: false }),
  useV1Profile: () => ({ data: { regions: [] }, isPending: false }),
  useV1TeamNameAvailability: () => ({ data: undefined }),
}));

function team(memberGoalCount: number | null = null, memberCount = 1, version = 'version-1') {
  api.detail.mockReturnValue({
    data: {
      teamId: 'capacity-team', name: '정원 보존 팀', sport: { sportId: 'sport-futsal', name: '풋살' },
      region: { regionId: 'region-seoul', name: '서울', parentName: null },
      profile: {
        logoUrl: null, coverImageUrl: null, introduction: '원래 소개', activityAreaText: null,
        activityDays: [], activityFrequency: null, activityTimeSlots: [], activityTypes: [], activityMemo: null,
        genderRule: '성별 무관', memberGoalCount, joinPolicy: 'approval_required',
        levelLabel: null, skillLevelText: null, minLevel: null, maxLevel: null,
      },
      memberCount, membersVisibilityEnabled: false, version, viewer: { role: 'owner' },
    },
    isError: false, isLoading: false,
  });
}

async function edit() {
  const view = render(<TeamEditPageClient teamId="capacity-team" />);
  const introduction = await screen.findByRole('textbox', { name: '팀 소개' });
  await waitFor(() => expect(introduction).toHaveValue('원래 소개'));
  return { view, introduction, capacity: screen.getByRole('combobox', { name: '정원' }) };
}
function save() { fireEvent.click(screen.getAllByRole('button', { name: '저장' })[0]); }
const result = { teamId: 'capacity-team', detailRoute: '/teams/capacity-team' };

describe('팀 정원 편집 — 실제 client/공용 폼/미저장 확인', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetNavigationHistoryForTests();
    window.history.replaceState({}, '', '/teams/capacity-team/edit');
    installNavigationHistory();
    api.update.mockResolvedValue(result);
    api.create.mockResolvedValue({ teamId: 'new-team', detailRoute: '/teams/new-team' });
    team();
  });
  afterEach(() => { cleanup(); __resetNavigationHistoryForTests(); vi.restoreAllMocks(); });

  it.each([1, 12, 50, 51])('현재 %i명이어도 미정 정원의 소개-only 저장은 null을 보존한다', async (memberCount) => {
    team(null, memberCount);
    const { introduction, capacity } = await edit();
    expect(capacity).toHaveValue('0');
    expect(within(capacity).getByRole('option', { name: '정원 미정' })).toHaveProperty('selected', true);
    expect(within(screen.getByRole('complementary', { name: '팀 미리보기' })).getByText('정원 미정')).toBeInTheDocument();
    fireEvent.change(introduction, { target: { value: '소개만 고쳤어요' } });
    save();
    await waitFor(() => expect(api.update).toHaveBeenCalledWith(expect.objectContaining({ memberGoalCount: null, introduction: '소개만 고쳤어요', version: 'version-1' })));
    await waitFor(() => expect(api.push).toHaveBeenCalledWith(result.detailRoute));
  });

  it.each([2, 24, 50])('숫자 정원 %i를 건드리지 않은 소개 저장은 같은 숫자를 보존한다', async (memberGoalCount) => {
    team(memberGoalCount);
    const { introduction, capacity } = await edit();
    expect(capacity).toHaveValue(String(memberGoalCount));
    fireEvent.change(introduction, { target: { value: '숫자 정원을 유지해요' } });
    save();
    await waitFor(() => expect(api.update).toHaveBeenCalledWith(expect.objectContaining({ memberGoalCount })));
  });

  it.each([[1, 2], [12, 12], [50, 50]])('현재 %i명에서 미정→숫자 선택은 최소%i부터 허용한다', async (memberCount, floor) => {
    team(null, memberCount);
    const { capacity } = await edit();
    const numbers = Array.from(capacity.querySelectorAll('option')).map(x => Number(x.value)).filter(x => x > 0);
    expect(Math.min(...numbers)).toBe(floor);
    expect(Math.max(...numbers)).toBe(50);
    fireEvent.change(capacity, { target: { value: String(floor) } });
    expect(capacity).toHaveValue(String(floor));
    save();
    await waitFor(() => expect(api.update).toHaveBeenCalledWith(expect.objectContaining({ memberGoalCount: floor })));
  });

  it('기존 숫자를 명시 미정으로 저장한 뒤 fixture 재조회 재진입에서도 미정이다', async () => {
    team(24, 12);
    const { view, capacity } = await edit();
    fireEvent.change(capacity, { target: { value: '0' } });
    expect(capacity).toHaveValue('0');
    save();
    await waitFor(() => expect(api.update).toHaveBeenCalledWith(expect.objectContaining({ memberGoalCount: null })));
    const payload = api.update.mock.calls[0][0];
    view.unmount();
    team(payload.memberGoalCount, 12);
    const next = await edit();
    expect(next.capacity).toHaveValue('0');
  });

  it.each([[1, 1, 2], [5, 12, 12]])('기존 잘못된 숫자%i와 현재%i명은 숫자 하한%i로 교정한다', async (source, memberCount, floor) => {
    team(source, memberCount);
    const { capacity } = await edit();
    expect(capacity).toHaveValue(String(floor));
    save();
    await waitFor(() => expect(api.update).toHaveBeenCalledWith(expect.objectContaining({ memberGoalCount: floor })));
  });

  it('미정의 +는 현재 인원 하한을 선택하고 −와 최대50의 +는 범위를 넘지 않는다', async () => {
    team(null, 12);
    const { capacity } = await edit();
    expect(screen.getByRole('button', { name: '정원 한 명 줄이기' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '정원 한 명 늘리기' }));
    expect(capacity).toHaveValue('12');
    fireEvent.click(screen.getByRole('button', { name: '정원 한 명 늘리기' }));
    expect(capacity).toHaveValue('13');
    fireEvent.click(screen.getByRole('button', { name: '정원 한 명 줄이기' }));
    expect(capacity).toHaveValue('12');
    expect(screen.getByRole('button', { name: '정원 한 명 줄이기' })).toBeDisabled();
    fireEvent.change(capacity, { target: { value: '50' } });
    expect(screen.getByRole('button', { name: '정원 한 명 늘리기' })).toBeDisabled();
    save();
    await waitFor(() => expect(api.update).toHaveBeenCalledWith(expect.objectContaining({ memberGoalCount: 50 })));
  });

  it('현재 인원이50을 넘으면 미정만 허용하고 숫자 stepper를 비활성화한다', async () => {
    team(null, 51);
    const { capacity } = await edit();
    expect(Array.from(capacity.querySelectorAll('option')).map(x => x.value)).toEqual(['0']);
    expect(screen.getByRole('button', { name: '정원 한 명 줄이기' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '정원 한 명 늘리기' })).toBeDisabled();
    expect(screen.getByText(/지금 팀원이 51명이라 50명 이하로 정할 수 없어요/)).toBeInTheDocument();
  });

  it('현재51명/기존 숫자50은 범위 밖 초안을 숨기지 않고 명시 미정 선택 후에만 null을 저장한다', async () => {
    team(50, 51);
    const { capacity } = await edit();
    expect(capacity).toHaveValue('51');
    expect(within(capacity).getByRole('option', { name: '51명 (변경 필요)' })).toBeDisabled();
    expect(within(capacity).getByRole('option', { name: '정원 미정' })).not.toHaveProperty('selected', true);
    fireEvent.change(capacity, { target: { value: '0' } });
    expect(capacity).toHaveValue('0');
    save();
    await waitFor(() => expect(api.update).toHaveBeenCalledWith(expect.objectContaining({ memberGoalCount: null })));
  });

  it('숫자↔미정과 소개 연속 입력은 마지막 선택만 저장한다', async () => {
    team(null, 12);
    const { capacity, introduction } = await edit();
    for (const value of ['12', '18', '0', '14', '0']) fireEvent.change(capacity, { target: { value } });
    for (const value of ['첫 소개', '중간 소개', '마지막 소개']) fireEvent.change(introduction, { target: { value } });
    save();
    await waitFor(() => expect(api.update).toHaveBeenCalledWith(expect.objectContaining({ memberGoalCount: null, introduction: '마지막 소개' })));
    expect(api.update).toHaveBeenCalledTimes(1);
  });

  it('서버 version이 바뀌지 않은 일시500 후 재시도는 미정 초안을 보존한다', async () => {
    api.update.mockRejectedValueOnce(new V1ApiError({ status: 'error', statusCode: 500, code: 'INTERNAL_ERROR', message: 'temporary failure before update', timestamp: '2026-10-02T00:00:00Z' }));
    const { introduction, capacity } = await edit();
    fireEvent.change(introduction, { target: { value: '재시도할 소개' } });
    save();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(api.push).not.toHaveBeenCalled();
    expect(capacity).toHaveValue('0');
    save();
    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(2));
    for (const [payload] of api.update.mock.calls) expect(payload).toMatchObject({ memberGoalCount: null, introduction: '재시도할 소개', version: 'version-1' });
    await waitFor(() => expect(api.push).toHaveBeenCalledWith(result.detailRoute));
  });

  it.each([null, 24])('정원 %s의 stale version 재제출도409이고 초안/실패를 유지한다', async (memberGoalCount) => {
    team(memberGoalCount);
    api.update.mockImplementation(async (payload) => {
      if (payload.version !== 'version-2') {
        throw new V1ApiError({ status: 'error', statusCode: 409, code: 'VERSION_CONFLICT', message: 'stale', timestamp: '2026-10-02T00:00:00Z' });
      }
      return result;
    });
    const { introduction, capacity } = await edit();
    fireEvent.change(introduction, { target: { value: '충돌 뒤에도 남길 소개' } });
    for (const attempt of [1, 2]) {
      save();
      await waitFor(() => expect(api.update).toHaveBeenCalledTimes(attempt));
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent('다른 사람이 먼저 팀 정보를 바꿨어요. 새로 불러온 뒤 다시 저장해 주세요.');
      expect(api.push).not.toHaveBeenCalled();
      expect(introduction).toHaveValue('충돌 뒤에도 남길 소개');
      expect(capacity).toHaveValue(String(memberGoalCount ?? 0));
    }
    for (const [payload] of api.update.mock.calls) expect(payload).toMatchObject({ memberGoalCount, introduction: '충돌 뒤에도 남길 소개', version: 'version-1' });
  });

  it('상세 fixture 재조회로 새 version을 hydrate한 뒤 다시 쓴 소개만 성공시킨다', async () => {
    api.update.mockImplementation(async (payload) => {
      if (payload.version !== 'version-2') {
        throw new V1ApiError({ status: 'error', statusCode: 409, code: 'VERSION_CONFLICT', message: 'stale', timestamp: '2026-10-02T00:00:00Z' });
      }
      return result;
    });
    const { view, introduction, capacity } = await edit();
    fireEvent.change(introduction, { target: { value: '재조회 전 소개 초안' } });
    save();
    expect(await screen.findByRole('alert')).toHaveTextContent('다른 사람이 먼저 팀 정보를 바꿨어요. 새로 불러온 뒤 다시 저장해 주세요.');
    expect(api.push).not.toHaveBeenCalled();
    team(null, 1, 'version-2');
    view.rerender(<TeamEditPageClient teamId="capacity-team" />);
    // 기존 hydrate는 초안 전체를 서버 값으로 바꾼다. 자동 재조회/초안 병합의 증거가 아니다.
    await waitFor(() => expect(introduction).toHaveValue('원래 소개'));
    expect(capacity).toHaveValue('0');
    fireEvent.change(introduction, { target: { value: '재조회 뒤 다시 쓴 소개' } });
    save();
    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(2));
    expect(api.update.mock.calls[1][0]).toMatchObject({ memberGoalCount: null, introduction: '재조회 뒤 다시 쓴 소개', version: 'version-2' });
    await waitFor(() => expect(api.push).toHaveBeenCalledWith(result.detailRoute));
  });

  it('같은 tick의 반복 제출과 pending 중 재클릭은 한 번만 저장한다', async () => {
    let finish!: (value: typeof result) => void;
    api.update.mockImplementationOnce(() => new Promise<typeof result>(resolve => { finish = resolve; }));
    const { introduction } = await edit();
    fireEvent.change(introduction, { target: { value: '중복 방지 소개' } });
    save(); save(); save();
    expect(api.update).toHaveBeenCalledTimes(1);
    expect(api.update.mock.calls[0][0].memberGoalCount).toBeNull();
    await act(async () => { finish(result); });
    await waitFor(() => expect(api.push).toHaveBeenCalledTimes(1));
  });

  it.each(['취소', '뒤로가기'])('%s의 실제 미저장 모달에서 Escape는 초안을 유지하고 저장하지 않는다', async (action) => {
    team(24, 12);
    const { introduction, capacity } = await edit();
    fireEvent.change(capacity, { target: { value: '0' } });
    fireEvent.change(introduction, { target: { value: '취소하지 않을 초안' } });
    const trigger = action === '취소' ? screen.getAllByRole('link', { name: '취소' })[0] : screen.getByRole('link', { name: '뒤로가기' });
    fireEvent.click(trigger);
    expect(await screen.findByRole('dialog', { name: '작성 중인 내용이 사라져요. 나갈까요?' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(capacity).toHaveValue('0');
    expect(introduction).toHaveValue('취소하지 않을 초안');
    expect(api.update).not.toHaveBeenCalled();
    expect(api.push).not.toHaveBeenCalled();
  });

  it('작성 기본 정원24와 최소2/최대50 숫자 선택을 유지한다', async () => {
    window.history.replaceState({}, '', '/teams/new');
    render(<TeamCreatePageClient />);
    fireEvent.change(screen.getByRole('textbox', { name: '팀 이름' }), { target: { value: '새 풋살 팀' } });
    fireEvent.click(screen.getByRole('button', { name: /더 꾸미기/ }));
    const capacity = screen.getByRole('combobox', { name: '정원' });
    expect(capacity).toHaveValue('24');
    expect(within(capacity).queryByRole('option', { name: '정원 미정' })).not.toBeInTheDocument();
    expect(Array.from(capacity.querySelectorAll('option')).map(x => Number(x.value))).toEqual(Array.from({ length: 49 }, (_, i) => i + 2));
    fireEvent.click(screen.getAllByRole('button', { name: '팀 만들기' })[0]);
    await waitFor(() => expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ memberGoalCount: 24 })));
  });
});
