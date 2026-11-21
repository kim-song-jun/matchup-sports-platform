import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateMetadata } from './page';

vi.mock('@/components/team-schedules/team-schedules-client', () => ({ TeamScheduleListPageClient: () => null }));

const params = Promise.resolve({ id: 'team-1' });

function serve(data: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data }), { status })));
}
afterEach(() => vi.unstubAllGlobals());

describe('팀 일정 화면 메타데이터', () => {
  it('팀 이름이 든 제목·설명과 자기 주소 canonical 로 색인을 허용한다', async () => {
    serve({ id: 'team-1', name: '한강 FC', dissolution: null });
    const meta = await generateMetadata({ params });

    expect(meta.title).toBe('한강 FC 일정');
    expect(meta.description).toContain('한강 FC');
    expect(meta.alternates?.canonical).toBe('/teams/team-1/schedules');
    expect(meta.robots).toMatchObject({ index: true, follow: true });
  });

  it('주소에 쓸 수 없는 글자가 든 팀 id 는 인코딩해 canonical 을 만든다', async () => {
    serve({ id: 'team 1', name: '한강 FC', dissolution: null });
    const meta = await generateMetadata({ params: Promise.resolve({ id: 'team 1' }) });
    expect(meta.alternates?.canonical).toBe('/teams/team%201/schedules');
  });

  it('해체된 팀의 일정은 검색에서 뺀다', async () => {
    serve({ id: 'team-1', name: '한강 FC', dissolution: { dissolvedAt: '2026-10-01T00:00:00Z' } });
    expect((await generateMetadata({ params })).robots).toMatchObject({ index: false });
  });

  it('팀이 없으면 색인하지 않는다', async () => {
    serve(null, 404);
    const meta = await generateMetadata({ params });
    expect(meta.robots).toMatchObject({ index: false });
    expect(meta.alternates).toBeUndefined();
  });

  it('조회 장애를 팀 없음으로 오인해 noindex 로 굳히지 않는다', async () => {
    serve(null, 503);
    await expect(generateMetadata({ params })).rejects.toThrow('503');
  });
});
