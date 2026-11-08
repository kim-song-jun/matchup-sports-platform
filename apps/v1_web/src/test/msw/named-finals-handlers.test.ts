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
const editable = (view: MultiFinalView) => view.finals.map(({ manual: _m, standingsChanged: _w, suggestedRegistrationIds: _s, unresolved: _u, tiePicks: _t, colorIndex: _c, ...row }) => row);
beforeAll(() => { vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1'); server.listen({ onUnhandledRequest: 'error' }); });
beforeEach(() => namedFinalsMsw.reset());
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); vi.unstubAllEnvs(); });
describe('공용 MSW — named finals 및 시상 wire 계약', () => {
  it('독립 초기화 뒤 별도 예선 수정에서 부분 배정과 새 진출 규칙을 저장한다', async () => {
    const before = await v1Get<MultiFinalView>(path);
    const input = { expectedRevision: before.revision, groups: [{ name: '수정 예선', capacity: 3, legs: 2, registrationIds: [before.registrations[0].id] }],
      finals: [{ name: '챔피언', thirdPlace: false, rules: [{ groupId: '0', rank: 1 }, { groupId: '0', rank: 2 }], registrationIds: null }] };
    await expect(v1Put(`${path}/preliminary`, input)).rejects.toMatchObject({ code: 'BRACKET_NOT_EMPTY' });
    const cleared = await v1Post<MultiFinalView>(`${path}/reset`, { expectedRevision: before.revision });
    expect(cleared.preliminaryFixtureCount).toBe(0);
    expect(cleared.groups).toEqual(before.groups);
    expect((await v1Get<V1TournamentDetail>(publicPath)).fixtures).toEqual([]);
    expect(cleared.finals.every(f => f.registrationIds === null)).toBe(true);
    await expect(v1Post(`${path}/reset`, { expectedRevision: before.revision })).rejects.toMatchObject({ code: 'MULTI_FINAL_STALE' });
    const saved = await v1Put<MultiFinalView>(`${path}/preliminary`, { ...input, expectedRevision: cleared.revision });
    expect(saved.groups[0]).toMatchObject({ name: '수정 예선', capacity: 3, legs: 2, registrationIds: [before.registrations[0].id] });
    expect(saved.finals[0].rules.every(rule => rule.groupId === saved.groups[0].id)).toBe(true);
    expect(await v1Get(path)).toEqual(saved);
    const publicDetail = await v1Get<V1TournamentDetail>(publicPath);
    expect(publicDetail.fixtures).toHaveLength(6);
    expect(publicDetail.groups[0].groupTeams).toHaveLength(1);
    expect(publicDetail.fixtures.some(f => f.homeRegistrationId === before.registrations[0].id || f.awayRegistrationId === before.registrations[0].id)).toBe(true);
  });
  describe('진출 규칙은 서버처럼 순위 먼저·같은 순위는 조 순서로 저장해 응답한다', () => {
    const rule = (groupId: string, rank: number) => ({ groupId, rank });
    it('예선 수정은 요청한 조 단위 순서가 아니라 편성한 조 순서로 정렬해 돌려준다', async () => {
      const before = await v1Get<MultiFinalView>(path);
      const cleared = await v1Post<MultiFinalView>(`${path}/reset`, { expectedRevision: before.revision });
      const saved = await v1Put<MultiFinalView>(`${path}/preliminary`, { expectedRevision: cleared.revision,
        groups: [{ name: 'A조', capacity: 3, legs: 1 }, { name: 'B조', capacity: 3, legs: 1 }],
        finals: [{ name: '본선', thirdPlace: false, registrationIds: null, rules: [0, 1].flatMap(g => [1, 2, 3].map(rank => rule(String(g), rank))) }] });
      const [a, b] = saved.groups.map(group => group.id);
      expect(saved.finals[0].rules).toEqual([rule(a, 1), rule(b, 1), rule(a, 2), rule(b, 2), rule(a, 3), rule(b, 3)]);
      expect((await v1Get<MultiFinalView>(path)).finals[0].rules).toEqual(saved.finals[0].rules);
    });
    it('규칙 저장은 저장된 조 순서를 기준으로 정렬하고 뒤 조부터 보내도 같은 결과다', async () => {
      const view = await v1Get<MultiFinalView>(path); const [a, b] = view.groups.map(group => group.id);
      const finals = editable(view); finals[0] = { ...finals[0], registrationIds: null, rules: [rule(b, 2), rule(b, 1), rule(a, 2), rule(a, 1)] };
      finals[1] = { ...finals[1], registrationIds: null, rules: [] };
      const saved = await v1Put<MultiFinalView>(`${path}/selection`, { expectedRevision: view.revision, finals });
      expect(saved.finals[0].rules).toEqual([rule(a, 1), rule(b, 1), rule(a, 2), rule(b, 2)]);
      expect((await v1Get<MultiFinalView>(path)).finals[0].rules).toEqual(saved.finals[0].rules);
    });
  });
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
    const preview = await v1Post<MultiFinalPreview>(`${path}/preview`, {});
    expect(preview.finals.every(final => final.registrationIds === null)).toBe(true);
    expect(preview.plan?.slots).toHaveLength(4);
    expect(preview.counts).toEqual({ tournaments: 2, fixtures: 2, byes: 0 });
  });
  it.each(['support', 'member', 'guest'] as const)('%s 권한은 실제 wire에서 쓰기를 거절한다', async actor => {
    server.use(...createNamedFinalsMsw(actor).handlers);
    await expect(v1Put(`${admin}/award-sets`, { awardSets: [] })).rejects.toMatchObject({ statusCode: actor === 'guest' ? 401 : 403 });
    await expect(v1Post(`${path}/preview`, {})).rejects.toMatchObject({ statusCode: actor === 'guest' ? 401 : 403 });
    await expect(v1Post(`${path}/reset`, { expectedRevision: 1 })).rejects.toMatchObject({ statusCode: actor === 'guest' ? 401 : 403 });
    await expect(v1Put(`${path}/preliminary`, {})).rejects.toMatchObject({ statusCode: actor === 'guest' ? 401 : 403 });
    if (actor === 'support') expect((await v1Get<MultiFinalView>(path)).finals).toHaveLength(2);
  });
});
