import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { MultiFinalTiePick, MultiFinalView } from '@/hooks/use-multi-finals';
import { MultiFinalsWizard } from './multi-finals-wizard';

const path = '*/api/v1/admin/tournaments/t-1/bracket/multi-finals';
const bracketPath = '*/api/v1/admin/tournaments/t-1/bracket';
const success = (data: unknown) => HttpResponse.json({ status: 'success', data });
const registrations = ['가팀', '나팀', '다팀', '라팀'].map((name, i) => ({ id: `reg-${i}`, team: { id: `team-${i}`, name } }));
function savedView(): MultiFinalView {
  return { revision: 1, generated: true, groups: [{ id: 'g-1', name: 'A조', capacity: 4, legs: 1 }], registrations,
    groupStandings: [{ groupId: 'g-1', name: 'A조', complete: true, rows: registrations.map((reg, i) => ({ registrationId: reg.id, teamName: reg.team.name, position: i + 1, points: 9 - i * 3, wins: 3 - i, draws: 0, losses: i, goalsFor: 3 - i, goalsAgainst: i, tiedRegistrationIds: [] })) }],
    finals: ['프리미어', '챌린지'].map((name, i) => ({ id: `final-${i}`, colorIndex: i, name, thirdPlace: false, rules: [i * 2 + 1, i * 2 + 2].map(rank => ({ groupId: 'g-1', rank })), registrationIds: null,
      manual: false, standingsChanged: false, suggestedRegistrationIds: [`reg-${i * 2}`, `reg-${i * 2 + 1}`], unresolved: [], tiePicks: [], crossGroupTopThreeAvailable: false })) };
}
function bracketData() {
  return { groups: ['프리미어', '챌린지'].map((bracketTrack, i) => ({ id: `final-${i}`, name: `${bracketTrack} 결승`, phase: 'final', bracketTrack })),
    slots: [0, 1].flatMap(i => [1, 2].map(position => ({ id: `slot-${i}-${position}`, groupId: `final-${i}`, kind: 'GROUP_RANK', position, byeSortOrder: null }))),
    fixtures: [0, 1].map(i => ({ id: `fixture-${i}`, groupId: `final-${i}`, fixtureNumber: i + 1, status: 'scheduled', homeSlotId: `slot-${i}-1`, awaySlotId: `slot-${i}-2`,
      game: { state: 'SCHEDULED', hasLiveRecords: false, hasOfficialResult: false } })), standings: [] };
}
const server = setupServer(http.post('*/api/v1/logs/client-error', () => success({})));
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => { cleanup(); server.resetHandlers(); });
afterAll(() => server.close());
function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const onApplied = vi.fn(); const onClose = vi.fn();
  render(<QueryClientProvider client={client}><MultiFinalsWizard tournamentId="t-1" mode="assign" open onApplied={onApplied} onClose={onClose} /></QueryClientProvider>);
  return { onApplied, onClose };
}
function handlers(view: MultiFinalView, bracket = bracketData()) {
  server.use(http.get(path, () => success(view)), http.get(bracketPath, () => success(bracket)),
    http.post(`${path}/assignment-preview`, async ({ request }) => {
      const input = await request.json() as { finalName: string; assignmentPolicy: string };
      return success({ revision: view.revision, finalName: input.finalName, assignmentPolicy: input.assignmentPolicy,
        registrationIds: view.finals.find(final => final.name === input.finalName)!.suggestedRegistrationIds, sourceVersion: 'official-source' });
    }));
}

const STANDINGS_CHANGED = '마지막 배정 이후 조별 순위나 결과가 바뀌었어요. 현재 결선 배정과 최신 순위를 비교해 다시 확인해 주세요.';
const SEMI_REMATCH = '4강에서는 같은 조 팀이 다시 만날 수 있어요';
// 6-team tournament: seeds 1-2 get byes into the 4강, seeds 4-5 and 3-6 play the 6강 (the shape planNamedFinals saves).
function sixTeamTournament(groupOf: string[]) {
  const teams = ['가팀', '나팀', '다팀', '라팀', '마팀', '바팀'].map((name, i) => ({ id: `t${i + 1}`, team: { id: `team-${i + 1}`, name } }));
  const seeds = ['t1', 't4', 't2', 't5', 't3', 't6'];
  const groups = [...new Set(groupOf)].map((id, index) => ({ id: `g-${id}`, name: `${index + 1}조`, capacity: 3, legs: 1 as const }));
  const view: MultiFinalView = { revision: 1, generated: true, groups, registrations: teams,
    groupStandings: groups.map(group => ({ groupId: group.id, name: group.name, complete: true,
      rows: teams.flatMap((reg, i) => groupOf[i] === group.id.slice(2) ? [reg] : []).map((reg, rank) => ({ registrationId: reg.id, teamName: reg.team.name, position: rank + 1, points: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, tiedRegistrationIds: [] })) })),
    finals: [{ id: 'final-0', colorIndex: 0, name: '챌린지', thirdPlace: false, registrationIds: null, manual: false, standingsChanged: false, unresolved: [], tiePicks: [], crossGroupTopThreeAvailable: false,
      rules: groups.flatMap(group => [1, 2, 3].map(rank => ({ groupId: group.id, rank }))).slice(0, 6), suggestedRegistrationIds: seeds }] };
  const phases = [['quarter', '6강'], ['semi', '4강'], ['final', '결승']];
  const slot = (position: number) => ({ id: `slot-${position}`, groupId: 'quarter', kind: 'GROUP_RANK', position, byeSortOrder: position <= 2 ? position - 1 : null });
  const fixture = (n: number, phase: string, home: number | null, away: number | null, bracketSources: unknown[] = []) => ({ id: `fixture-${n}`, groupId: phase, fixtureNumber: n, status: 'scheduled',
    homeSlotId: home === null ? null : `slot-${home}`, awaySlotId: away === null ? null : `slot-${away}`, bracketSources, game: { state: 'SCHEDULED', hasLiveRecords: false, hasOfficialResult: false } });
  const bracket = { groups: phases.map(([phase, label]) => ({ id: phase, name: `챌린지 · ${label}`, phase, bracketTrack: '챌린지' })), slots: [1, 2, 3, 4, 5, 6].map(slot),
    fixtures: [fixture(1, 'quarter', 4, 5), fixture(2, 'quarter', 3, 6), fixture(3, 'semi', 1, null, [{ fixtureId: 'fixture-1', outcome: 'WINNER', side: 'AWAY' }]),
      fixture(4, 'semi', 2, null, [{ fixtureId: 'fixture-2', outcome: 'WINNER', side: 'AWAY' }]),
      fixture(5, 'final', null, null, [{ fixtureId: 'fixture-3', outcome: 'WINNER', side: 'HOME' }, { fixtureId: 'fixture-4', outcome: 'WINNER', side: 'AWAY' }])], standings: [] };
  return { view, bracket: bracket as unknown as ReturnType<typeof bracketData> };
}
async function openReview(finalName: string) {
  const button = await screen.findByRole('button', { name: '선택한 토너먼트 대진 확인' });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  await screen.findByText(`${finalName} 대진 확인`);
}

describe('토너먼트별 독립 진출팀 배정', () => {
  it('확정 전에는 저장하지 않고 선택한 결선만 확정한 뒤 다른 결선을 계속 선택한다', async () => {
    let view = savedView(); const requests: unknown[] = [];
    handlers(view);
    server.use(http.get(path, () => success(view)), http.put(`${path}/assignment`, async ({ request }) => {
      const input = await request.json() as { finalName: string; registrationIds: string[] }; requests.push(input);
      view = { ...view, revision: 2, finals: view.finals.map(final => final.name === input.finalName ? { ...final, registrationIds: input.registrationIds, manual: true } : final) };
      return success(view);
    }));
    const props = show();
    await screen.findByRole('table', { name: 'A조 · 확정 순위표' });
    fireEvent.click(screen.getByRole('button', { name: '선택한 토너먼트 대진 확인' }));
    await screen.findByText('프리미어 대진 확인');
    expect(requests).toEqual([]);
    expect(screen.getByText('1경기 · 가팀 vs 나팀')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '프리미어 진출팀 확정' }));
    await waitFor(() => expect(props.onApplied).toHaveBeenCalledOnce());
    expect(props.onClose).not.toHaveBeenCalled();
    expect(requests).toEqual([{ expectedRevision: 1, finalName: '프리미어', registrationIds: ['reg-0', 'reg-1'], assignmentPolicy: 'rank_order', sourceVersion: 'official-source' }]);
    expect(view.finals[1].registrationIds).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: '배정할 토너먼트' }), { target: { value: '챌린지' } });
    expect(await screen.findByRole('checkbox', { name: '다팀' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '가팀 · 다른 토너먼트에 배정됨' })).toBeDisabled();
  });
  it('예선 미완료는 추천·편집·확정을 막는다', async () => {
    const view = savedView(); view.groupStandings![0].complete = false; handlers(view); show();
    await screen.findByText('예선 경기가 모두 끝나고 공식 순위가 반영된 뒤 배정할 수 있어요.');
    expect(screen.getByRole('button', { name: '공식 순위로 추천 배치 만들기' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: '가팀' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '선택한 토너먼트 대진 확인' })).toBeDisabled();
  });
  it('다른 결선이 시작됐어도 선택한 결선의 배정은 허용한다', async () => {
    const bracket = bracketData(); bracket.fixtures[1].game.state = 'LIVE'; handlers(savedView(), bracket); show();
    await waitFor(() => expect(screen.getByRole('button', { name: '선택한 토너먼트 대진 확인' })).toBeEnabled());
    fireEvent.change(screen.getByRole('combobox', { name: '배정할 토너먼트' }), { target: { value: '챌린지' } });
    await screen.findByText('이 토너먼트는 시작했거나 기록·결과가 있어 진출팀을 다시 배정할 수 없어요.');
    expect(screen.getByRole('button', { name: '선택한 토너먼트 대진 확인' })).toBeDisabled();
  });
  it('선택 방식의 추천 결과를 미리보고 재추첨 없이 같은 배열을 확정한다', async () => {
    const view = savedView(); view.finals[0].crossGroupTopThreeAvailable = true; handlers(view);
    let previews = 0; let input: unknown;
    server.use(http.post(`${path}/assignment-preview`, async ({ request }) => {
      previews++; const body = await request.json();
      expect(body).toEqual({ expectedRevision: 1, finalName: '프리미어', assignmentPolicy: 'cross_group_top3' });
      return success({ revision: 1, finalName: '프리미어', assignmentPolicy: 'cross_group_top3', registrationIds: ['reg-1', 'reg-0'], sourceVersion: 'draw-source' });
    }), http.put(`${path}/assignment`, async ({ request }) => { input = await request.json(); return success(view); }));
    show();
    fireEvent.change(await screen.findByRole('combobox', { name: '진출팀 배치 방식' }), { target: { value: 'cross_group_top3' } });
    fireEvent.click(screen.getByRole('button', { name: '무작위 추천 배치 만들기' }));
    await screen.findByText('1번 시드 · 나팀');
    fireEvent.click(screen.getByRole('button', { name: '선택한 토너먼트 대진 확인' }));
    await screen.findByText('1경기 · 나팀 vs 가팀');
    fireEvent.click(screen.getByRole('button', { name: '프리미어 진출팀 확정' }));
    await waitFor(() => expect(input).toEqual(expect.objectContaining({ assignmentPolicy: 'cross_group_top3', registrationIds: ['reg-1', 'reg-0'], sourceVersion: 'draw-source' })));
    expect(previews).toBe(1);
  });
  it('마지막 배정 이후 순위 순서가 바뀐 토너먼트에만 다시 확인 안내를 띄운다', async () => {
    const view = savedView(); view.finals[0].standingsChanged = true; handlers(view); show();
    await screen.findByText(STANDINGS_CHANGED);
    fireEvent.change(screen.getByRole('combobox', { name: '배정할 토너먼트' }), { target: { value: '챌린지' } });
    await screen.findByRole('checkbox', { name: '다팀' });
    expect(screen.queryByText(STANDINGS_CHANGED)).not.toBeInTheDocument();
  });
  it('순위가 그대로면 다시 확인 안내를 띄우지 않는다', async () => {
    handlers(savedView()); show();
    await screen.findByRole('table', { name: 'A조 · 확정 순위표' });
    expect(screen.queryByText(STANDINGS_CHANGED)).not.toBeInTheDocument();
  });
  it('교차 배치 확인 단계에서만 4강 재대결 가능을 알린다', async () => {
    const view = savedView(); view.finals[0].crossGroupTopThreeAvailable = true; handlers(view);
    server.use(http.post(`${path}/assignment-preview`, async () => success({ revision: 1, finalName: '프리미어', assignmentPolicy: 'cross_group_top3', registrationIds: ['reg-1', 'reg-0'], sourceVersion: 'draw-source' })));
    show();
    fireEvent.change(await screen.findByRole('combobox', { name: '진출팀 배치 방식' }), { target: { value: 'cross_group_top3' } });
    fireEvent.click(screen.getByRole('button', { name: '무작위 추천 배치 만들기' }));
    await screen.findByText('1번 시드 · 나팀');
    expect(screen.queryByText(SEMI_REMATCH)).not.toBeInTheDocument();
    await openReview('프리미어');
    expect(screen.getByText(SEMI_REMATCH)).toBeInTheDocument();
  });
  it('기본 순위 순서 확인 단계에는 4강 재대결 안내를 띄우지 않는다', async () => {
    handlers(savedView()); show();
    await openReview('프리미어');
    expect(screen.queryByText(SEMI_REMATCH)).not.toBeInTheDocument();
  });
  it('기본 순위 순서 확인 단계에서 같은 조 팀이 만날 수 있는 경기 줄마다 경고를 붙인다', async () => {
    const { view, bracket } = sixTeamTournament(['1', '1', '1', '2', '2', '2']); handlers(view, bracket); show();
    await openReview('챌린지');
    const row = (label: string) => screen.getByText(label).parentElement!;
    expect(within(row('3경기 · 가팀 vs 1경기 승자')).getByText('같은 조 재대결 가능: 가팀 vs 다팀')).toBeInTheDocument();
    expect(within(row('4경기 · 라팀 vs 2경기 승자')).getByText('같은 조 재대결 가능: 라팀 vs 바팀')).toBeInTheDocument();
    expect(within(row('1경기 · 마팀 vs 다팀')).queryByText(/같은 조 재대결 가능/)).not.toBeInTheDocument();
    // 결승 can also pair two same-group teams (마팀 vs 라팀) but is not flagged: only earlier rounds are.
    expect(screen.getAllByText(/같은 조 재대결 가능/)).toHaveLength(2);
  });
  it('모든 팀이 서로 다른 조라면 경고를 붙이지 않는다', async () => {
    const { view, bracket } = sixTeamTournament(['1', '2', '3', '4', '5', '6']); handlers(view, bracket); show();
    await openReview('챌린지');
    expect(screen.queryByText(/같은 조 재대결 가능/)).not.toBeInTheDocument();
  });
  it('자리 수가 부족하면 저장하지 않고 원인을 표시한다', async () => {
    handlers(savedView()); show();
    fireEvent.click(await screen.findByRole('checkbox', { name: '가팀' }));
    fireEvent.click(screen.getByRole('button', { name: '선택한 토너먼트 대진 확인' }));
    await screen.findByText('진출팀을 중복 없이 2팀 선택해 주세요.');
    expect(screen.queryByText('프리미어 대진 확인')).not.toBeInTheDocument();
  });
  it('CAS 실패는 미리보기를 유지하고 성공으로 표시하지 않는다', async () => {
    handlers(savedView()); server.use(http.put(`${path}/assignment`, () => HttpResponse.json({ message: '설정이나 경기 상태가 바뀌었어요. 다시 불러와 주세요.' }, { status: 409 })));
    const props = show(); await screen.findByRole('checkbox', { name: '가팀' });
    fireEvent.click(screen.getByRole('button', { name: '선택한 토너먼트 대진 확인' }));
    await screen.findByText('프리미어 대진 확인'); fireEvent.click(screen.getByRole('button', { name: '프리미어 진출팀 확정' }));
    await screen.findByText('설정이나 경기 상태가 바뀌었어요. 다시 불러와 주세요.');
    expect(props.onApplied).not.toHaveBeenCalled(); expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.getByText('프리미어 대진 확인')).toBeInTheDocument();
  });
});

// Group A's 3rd and 4th place (다팀, 라팀) were separated only by the draw. 프리미어 takes ranks 1-3, 챌린지 takes rank 4.
function tieFixture() {
  const teams = ['가팀', '나팀', '다팀', '라팀'].map((name, i) => ({ id: `reg-${i}`, team: { id: `team-${i}`, name } }));
  const tiedIds = ['reg-2', 'reg-3'];
  const final = (id: number, name: string, ranks: number[], suggested: string[], unresolvedRank: number) => ({ id: `final-${id}`, colorIndex: id, name, thirdPlace: false,
    rules: ranks.map(rank => ({ groupId: 'g-1', rank })), registrationIds: null as string[] | null, manual: false, standingsChanged: false, tiePicks: [] as MultiFinalTiePick[], suggestedRegistrationIds: suggested,
    unresolved: [{ groupId: 'g-1', rank: unresolvedRank, state: 'tied', tiedRegistrationIds: tiedIds }], crossGroupTopThreeAvailable: id === 0 });
  const view: MultiFinalView = { revision: 1, generated: true, groups: [{ id: 'g-1', name: 'A조', capacity: 4, legs: 1 }], registrations: teams,
    groupStandings: [{ groupId: 'g-1', name: 'A조', complete: true, rows: teams.map((reg, i) => ({ registrationId: reg.id, teamName: reg.team.name, position: i + 1,
      points: i < 2 ? 9 - i * 3 : 1, wins: i < 2 ? 2 - i : 0, draws: i < 2 ? 0 : 1, losses: i < 2 ? i : 1, goalsFor: i < 2 ? 3 - i : 1, goalsAgainst: i < 2 ? i : 2,
      tiedRegistrationIds: tiedIds.includes(reg.id) ? tiedIds : [] })) }],
    finals: [final(0, '프리미어', [1, 2, 3], ['reg-0', 'reg-1'], 3), final(1, '챌린지', [4], [], 4)] };
  const bracket = { groups: ['프리미어', '챌린지'].map((bracketTrack, i) => ({ id: `final-${i}`, name: `${bracketTrack} 결승`, phase: 'final', bracketTrack })),
    slots: [[1, 2, 3], [1]].flatMap((positions, i) => positions.map(position => ({ id: `slot-${i}-${position}`, groupId: `final-${i}`, kind: 'GROUP_RANK', position, byeSortOrder: null }))),
    fixtures: [0, 1].map(i => ({ id: `fixture-${i}`, groupId: `final-${i}`, fixtureNumber: i + 1, status: 'scheduled', homeSlotId: `slot-${i}-1`, awaySlotId: i ? null : `slot-${i}-2`,
      game: { state: 'SCHEDULED', hasLiveRecords: false, hasOfficialResult: false } })), standings: [] };
  return { view, bracket: bracket as unknown as ReturnType<typeof bracketData> };
}
const TIE_BANNER = 'A조 3위·4위가 완전 동률이에요. 3위는 프리미어, 4위는 챌린지로 갈라지는 자리라 직접 골라야 해요.';
const SEAT_LABEL = '프리미어 3위 자리에 보낼 팀';
const CROSS = 'cross_group_top3';
const PICK = { groupId: 'g-1', rank: 3, registrationId: 'reg-3' };
/** Records every assignment-preview body and answers with a fixed roster. */
function previews(registrationIds: Array<string | null>, assignmentPolicy: string, sourceVersion: string) {
  const bodies: unknown[] = [];
  server.use(http.post(`${path}/assignment-preview`, async ({ request }) => {
    bodies.push(await request.json());
    return success({ revision: 1, finalName: '프리미어', assignmentPolicy, registrationIds, sourceVersion });
  }));
  return bodies;
}
const seedOrder = () => screen.getAllByRole('listitem').map(item => item.querySelector('span')?.textContent);
async function enabledPolicySelect() {
  const policy = await screen.findByRole('combobox', { name: '진출팀 배치 방식' });
  await waitFor(() => expect(policy).toBeEnabled());
  return policy;
}

describe('예선 순위가 추첨으로만 갈린 동률', () => {
  it('동률 팀에 배지를 붙이고, 걸친 자리는 비워 둔 채 창 안에서 고르게 하며 고르기 전엔 대진 확인을 막는다', async () => {
    const { view, bracket } = tieFixture(); handlers(view, bracket); show();
    expect(await screen.findByText(TIE_BANNER)).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'A조 · 확정 순위표' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map(row => within(row).queryByText('동률') !== null)).toEqual([false, false, true, true]);
    expect(screen.getByText('승점 1 · 골득실 -1 · 득점 1 · 맞대결·페어플레이까지 같아서 추첨으로만 갈렸어요.')).toBeInTheDocument();
    const select = screen.getByRole('combobox', { name: SEAT_LABEL });
    expect(select).toHaveValue('');
    expect(within(select).getAllByRole('option').map(option => option.textContent)).toEqual(['팀 선택', '다팀', '라팀']);
    expect(screen.getByText('고르지 않은 팀은 챌린지 4위 자리로 가요.')).toBeInTheDocument();
    expect(screen.getByText('고르면 3번 시드에 들어가요.')).toBeInTheDocument();
    expect(screen.getByText('3번 시드 · 팀 선택 필요')).toBeInTheDocument();
    expect(screen.getByText('프리미어 진출팀 · 2/3팀')).toBeInTheDocument();
    expect(screen.getByText('동률인 3번 시드는 비워 두고 나머지 2자리만 채워요. 위에서 팀을 고르면 그 자리가 채워져요.')).toBeInTheDocument();
    expect(screen.getByText('동률 자리를 골라야 대진을 확인할 수 있어요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '선택한 토너먼트 대진 확인' })).toBeDisabled();
  });

  it('고른 팀이 비워진 시드를 채우고, 확인·확정까지 그 선택 그대로 저장된다', async () => {
    const { view, bracket } = tieFixture(); handlers(view, bracket);
    const bodies = previews(['reg-0', 'reg-1'], 'rank_order', 'official-source');
    let saved: unknown; server.use(http.put(`${path}/assignment`, async ({ request }) => { saved = await request.json(); return success(view); }));
    const props = show();
    fireEvent.change(await screen.findByRole('combobox', { name: SEAT_LABEL }), { target: { value: 'reg-3' } });
    expect(screen.getByText('3번 시드 · 라팀')).toBeInTheDocument();
    expect(screen.getByText('지금 3번 시드예요.')).toBeInTheDocument();
    expect(screen.getByText('프리미어 진출팀 · 3/3팀')).toBeInTheDocument();
    expect(screen.queryByText('동률 자리를 골라야 대진을 확인할 수 있어요.')).not.toBeInTheDocument();
    expect(screen.queryByText(TIE_BANNER)).not.toBeInTheDocument();
    expect(screen.queryByText(/비워 두고 나머지/)).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: SEAT_LABEL })).toHaveValue('reg-3');
    await openReview('프리미어');
    fireEvent.click(screen.getByRole('button', { name: '프리미어 진출팀 확정' }));
    await waitFor(() => expect(props.onApplied).toHaveBeenCalledOnce());
    expect(bodies).toEqual([{ expectedRevision: 1, finalName: '프리미어', assignmentPolicy: 'rank_order', tiePicks: [PICK] }]);
    expect(saved).toEqual({ expectedRevision: 1, finalName: '프리미어', registrationIds: ['reg-0', 'reg-1', 'reg-3'], assignmentPolicy: 'rank_order', sourceVersion: 'official-source', tiePicks: [PICK] });
  });

  it('추천 배치를 만들어도 막히지 않고 동률 자리는 비워 둔다', async () => {
    const { view, bracket } = tieFixture(); handlers(view, bracket);
    server.use(http.post(`${path}/assignment-preview`, async () => success({ revision: 1, finalName: '프리미어', assignmentPolicy: 'rank_order', registrationIds: ['reg-0', 'reg-1', null], sourceVersion: 'tie-source' })));
    show();
    fireEvent.click(await screen.findByRole('button', { name: '공식 순위로 추천 배치 만들기' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '공식 순위로 추천 배치 만들기' })).toBeEnabled());
    expect(screen.getByText('3번 시드 · 팀 선택 필요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '선택한 토너먼트 대진 확인' })).toBeDisabled();
  });

  it('다른 토너먼트에 이미 배정한 팀은 후보에서 빠지고 남은 팀만 고를 수 있다', async () => {
    const { view, bracket } = tieFixture(); view.finals[0].registrationIds = ['reg-0', 'reg-1', 'reg-2'];
    handlers(view, bracket); show();
    fireEvent.change(await screen.findByRole('combobox', { name: '배정할 토너먼트' }), { target: { value: '챌린지' } });
    const select = await screen.findByRole('combobox', { name: '챌린지 4위 자리에 보낼 팀' });
    expect(within(select).getAllByRole('option').map(option => option.textContent)).toEqual(['팀 선택', '라팀']);
    expect(screen.getByText('고르지 않은 팀은 프리미어 3위 자리로 가요.')).toBeInTheDocument();
  });

  it('동률 자리와 그 옆 시드는 위아래로 옮길 수 없다', async () => {
    const { view, bracket } = tieFixture(); handlers(view, bracket); show();
    await screen.findByText('3번 시드 · 팀 선택 필요');
    expect(screen.getByRole('button', { name: '나팀 시드 내리기' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '나팀 시드 올리기' })).toBeEnabled();
  });

  it('공식 순위 추천을 다시 만들어도 고른 팀이 동률 자리로 돌아온다', async () => {
    const { view, bracket } = tieFixture(); handlers(view, bracket);
    const bodies = previews(['reg-0', 'reg-1', null], 'rank_order', 'tie-source');
    show();
    fireEvent.change(await screen.findByRole('combobox', { name: SEAT_LABEL }), { target: { value: 'reg-3' } });
    fireEvent.click(screen.getByRole('button', { name: '공식 순위로 추천 배치 만들기' }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole('button', { name: '공식 순위로 추천 배치 만들기' })).toBeEnabled());
    expect(bodies).toEqual([{ expectedRevision: 1, finalName: '프리미어', assignmentPolicy: 'rank_order', tiePicks: [PICK] }]);
    expect(screen.getByText('3번 시드 · 라팀')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: SEAT_LABEL })).toHaveValue('reg-3');
  });

  it('고른 팀을 시드 순서에서 옮긴 뒤 다시 고르면 옮긴 자리의 팀이 바뀐다', async () => {
    const { view, bracket } = tieFixture(); handlers(view, bracket); show();
    fireEvent.change(await screen.findByRole('combobox', { name: SEAT_LABEL }), { target: { value: 'reg-3' } });
    const moveUp = screen.getByRole('button', { name: '라팀 시드 올리기' });
    await waitFor(() => expect(moveUp).toBeEnabled());
    fireEvent.click(moveUp);
    expect(seedOrder()).toEqual(['1번 시드 · 가팀', '2번 시드 · 라팀', '3번 시드 · 나팀']);
    expect(screen.getByRole('combobox', { name: SEAT_LABEL })).toHaveValue('reg-3');
    expect(screen.getByText('지금 2번 시드예요.')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: SEAT_LABEL }), { target: { value: 'reg-2' } });
    expect(seedOrder()).toEqual(['1번 시드 · 가팀', '2번 시드 · 다팀', '3번 시드 · 나팀']);
    expect(screen.getByText('지금 2번 시드예요.')).toBeInTheDocument();
    expect(screen.getByText('프리미어 진출팀 · 3/3팀')).toBeInTheDocument();
  });

  it('고른 팀의 선택을 비우면 그 팀이 앉은 자리가 비고 동률 자리를 다시 고르게 한다', async () => {
    const { view, bracket } = tieFixture(); handlers(view, bracket); show();
    const select = await screen.findByRole('combobox', { name: SEAT_LABEL });
    fireEvent.change(select, { target: { value: 'reg-3' } });
    fireEvent.change(select, { target: { value: '' } });
    expect(screen.getByText('3번 시드 · 팀 선택 필요')).toBeInTheDocument();
    expect(screen.getByText('동률 자리를 골라야 대진을 확인할 수 있어요.')).toBeInTheDocument();
    expect(screen.getByText('고르면 3번 시드에 들어가요.')).toBeInTheDocument();
  });

  it('동률 후보를 체크하면 동률 자리의 선택으로 기록되고, 체크를 풀면 선택도 사라진다', async () => {
    const { view, bracket } = tieFixture(); handlers(view, bracket); show();
    const box = await screen.findByRole('checkbox', { name: '라팀' });
    await waitFor(() => expect(box).toBeEnabled());
    fireEvent.click(box);
    expect(screen.getByRole('combobox', { name: SEAT_LABEL })).toHaveValue('reg-3');
    expect(screen.getByText('3번 시드 · 라팀')).toBeInTheDocument();
    expect(screen.queryByText('동률 자리를 골라야 대진을 확인할 수 있어요.')).not.toBeInTheDocument();
    fireEvent.click(box);
    expect(screen.getByRole('combobox', { name: SEAT_LABEL })).toHaveValue('');
    expect(screen.getByText('동률 자리를 골라야 대진을 확인할 수 있어요.')).toBeInTheDocument();
  });

  it('동률 선택이 저장되지 않은 옛 기본 순위 명단은 규칙 순서 자리의 동률 후보를 선택으로 읽는다', async () => {
    const { view, bracket } = tieFixture(); view.finals[0].registrationIds = ['reg-0', 'reg-1', 'reg-3']; handlers(view, bracket); show();
    expect(await screen.findByRole('combobox', { name: SEAT_LABEL })).toHaveValue('reg-3');
    expect(screen.getByText('지금 3번 시드예요.')).toBeInTheDocument();
    expect(screen.queryByText('동률 자리를 골라야 대진을 확인할 수 있어요.')).not.toBeInTheDocument();
  });

  it('동률이 낀 토너먼트에서도 교차 배치를 고를 수 있고, 팀을 고른 뒤에야 추천을 만든다', async () => {
    const { view, bracket } = tieFixture(); handlers(view, bracket);
    const bodies = previews(['reg-0', 'reg-3', 'reg-1'], CROSS, 'cross-source');
    show();
    const policy = await enabledPolicySelect();
    expect(within(policy).getAllByRole('option').map(option => option.textContent)).toEqual(['기본 순위 순서 · 수동 조정 가능', '1위 부전승 · 2위 교차 고정 · 3위 같은 조 회피']);
    fireEvent.change(policy, { target: { value: CROSS } });
    expect(screen.queryByText('동률인 순위가 있어 교차 배치는 쓸 수 없어요.')).not.toBeInTheDocument();
    expect(screen.getByText('동률 자리에 올릴 팀을 먼저 고르면 고른 순위로 교차 배치해요.')).toBeInTheDocument();
    const recommend = screen.getByRole('button', { name: '무작위 추천 배치 만들기' });
    expect(recommend).toBeDisabled();
    fireEvent.change(screen.getByRole('combobox', { name: SEAT_LABEL }), { target: { value: 'reg-3' } });
    expect(recommend).toBeEnabled();
    expect(screen.getByText('교차 배치 추천을 만들면 시드가 정해져요.')).toBeInTheDocument();
    fireEvent.click(recommend);
    // Rule order would say 3번 시드; the cross draw really put 라팀 at 2번.
    expect(await screen.findByText('지금 2번 시드예요.')).toBeInTheDocument();
    expect(screen.getByText('2번 시드 · 라팀')).toBeInTheDocument();
    expect(bodies).toEqual([{ expectedRevision: 1, finalName: '프리미어', assignmentPolicy: CROSS, tiePicks: [PICK] }]);
  });

  it('교차 배치에서 고른 팀을 바꾸면 추천을 다시 만들기 전에는 대진 확인으로 넘어갈 수 없다', async () => {
    const { view, bracket } = tieFixture(); handlers(view, bracket);
    previews(['reg-0', 'reg-3', 'reg-1'], CROSS, 'cross-source');
    show();
    fireEvent.change(await enabledPolicySelect(), { target: { value: CROSS } });
    const select = screen.getByRole('combobox', { name: SEAT_LABEL });
    fireEvent.change(select, { target: { value: 'reg-3' } });
    fireEvent.click(screen.getByRole('button', { name: '무작위 추천 배치 만들기' }));
    await screen.findByText('지금 2번 시드예요.');
    // The recommended seeds stay on screen, so the old team's seed must not be read as the new pick's.
    expect(within(select).getAllByRole('option').map(option => option.textContent)).toEqual(['팀 선택', '다팀', '라팀']);
    fireEvent.change(select, { target: { value: 'reg-2' } });
    expect(screen.getByText('교차 배치 추천을 만들면 시드가 정해져요.')).toBeInTheDocument();
    expect(screen.queryByText('지금 2번 시드예요.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '선택한 토너먼트 대진 확인' }));
    await screen.findByText('선택한 방식으로 추천 배치를 먼저 만들어 주세요.');
    expect(screen.queryByText('프리미어 대진 확인')).not.toBeInTheDocument();
  });

  it('저장된 교차 명단은 고른 팀과 그 팀의 실제 시드를 보여 주고, 확정할 때 선택을 함께 보낸다', async () => {
    const { view, bracket } = tieFixture();
    Object.assign(view.finals[0], { registrationIds: ['reg-0', 'reg-3', 'reg-1'], assignmentPolicy: CROSS, tiePicks: [PICK] });
    handlers(view, bracket);
    const bodies = previews(['reg-1', 'reg-3', 'reg-0'], CROSS, 'redrawn-source');
    let saved: unknown; server.use(http.put(`${path}/assignment`, async ({ request }) => { saved = await request.json(); return success(view); }));
    const props = show();
    const select = await screen.findByRole('combobox', { name: SEAT_LABEL });
    expect(select).toHaveValue('reg-3');
    expect(within(select).getByRole('option', { name: '라팀' })).toBeInTheDocument();
    expect(screen.getByText('지금 2번 시드예요.')).toBeInTheDocument();
    expect(screen.getByText('2번 시드 · 라팀')).toBeInTheDocument();
    expect(screen.queryByText(/자리\(\d번 시드\)에 보낼 팀/)).not.toBeInTheDocument();
    expect(screen.queryByText('동률 자리를 골라야 대진을 확인할 수 있어요.')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '진출팀 배치 방식' })).toHaveValue(CROSS);
    await openReview('프리미어');
    fireEvent.click(screen.getByRole('button', { name: '프리미어 진출팀 확정' }));
    await waitFor(() => expect(props.onApplied).toHaveBeenCalledOnce());
    expect(bodies).toEqual([{ expectedRevision: 1, finalName: '프리미어', assignmentPolicy: CROSS, tiePicks: [PICK] }]);
    expect(saved).toEqual({ expectedRevision: 1, finalName: '프리미어', registrationIds: ['reg-0', 'reg-3', 'reg-1'], assignmentPolicy: CROSS, sourceVersion: 'redrawn-source', tiePicks: [PICK] });
  });

  it('교차 명단에서 고른 팀을 뺐다가 다시 넣으면 다른 시드에 앉아도 동률 선택이 다시 기록된다', async () => {
    const { view, bracket } = tieFixture();
    Object.assign(view.finals[0], { registrationIds: ['reg-0', 'reg-3', 'reg-1'], assignmentPolicy: CROSS, tiePicks: [PICK] });
    handlers(view, bracket); show();
    const box = await screen.findByRole('checkbox', { name: '라팀' });
    await waitFor(() => expect(box).toBeEnabled());
    fireEvent.click(box);
    expect(screen.getByRole('combobox', { name: SEAT_LABEL })).toHaveValue('');
    fireEvent.click(box);
    // 라팀 goes back to 2번 (the seed it left), not its rule-order seat 3번, and the pick follows it.
    expect(screen.getByText('2번 시드 · 라팀')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: SEAT_LABEL })).toHaveValue('reg-3');
    expect(screen.getByText('지금 2번 시드예요.')).toBeInTheDocument();
    expect(screen.queryByText('동률 자리를 골라야 대진을 확인할 수 있어요.')).not.toBeInTheDocument();
    expect(seedOrder()).toHaveLength(3);
  });

  it('교차 배치에서 고른 팀이 추천 전에 시드를 손으로 옮기면 선택이 사라지지 않고 명단에 들어간다', async () => {
    const { view, bracket } = tieFixture(); handlers(view, bracket); show();
    const policy = await enabledPolicySelect();
    fireEvent.change(policy, { target: { value: CROSS } });
    fireEvent.change(screen.getByRole('combobox', { name: SEAT_LABEL }), { target: { value: 'reg-3' } });
    fireEvent.click(screen.getByRole('button', { name: '가팀 시드 내리기' }));
    expect(screen.getByRole('combobox', { name: '진출팀 배치 방식' })).toHaveValue('rank_order');
    expect(screen.getByRole('combobox', { name: SEAT_LABEL })).toHaveValue('reg-3');
    expect(seedOrder()).toEqual(['1번 시드 · 나팀', '2번 시드 · 가팀', '3번 시드 · 라팀']);
    expect(screen.queryByText('동률 자리를 골라야 대진을 확인할 수 있어요.')).not.toBeInTheDocument();
  });

  it('시작한 토너먼트에는 동률 안내와 선택창을 아예 그리지 않는다', async () => {
    const { view, bracket } = tieFixture(); bracket.fixtures[0].game.state = 'LIVE'; handlers(view, bracket); show();
    await screen.findByText('이 토너먼트는 시작했거나 기록·결과가 있어 진출팀을 다시 배정할 수 없어요.');
    expect(screen.queryByRole('combobox', { name: SEAT_LABEL })).not.toBeInTheDocument();
    expect(screen.queryByText(TIE_BANNER)).not.toBeInTheDocument();
    expect(screen.queryByText(/추첨으로만 갈렸어요/)).not.toBeInTheDocument();
    expect(screen.queryByText('동률 자리를 골라야 대진을 확인할 수 있어요.')).not.toBeInTheDocument();
    expect(screen.queryByText(/비워 두고 나머지/)).not.toBeInTheDocument();
  });

  it('동률이 없는 대회는 배지·안내·선택창이 하나도 나오지 않는다', async () => {
    handlers(savedView()); show();
    await screen.findByRole('table', { name: 'A조 · 확정 순위표' });
    expect(screen.queryByText('동률')).not.toBeInTheDocument();
    expect(screen.queryByText(/완전 동률이에요/)).not.toBeInTheDocument();
    expect(screen.queryByText(/팀 선택 필요/)).not.toBeInTheDocument();
    expect(screen.queryByText('동률 자리를 골라야 대진을 확인할 수 있어요.')).not.toBeInTheDocument();
  });
});
