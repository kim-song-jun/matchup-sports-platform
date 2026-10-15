import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetNavigationHistoryForTests } from '@/lib/navigation-history';
import { __resetOverlayHistoryForTests } from '@/lib/overlay-history';
import { v1Keys } from '@/lib/query-keys';
import { installViewport, resizeViewport } from '@/test/viewport';
import { makeGame } from '@/test/bracket-canvas-fixtures';
import AdminLeagueDetailLayout from './layout';
import AdminLeagueSchedulePage from './schedule/page';
import {
  MOBILE_FIXTURE_ID, MOBILE_LEAGUE_ID, mobileEditorFixture, mobileEditorServer,
  mobileFixture, mobileLeague, resetMobileEditorFixture,
} from './league-mobile-editor.fixtures';

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/league-matches/synthetic-mobile-league-138/schedule',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

const clients: QueryClient[] = [];
let restoreViewport: (() => void) | undefined;
const recordedOfficialGame = makeGame({
  id: 'synthetic-recorded-game-138', state: 'ENDED', hasLiveRecords: true, hasOfficialResult: true,
  latestRevision: { id: 'synthetic-official-revision-138', state: 'OFFICIAL', entryMethod: 'console', score: { home: 2, away: 1 } },
});

beforeAll(() => mobileEditorServer.listen({ onUnhandledRequest: 'error' }));
afterAll(() => mobileEditorServer.close());
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  resetMobileEditorFixture();
  restoreViewport = installViewport(390);
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  restoreViewport?.();
  __resetOverlayHistoryForTests();
  __resetNavigationHistoryForTests();
  mobileEditorServer.resetHandlers();
  vi.unstubAllEnvs();
});

async function renderMobileConsumer() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  // 헤더·권한은 공통 셸, 일정은 하위 페이지가 소유하므로 실제 route 조합을 함께 검증해요.
  const params = Promise.resolve({ leagueId: MOBILE_LEAGUE_ID });
  const route = await AdminLeagueDetailLayout({
    params,
    children: await AdminLeagueSchedulePage({ params, searchParams: Promise.resolve({}) }),
  });
  render(<QueryClientProvider client={client}>{route}</QueryClientProvider>);
  await screen.findByRole('heading', { level: 1, name: '합성 모바일 리그' });
  await waitFor(() => expect(client.getQueryState(v1Keys.adminMe())?.status).toBe('success'));
  if (mobileEditorFixture.canWrite) await screen.findByRole('button', { name: '상태 변경' });
}

async function openMobileSchedule() {
  fireEvent.click(await screen.findByRole('button', { name: /모바일 리그 1주차/ }));
  const sheet = await screen.findByRole('dialog', { name: '모바일 리그 1주차' });
  fireEvent.click(within(sheet).getByRole('button', { name: /경기 수정|일정 수정/ }));
  const dialog = await screen.findByRole('dialog', { name: '경기 수정' });
  await waitFor(() => expect(within(dialog).getByLabelText('등록된 경기장(필드)')).toBeEnabled());
  return dialog;
}

async function submitTemplate(replaceExisting: boolean) {
  fireEvent.click(await screen.findByRole('button', { name: replaceExisting ? '템플릿으로 다시 만들기' : '템플릿으로 시작' }));
  const dialog = await screen.findByRole('dialog', { name: replaceExisting ? '템플릿으로 다시 만들기' : '템플릿으로 빈 경기 만들기' });
  fireEvent.change(within(dialog).getByLabelText('요일'), { target: { value: '1' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '요일로 채우기' }));
  fireEvent.click(within(dialog).getByRole('button', { name: replaceExisting ? '다시 만들기' : '빈 경기 만들기' }));
}

describe('MD-QA #138 초기 모바일 consumer → 실제 편집 → HTTP 저장', () => {
  it('390으로 처음 연 빈 리그에서도 기존 템플릿으로 만들고 다시 조회한 경기 상세를 열어요', async () => {
    // Given: 이전 데스크톱 렌더 없이 390px에서 빈 리그를 연다.
    mobileEditorFixture.league = mobileLeague([]);
    await renderMobileConsumer();
    // When: 실제 템플릿 폼을 저장한다.
    await submitTemplate(false);
    // Then: 기존 wire contract와 저장 후 실제 consumer 화면이 함께 성립한다.
    await waitFor(() => expect(mobileEditorFixture.templateWrites).toEqual([{
      teamCount: 3, legs: 1,
      schedule: { dates: ['2100-01-04', '2100-01-11', '2100-01-18'], time: '19:00' },
    }]));
    expect(await screen.findByRole('dialog', { name: '모바일 생성 1주차' })).toBeVisible();
    expect(screen.queryByRole('dialog', { name: '템플릿으로 빈 경기 만들기' })).not.toBeInTheDocument();
  });

  it('기존 미시작 경기도 모바일 템플릿 교체에서 replaceExisting 계약을 보내요', async () => {
    // Given
    mobileEditorFixture.league = mobileLeague([mobileFixture({ game: makeGame() })]);
    await renderMobileConsumer();
    // When
    await submitTemplate(true);
    // Then
    await waitFor(() => expect(mobileEditorFixture.templateWrites).toEqual([{
      teamCount: 3, legs: 1, replaceExisting: true,
      schedule: { dates: ['2100-01-04', '2100-01-11', '2100-01-18'], time: '19:00' },
    }]));
    expect(await screen.findByRole('dialog', { name: '모바일 생성 1주차' })).toBeVisible();
  });

  it('모바일 경기 수정 중 폭을 바꿔도 입력한 이름과 일시를 유지하고 실제 PATCH로 저장해요', async () => {
    // Given
    await renderMobileConsumer();
    const dialog = await openMobileSchedule();
    fireEvent.change(within(dialog).getByLabelText('경기 이름'), { target: { value: '모바일에서 바꾼 경기' } });
    fireEvent.change(within(dialog).getByLabelText('일시'), { target: { value: '2100-01-04T20:00' } });
    // When: 입력한 뒤 태블릿·데스크톱·모바일로 전환해도 같은 수정 흐름을 이어가요.
    for (const width of [768, 1440, 390]) {
      resizeViewport(width);
      const retained = screen.getByRole('dialog', { name: '경기 수정' });
      expect(within(retained).getByLabelText('경기 이름')).toHaveValue('모바일에서 바꾼 경기');
      expect(within(retained).getByLabelText('일시')).toHaveValue('2100-01-04T20:00');
    }
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
    // Then
    await waitFor(() => expect(mobileEditorFixture.fixtureWrites).toEqual([{
      fixtureId: MOBILE_FIXTURE_ID,
      body: { title: '모바일에서 바꾼 경기', startsAt: '2100-01-04T11:00:00.000Z' },
    }]));
    expect(await screen.findByRole('button', { name: /모바일에서 바꾼 경기/ })).toBeVisible();
    expect(screen.queryByRole('dialog', { name: '경기 수정' })).not.toBeInTheDocument();
  });

  it('취소 이력만 있는 모바일 리그도 실제 template POST에 replaceExisting을 보내고 새 경기로 이동해요', async () => {
    // Given: 아직 숨기지 않은 취소 대진은 현재 상세에 남지만 템플릿 보호 대상에서는 빠져요.
    mobileEditorFixture.league = mobileLeague([mobileFixture({
      status: 'cancelled', gameState: 'SCHEDULED', resultStage: 'draft', startAt: '2099-12-28T10:00:00.000Z',
      game: makeGame({ latestRevision: { id: 'cancelled-draft-138', state: 'DRAFT', score: null, entryMethod: 'console' } }),
    })]);
    await renderMobileConsumer();
    // When: 실제 모바일 CTA와 기존 템플릿 폼을 밟아요.
    fireEvent.click(await screen.findByRole('button', { name: /^템플릿으로 (시작|다시 만들기)$/ }));
    const dialog = await screen.findByRole('dialog', { name: /^템플릿으로 (빈 경기 만들기|다시 만들기)$/ });
    fireEvent.change(within(dialog).getByLabelText('요일'), { target: { value: '1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '요일로 채우기' }));
    fireEvent.click(within(dialog).getByRole('button', { name: /^(빈 경기 만들기|다시 만들기)$/ }));
    // Then: 기존 대진은 이력을 보존해 숨기고 새 일정만 조회하는 실제 서버 계약을 따라요.
    await waitFor(() => expect(mobileEditorFixture.templateWrites).toEqual([{
      teamCount: 3, legs: 1, replaceExisting: true,
      schedule: { dates: ['2100-01-04', '2100-01-11', '2100-01-18'], time: '19:00' },
    }]));
    expect(await screen.findByRole('dialog', { name: '모바일 생성 1주차' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /모바일 리그 1주차/ })).not.toBeInTheDocument();
    expect(mobileEditorFixture.hiddenFixtures).toEqual([expect.objectContaining({
      teamMatchId: MOBILE_FIXTURE_ID, status: 'cancelled', deletedAt: expect.any(String),
    })]);
    expect(mobileEditorFixture.league.fixtures).toHaveLength(3);
    expect(mobileEditorFixture.league.fixtures.some((fixture) => fixture.teamMatchId === MOBILE_FIXTURE_ID)).toBe(false);
  });

  it('모바일 수정의 서버 거절은 입력과 실제 오류를 남기고 성공 화면으로 닫지 않아요', async () => {
    // Given
    mobileEditorFixture.updateFails = true;
    await renderMobileConsumer();
    const dialog = await openMobileSchedule();
    fireEvent.change(within(dialog).getByLabelText('경기 이름'), { target: { value: '거절된 경기 이름' } });
    // When
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }));
    // Then
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('경기 결과가 생겨 저장하지 못했어요.');
    expect(within(dialog).getByLabelText('경기 이름')).toHaveValue('거절된 경기 이름');
    expect(screen.queryByText('경기를 저장했어요.')).not.toBeInTheDocument();
    expect(mobileEditorFixture.league.fixtures[0]?.title).toBe('모바일 리그 1주차');
  });

  it.each(['official', 'voided'] as const)('%s 결과가 있는 경기는 새 모바일 편집 경로에서도 팀 변경과 템플릿 교체를 막아요', async (resultStage) => {
    // Given
    mobileEditorFixture.league = mobileLeague([mobileFixture({ resultStage, gameState: 'ENDED' })]);
    await renderMobileConsumer();
    // When
    const dialog = await openMobileSchedule();
    // Then
    expect(within(dialog).getByLabelText('홈 팀')).toBeDisabled();
    expect(within(dialog).getByLabelText('원정 팀')).toBeDisabled();
    expect(within(dialog).getByText('시작했거나 결과가 있는 경기는 팀을 바꿀 수 없어요.')).toBeVisible();
    expect(screen.queryByRole('button', { name: '템플릿으로 다시 만들기' })).not.toBeInTheDocument();
    expect(mobileEditorFixture.templateWrites).toEqual([]);
    expect(mobileEditorFixture.fixtureWrites).toEqual([]);
  });

  it.each([
    ['draft', 'DRAFT'], ['awaiting_approval', 'SUBMITTED'], ['change_requested', 'CHANGE_REQUESTED'],
  ] as const)('시작 전 %s 결과 리비전이 있으면 서버가 거절할 템플릿 교체를 열지 않아요', async (resultStage, revisionState) => {
    // Given: SCHEDULED여도 실제 상세 응답의 latestRevision이 있으면 revisionCount는 0이 아니에요.
    mobileEditorFixture.league = mobileLeague([mobileFixture({
      resultStage, gameState: 'SCHEDULED', game: makeGame({
        latestRevision: { id: `revision-${revisionState}-138`, state: revisionState, score: { home: 2, away: 1 }, entryMethod: 'console' },
      }),
    })]);
    // When: 관리자 권한·리그 상세를 실제 GET으로 읽어 처음 모바일 보드를 열어요.
    await renderMobileConsumer();
    // Then: 교체 POST로 결과 이력을 덮으려는 진입 대신 서버와 같은 제한 이유를 보여줘요.
    expect(screen.queryByRole('button', { name: '템플릿으로 다시 만들기' })).not.toBeInTheDocument();
    expect(screen.getByText('시작했거나 결과가 있는 경기가 있어 템플릿으로 다시 만들 수 없어요.')).toBeVisible();
    expect(mobileEditorFixture.templateWrites).toEqual([]);
    expect(mobileEditorFixture.hiddenFixtures).toEqual([]);
  });

  it('완료된 빈 리그는 모바일에서도 재생성 대신 완료 제한 이유를 보여줘요', async () => {
    // Given
    mobileEditorFixture.league = { ...mobileLeague([]), state: 'completed' };
    await renderMobileConsumer();
    // When: 모바일 최초 표시를 읽는다.
    // Then
    expect(screen.queryByRole('button', { name: '템플릿으로 시작' })).not.toBeInTheDocument();
    expect(screen.getAllByText(/끝난 리그/).length).toBeGreaterThan(0);
    expect(mobileEditorFixture.templateWrites).toEqual([]);
  });

  it('완료 리그의 실제 결과 정정 출구는 유지하고 경기 구조 편집은 열지 않아요', async () => {
    // Given: 결과가 남은 종료 리그를 쓰기 권한이 있는 운영자가 처음 모바일로 열어요.
    mobileEditorFixture.league = {
      ...mobileLeague([mobileFixture({ resultStage: 'official', gameState: 'ENDED', game: recordedOfficialGame, homeScore: 2, awayScore: 1 })]),
      state: 'completed',
    };
    await renderMobileConsumer();
    // When: 기존 경기의 상세는 계속 열어 이력을 확인해요.
    fireEvent.click(await screen.findByRole('button', { name: /모바일 리그 1주차/ }));
    const sheet = await screen.findByRole('dialog', { name: '모바일 리그 1주차' });
    // Then: updateFixture의 LEAGUE_ENDED 계약에 맞춰 저장할 수 없는 수정 진입은 없어요.
    expect(within(sheet).getByText('합성 홈팀')).toBeVisible();
    expect(within(sheet).getByText('합성 원정팀')).toBeVisible();
    const correctionLink = within(sheet).getByRole('link', { name: '결과 정정 화면으로 가기' });
    expect(correctionLink).toBeVisible();
    expect(correctionLink).toHaveAttribute('href', `/admin/live/${MOBILE_LEAGUE_ID}/records/corrections?fixtureId=${MOBILE_FIXTURE_ID}`);
    expect(within(sheet).queryByRole('button', { name: /^(홈|어웨이) 팀 (바꾸기|고르기)$/ })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: /경기 수정|일정 수정/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '경기 수정' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('경기 이름')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '템플릿으로 다시 만들기' })).not.toBeInTheDocument();
    expect(mobileEditorFixture.fixtureWrites).toEqual([]);
    expect(mobileEditorFixture.templateWrites).toEqual([]);
  });

  it('쓰기 권한 없는 첫 모바일 진입은 경기 내용만 보이고 새 편집 쓰기를 열지 않아요', async () => {
    // Given
    mobileEditorFixture.canWrite = false;
    mobileEditorFixture.league = {
      ...mobileLeague([mobileFixture({ resultStage: 'official', gameState: 'ENDED', game: recordedOfficialGame })]),
      state: 'completed',
    };
    await renderMobileConsumer();
    expect(screen.queryByRole('button', { name: '상태 변경' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '공개로 전환' })).toBeDisabled();
    // When
    fireEvent.click(await screen.findByRole('button', { name: /모바일 리그 1주차/ }));
    // Then
    const sheet = await screen.findByRole('dialog', { name: '모바일 리그 1주차' });
    expect(within(sheet).getByText('합성 홈팀')).toBeVisible();
    expect(within(sheet).queryByRole('link', { name: '결과 정정 화면으로 가기' })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: /경기 수정|일정 수정/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '템플릿으로 다시 만들기' })).not.toBeInTheDocument();
    expect(mobileEditorFixture.fixtureWrites).toEqual([]);
    expect(mobileEditorFixture.templateWrites).toEqual([]);
  });

  it('모바일 템플릿 작성 중 폭을 바꿔도 선택한 요일·시각·날짜를 유지하고 실제 저장해요', async () => {
    // Given
    mobileEditorFixture.league = mobileLeague([]);
    await renderMobileConsumer();
    // When: 390에서 입력을 시작한 후 화면 폭을 바꾸며 작성 중인 내용을 확인해요.
    fireEvent.click(await screen.findByRole('button', { name: '템플릿으로 시작' }));
    const dialog = await screen.findByRole('dialog', { name: '템플릿으로 빈 경기 만들기' });
    fireEvent.change(within(dialog).getByLabelText('시작 시각'), { target: { value: '20:30' } });
    fireEvent.change(within(dialog).getByLabelText('요일'), { target: { value: '1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '요일로 채우기' }));
    for (const width of [768, 1440, 390]) {
      resizeViewport(width);
      const retained = screen.getByRole('dialog', { name: '템플릿으로 빈 경기 만들기' });
      expect(within(retained).getByLabelText('요일')).toHaveValue('1');
      expect(within(retained).getByLabelText('시작 시각')).toHaveValue('20:30');
      for (const date of ['2100-01-04', '2100-01-11', '2100-01-18']) {
        expect(within(retained).getByRole('button', { name: `${date} 빼기` })).toBeVisible();
      }
    }
    fireEvent.click(within(dialog).getByRole('button', { name: '빈 경기 만들기' }));
    // Then
    await waitFor(() => expect(mobileEditorFixture.templateWrites).toEqual([{
      teamCount: 3, legs: 1,
      schedule: { dates: ['2100-01-04', '2100-01-11', '2100-01-18'], time: '20:30' },
    }]));
    expect(await screen.findByRole('dialog', { name: '모바일 생성 1주차' })).toBeVisible();
    expect(mobileEditorFixture.league.fixtures).toHaveLength(3);
    expect(screen.queryByRole('dialog', { name: '템플릿으로 빈 경기 만들기' })).not.toBeInTheDocument();
  });
});
