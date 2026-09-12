import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import type { AdminContextService } from '../common/admin-context.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { UploadsService } from '../uploads/uploads.service';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { LeagueFixtureVideosService } from './league-fixture-videos.service';

/**
 * 대회 영상 서비스와 공유하는 규칙(URL 검증·상한·중복)은 스모크만 확인하고,
 * 이 스펙의 핵심은 **리그 고유 규칙**이다:
 *  - 주차 라벨(round='N주차')과 팀 실명이 목록 응답에 실린다
 *  - 업로드 파일 회수가 canonical `V1TeamMatchVideo` URL 참조를 센다.
 */

const USER = { id: 'admin-1' } as V1AuthUser;
const LEAGUE_ID = 'c1000000-0000-4000-8000-000000000001';
const TEAM_MATCH_ID = 'c1000000-0000-4000-8000-000000000002';

function buildService(options: {
  videos?: Array<{ id: string; url: string; sortOrder: number; title: string | null; createdAt: Date; teamMatchId: string }>;
  teamMatchUrlRefs?: number;
  adminContext?: AdminContextService;
}) {
  const removed: string[] = [];
  const created: Array<Record<string, unknown>> = [];
  const executeRaw = jest.fn().mockResolvedValue(0);
  const videos = options.videos ?? [];
  const fakePrisma = {
    // BE-5: 리그 존재 확인이 통합 축으로 옮겨졌다.
    v1Tournament: { findFirst: async () => ({ id: LEAGUE_ID }) },
    v1TeamMatch: {
      findFirst: async () => ({ id: TEAM_MATCH_ID }),
      findMany: async () => [
        { id: 'fx-1', startAt: new Date('2026-09-05T10:00:00.000Z'), status: 'completed', hostTeam: { name: '성수 FC' }, approvedApplicantTeam: { name: '왕십리 유나이티드' }, videos: [] },
        { id: 'fx-2', startAt: new Date('2026-09-12T10:00:00.000Z'), status: 'matched', hostTeam: { name: '성수 FC' }, approvedApplicantTeam: null, videos: [] },
      ],
    },
    v1TeamMatchVideo: {
      findMany: async () => videos,
      findFirst: async () => videos[0] ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: 'video-new', createdAt: new Date('2026-09-05T12:00:00.000Z'), title: (data.title as string | null) ?? null, url: data.url as string, sortOrder: data.sortOrder as number };
      },
      delete: async () => videos[0],
      count: async () => options.teamMatchUrlRefs ?? 0,
    },
    v1UploadAsset: {
      findUnique: async () => ({ ownerUserId: USER.id, kind: 'video' }),
      deleteMany: async () => ({ count: 1 }),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'admin-row' }]),
    $executeRaw: executeRaw,
  } as unknown as PrismaService;
  (fakePrisma as unknown as { $transaction: (callback: (tx: typeof fakePrisma) => Promise<unknown>) => Promise<unknown> }).$transaction =
    async (callback) => callback(fakePrisma);
  const adminContext =
    options.adminContext ??
    ({
      getActiveAdmin: async () => ({ id: 'admin-row' }),
      getMutationAdmin: async () => ({ id: 'admin-row' }),
    } as unknown as AdminContextService);
  const uploads = {
    discardTemps: async () => undefined,
    storeFiles: async () => ({ urls: ['/uploads/2026/08/new.mp4'] }),
    removeStoredUrl: async (url: string) => {
      removed.push(url);
    },
  } as unknown as UploadsService;
  const service = new LeagueFixtureVideosService(fakePrisma, adminContext, uploads);
  return { service, removed, created, executeRaw };
}

describe('LeagueFixtureVideosService', () => {
  it('목록: 주차 라벨(round)과 팀 실명이 실리고, 상대 미정은 null 로 남는다', async () => {
    const { service } = buildService({});
    const result = await service.listLeagueVideos(USER, LEAGUE_ID);
    expect(result.items[0]).toMatchObject({ fixtureId: 'fx-1', round: '1주차', homeTeamName: '성수 FC', awayTeamName: '왕십리 유나이티드' });
    expect(result.items[1]).toMatchObject({ fixtureId: 'fx-2', round: '2주차', awayTeamName: null });
  });

  it('목록 조회는 support 등급을 막지 않는다 (대회 쪽과 인가 축을 맞춤) — getMutationAdmin 대신 getActiveAdmin 사용', async () => {
    const supportBlocking = {
      getActiveAdmin: async () => ({ id: 'admin-row', adminRole: 'support' }),
      getMutationAdmin: async () => {
        throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Support admins cannot mutate' });
      },
    } as unknown as AdminContextService;
    const { service } = buildService({ adminContext: supportBlocking });
    await expect(service.listLeagueVideos(USER, LEAGUE_ID)).resolves.toBeDefined();
  });

  it('잘못된 URL 스킴은 등록을 거부한다 (대회와 같은 단일 관문)', async () => {
    const { service } = buildService({});
    await expect(
      service.createVideo(USER, LEAGUE_ID, TEAM_MATCH_ID, { url: 'javascript:alert(1)' } as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('경기당 상한을 넘으면 409', async () => {
    const { service } = buildService({
      videos: Array.from({ length: 10 }, (_, index) => ({
        id: `v-${index}`,
        url: `https://youtu.be/${index}`,
        sortOrder: index,
        title: null,
        createdAt: new Date(),
        teamMatchId: TEAM_MATCH_ID,
      })),
    });
    await expect(
      service.createVideo(USER, LEAGUE_ID, TEAM_MATCH_ID, { url: 'https://youtu.be/new' } as never),
    ).rejects.toThrow(ConflictException);
  });

  it('같은 URL 재등록은 409', async () => {
    const { service } = buildService({
      videos: [{ id: 'v-1', url: 'https://youtu.be/dup', sortOrder: 0, title: null, createdAt: new Date(), teamMatchId: TEAM_MATCH_ID }],
    });
    await expect(
      service.createVideo(USER, LEAGUE_ID, TEAM_MATCH_ID, { url: 'https://youtu.be/dup' } as never),
    ).rejects.toThrow(ConflictException);
  });

  it('삭제: canonical 경기 어디에서도 참조되지 않을 때만 물리 회수한다', async () => {
    const uploadVideo = { id: 'v-1', url: '/uploads/2026/08/a.mp4', sortOrder: 0, title: null, createdAt: new Date(), teamMatchId: TEAM_MATCH_ID };
    const { service, removed, executeRaw } = buildService({ videos: [uploadVideo], teamMatchUrlRefs: 0 });
    await service.deleteVideo(USER, LEAGUE_ID, TEAM_MATCH_ID, 'v-1');
    expect(removed).toEqual([]);
    // Physical unlink is deferred to VIDEO_UPLOAD_CLEANUP worker after the
    // transaction; the lock and durable outbox insert both ran.
    const calls = executeRaw.mock.calls;
    expect(calls.filter((call) => String(call[0]).includes('pg_advisory_xact_lock'))).toHaveLength(2);
    const cleanupCall = calls.find((call) => String(call[0]).includes('INSERT INTO v1_outbox_events'));
    expect(cleanupCall).toBeDefined();
    expect(cleanupCall).toContain('/uploads/2026/08/a.mp4');
  });

  it('삭제: 다른 canonical 경기에도 같은 업로드 URL 참조가 남아 있으면 물리 파일을 지우지 않는다', async () => {
    const uploadVideo = { id: 'v-1', url: '/uploads/2026/08/a.mp4', sortOrder: 0, title: null, createdAt: new Date(), teamMatchId: TEAM_MATCH_ID };
    const { service, removed, executeRaw } = buildService({ videos: [uploadVideo], teamMatchUrlRefs: 1 });
    await service.deleteVideo(USER, LEAGUE_ID, TEAM_MATCH_ID, 'v-1');
    expect(removed).toEqual([]);
    expect(executeRaw.mock.calls.filter((call) => String(call[0]).includes('pg_advisory_xact_lock'))).toHaveLength(2);
    expect(executeRaw.mock.calls.some((call) => String(call[0]).includes('INSERT INTO v1_outbox_events'))).toBe(false);
  });
});
