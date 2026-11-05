import { describe, expect, it, vi } from 'vitest';
import { ADMIN_DEMO_ID, createAdminDemoState, createAdminDemoSource, restoreAdminDemo, runAdminDemo, type AdminDemoCommand } from './tournament-admin-demo';

const base = `/admin/tournaments/${ADMIN_DEMO_ID}`;
describe('실제 어드민 화면용 체험 데이터 계약', () => {
  it('대기 처리는 참가 확정으로 바꾸지 않고, 대기 팀은 다시 확정할 수 있다', () => {
    const state = createAdminDemoState();
    const path = `/admin/registrations/${state.registrations[0].id}/confirm`;
    const waiting = runAdminDemo(state, 'PATCH', path, { decision: 'waitlist' }).state;
    expect(waiting.registrations[0].status).toBe('waitlisted');
    expect(waiting.registrations[0].confirmedAt).toBeNull();
    expect(runAdminDemo(waiting, 'PATCH', path, { decision: 'confirm' }).state.registrations[0].status).toBe('confirmed');
  });
  it('신청 확정 → 대진 편성 → 팀 배정 → 점수 확정 → 결승 반영과 통계를 위한 결과를 저장한다', () => {
    let state = createAdminDemoState();
    const commands: AdminDemoCommand[] = [];
    const send = (method: string, path: string, body?: unknown) => {
      state = runAdminDemo(state, method, path, body).state; commands.push({ method, path, body });
    };
    for (const reg of state.registrations) send('PATCH', `/admin/registrations/${reg.id}/confirm`, {});
    send('POST', `${base}/bracket/template`, { kind: 'knockout', size: 4, thirdPlace: false });
    send('POST', `${base}/slots/random-fill`);
    send('POST', '/admin/games/sample-game-1/quick-result', { expectedVersion: 1, score: { home: 2, away: 1 } });
    send('POST', '/admin/games/sample-game-2/quick-result', { expectedVersion: 1, score: { home: 0, away: 1 } });
    expect(state.bracket.fixtures[2].homeTeamName).toBe('블루 FC');
    expect(state.bracket.fixtures[2].awayTeamName).toBe('화이트 FS');
    expect(state.bracket.fixtures[0].result?.homeScore).toBe(2);
    expect(state.tournament.operationCounts?.fixtures).toBe(3);
    expect(restoreAdminDemo(JSON.stringify({ version: 2, commands })).state).toEqual(state);
  });
  it('미확정 팀·미배정 경기·동점 결과를 성공으로 처리하지 않는다', () => {
    const initial = createAdminDemoState();
    const generated = runAdminDemo(initial, 'POST', `${base}/bracket/template`, { kind: 'knockout', size: 4 }).state;
    expect(() => runAdminDemo(generated, 'POST', `${base}/slots/random-fill`)).toThrow('4팀 참가 확정');
    expect(() => runAdminDemo(generated, 'POST', '/admin/games/sample-game-1/quick-result', { expectedVersion: 1, score: { home: 0, away: 0 } })).toThrow('양 팀');
    expect(initial.bracket.fixtures).toHaveLength(0);
  });
  it('실제 ID·알 수 없는 경로·업로드는 네트워크 fallback 없이 거절한다', async () => {
    const network = vi.spyOn(globalThis, 'fetch');
    const source = createAdminDemoSource((method, path, body) => runAdminDemo(createAdminDemoState(), method, path, body).data);
    await expect(source.v1Get('/admin/tournaments/real-id')).rejects.toThrow('지원하지 않아요');
    await expect(source.v1Post('/admin/tournaments', {})).rejects.toThrow('지원하지 않아요');
    await expect(source.v1MultipartPost('/uploads/images', new FormData())).rejects.toThrow('업로드');
    expect(network).not.toHaveBeenCalled(); network.mockRestore();
  });
  it('변조되거나 버전이 다른 저장 상태를 실제 상태로 신뢰하지 않는다', () => {
    expect(() => restoreAdminDemo('{"version":1,"commands":[]}')).toThrow();
    expect(() => restoreAdminDemo('{"version":2,"commands":[{"method":"POST","path":"/admin/tournaments"}]}')).toThrow();
    expect(() => restoreAdminDemo('{"version":2,"commands":[{"method":"GET","path":"/admin/me"}]}')).toThrow();
  });
});
