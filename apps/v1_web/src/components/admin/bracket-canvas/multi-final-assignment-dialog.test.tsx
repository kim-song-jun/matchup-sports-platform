import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { MultiFinalView } from '@/hooks/use-multi-finals';
import { MultiFinalsWizard } from './multi-finals-wizard';

const path = '*/api/v1/admin/tournaments/t-1/bracket/multi-finals';
const bracketPath = '*/api/v1/admin/tournaments/t-1/bracket';
const success = (data: unknown) => HttpResponse.json({ status: 'success', data });
const registrations = ['가팀', '나팀', '다팀', '라팀'].map((name, i) => ({ id: `reg-${i}`, team: { id: `team-${i}`, name } }));
function savedView(): MultiFinalView {
  return { revision: 1, generated: true, groups: [{ id: 'g-1', name: 'A조', capacity: 4, legs: 1 }], registrations,
    groupStandings: [{ groupId: 'g-1', name: 'A조', complete: true, rows: registrations.map((reg, i) => ({ registrationId: reg.id, teamName: reg.team.name, position: i + 1, points: 9 - i * 3, wins: 3 - i, draws: 0, losses: i, goalsFor: 3 - i, goalsAgainst: i, tiedRegistrationIds: [] })) }],
    finals: ['프리미어', '챌린지'].map((name, i) => ({ name, thirdPlace: false, rules: [i * 2 + 1, i * 2 + 2].map(rank => ({ groupId: 'g-1', rank })), registrationIds: null,
      manual: false, suggestedRegistrationIds: [`reg-${i * 2}`, `reg-${i * 2 + 1}`], unresolved: [], crossGroupTopThreeAvailable: false })) };
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
