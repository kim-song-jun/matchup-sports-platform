import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { v1Get, v1Post, v1Put } from '@/lib/api-client';
import type { MultiFinalPreview, MultiFinalView } from '@/hooks/use-multi-finals';
import type { V1AdminTournamentAwardSet, V1TournamentDetail } from '@/types/api';
import { v1MswHandlers } from './handlers';
import { createNamedFinalsMsw, namedFinalsMsw } from './named-finals-handlers';
import { NAMED_FINALS_ID } from './named-finals-fixtures';
const server = setupServer(...v1MswHandlers, http.post('*/api/v1/logs/client-error', () => HttpResponse.json({ status: 'success', data: null })));
const admin = `/admin/tournaments/${NAMED_FINALS_ID}`;
const path = `${admin}/bracket/multi-finals`;
const publicPath = `/tournaments/${NAMED_FINALS_ID}`;
const editable = (view: MultiFinalView) => view.finals.map(({ manual: _m, suggestedRegistrationIds: _s, unresolved: _u, ...row }) => row);
beforeAll(() => { vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1'); server.listen({ onUnhandledRequest: 'error' }); });
beforeEach(() => namedFinalsMsw.reset());
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); vi.unstubAllEnvs(); });
describe('공용 MSW — named finals 및 시상 wire 계약', () => {
  it('저장→관리자 재조회→공개 상세가 동일하고 빈 배열 저장으로 모두 초기화한다', async () => {
    const saved = await v1Put<V1AdminTournamentAwardSet[]>(`${admin}/award-sets`, { awardSets: [{ bracketTrack: '챔피언', prizePool: 120000, prizeSummary: '샘플 우승 상금' }, { bracketTrack: '챌린지', prizePool: 0 }] });
    expect(await v1Get(`${admin}/award-sets`)).toEqual(saved);
    expect(saved[1]).toMatchObject({ bracketTrack: '챌린지', prizePool: 0, prizeSummary: null, prizeBreakdown: null });
    expect((await v1Get<V1TournamentDetail>(publicPath)).awardSets).toEqual(saved.map(({ id: _id, ...row }) => row));
    await v1Put(`${admin}/award-sets`, { awardSets: [] });
    expect(await v1Get(`${admin}/award-sets`)).toEqual([]);
    expect((await v1Get<V1TournamentDetail>(publicPath)).awardSets).toEqual([]);
  });
  it('없는 범위·중복 범위·잘못된 금액을 거절하고 직전 저장을 보존한다', async () => {
    const saved = await v1Put(`${admin}/award-sets`, { awardSets: [{ bracketTrack: '챔피언', prizePool: 1000 }] });
    for (const [awardSets, code] of [
      [[{ bracketTrack: '없는 토너먼트' }], 'AWARD_TRACK_UNSUPPORTED'],
      [[{ bracketTrack: '챔피언' }, { bracketTrack: '챔피언' }], 'DUPLICATE_AWARD_TRACK'],
      [[{ bracketTrack: '챔피언', prizePool: -1 }], 'VALIDATION_ERROR'],
    ] as const) {
      await expect(v1Put(`${admin}/award-sets`, { awardSets })).rejects.toMatchObject({ code });
      expect(await v1Get(`${admin}/award-sets`)).toEqual(saved);
    }
  });
  it('시상 범위를 먼저 비워야 토너먼트 이름을 바꿀 수 있다', async () => {
    const view = await v1Get<MultiFinalView>(path); const finals = editable(view); finals[0].name = '새 결선';
    await v1Put(`${admin}/award-sets`, { awardSets: [{ bracketTrack: '챔피언' }] });
    await expect(v1Put(`${path}/selection`, { expectedRevision: view.revision, finals })).rejects.toMatchObject({ code: 'BRACKET_TRACK_AWARDS_REQUIRE_RESCOPING' });
    expect((await v1Get<MultiFinalView>(path)).revision).toBe(view.revision);
    await v1Put(`${admin}/award-sets`, { awardSets: [] });
    await v1Put(`${path}/selection`, { expectedRevision: view.revision, finals });
    expect((await v1Get<MultiFinalView>(path)).finals[0].name).toBe('새 결선');
  });
  it('수동 명단→실제 matchup preview→생성→공개 조회를 연결하고 재요청을 재생한다', async () => {
    const before = await v1Get<V1TournamentDetail>(publicPath);
    const view = await v1Get<MultiFinalView>(path); const finals = editable(view);
    finals[0].registrationIds = [view.registrations[0].id, view.registrations[3].id];
    finals[1].registrationIds = [view.registrations[1].id, view.registrations[2].id];
    const selected = await v1Put<MultiFinalView>(`${path}/selection`, { expectedRevision: view.revision, finals });
    expect((await v1Get<MultiFinalView>(path)).finals[0].registrationIds).toEqual(finals[0].registrationIds);
    const preview = await v1Post<MultiFinalPreview>(`${path}/preview`, {});
    expect(preview.counts).toEqual({ tournaments: 2, fixtures: 2, byes: 0 });
    const input = { expectedRevision: selected.revision, previewHash: preview.previewHash, requestId: '9d710000-0000-4000-8000-000000009999' };
    expect(await v1Post(`${path}/generate`, input)).toMatchObject({ replayed: false });
    expect(await v1Post(`${path}/generate`, input)).toMatchObject({ replayed: true });
    const detail = await v1Get<V1TournamentDetail>(publicPath);
    expect(detail.fixtures.filter(f => f.groupId?.startsWith('group-'))).toEqual(before.fixtures);
    const finalsOnly = detail.fixtures.filter(f => f.groupId?.startsWith('final:'));
    expect(finalsOnly).toHaveLength(2);
    expect(finalsOnly[0]).toMatchObject({ homeRegistrationId: finals[0].registrationIds[0], awayRegistrationId: finals[0].registrationIds[1] });
    expect(detail.groups.filter(group => group.phase === 'final').map(group => group.bracketTrack)).toEqual(['챔피언', '챌린지']);
    await expect(v1Put(`${path}/selection`, { expectedRevision: view.revision, finals })).rejects.toMatchObject({ code: 'MULTI_FINAL_STALE' });
  });
  it('동일 팀 중복은 거절하고 순위 미확정을 임의 진출팀으로 성공시키지 않는다', async () => {
    const view = await v1Get<MultiFinalView>(path); const finals = editable(view);
    const duplicate = structuredClone(finals); duplicate[1].registrationIds = duplicate[0].registrationIds;
    await expect(v1Put(`${path}/selection`, { expectedRevision: view.revision, finals: duplicate })).rejects.toMatchObject({ code: 'MULTI_FINAL_INVALID' });
    await v1Put(`${path}/selection`, { expectedRevision: view.revision, finals: finals.map(f => ({ ...f, registrationIds: null })) });
    await expect(v1Post(`${path}/preview`, {})).rejects.toMatchObject({ code: 'MULTI_FINAL_RANK_UNRESOLVED' });
  });
  it.each(['support', 'member', 'guest'] as const)('%s 권한은 실제 wire에서 쓰기를 거절한다', async actor => {
    server.use(...createNamedFinalsMsw(actor).handlers);
    await expect(v1Put(`${admin}/award-sets`, { awardSets: [] })).rejects.toMatchObject({ statusCode: actor === 'guest' ? 401 : 403 });
    await expect(v1Post(`${path}/preview`, {})).rejects.toMatchObject({ statusCode: actor === 'guest' ? 401 : 403 });
    if (actor === 'support') expect((await v1Get<MultiFinalView>(path)).finals).toHaveLength(2);
  });
});
