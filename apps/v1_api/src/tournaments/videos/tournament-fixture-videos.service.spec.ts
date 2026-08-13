import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import type { PrismaService } from '../../prisma/prisma.service';
import type { UploadedFile, UploadsService } from '../../uploads/uploads.service';
import { TournamentStaffAccessService } from '../staff/tournament-staff-access.service';
import { TournamentFixtureVideosService } from './tournament-fixture-videos.service';

const tournamentId = '00000000-0000-4000-8000-000000000001';
const fixtureId = '00000000-0000-4000-8000-000000000002';
const otherFixtureId = '00000000-0000-4000-8000-000000000003';
const fieldId = '00000000-0000-4000-8000-000000000004';

const user = (id: string): V1AuthUser => ({
  id,
  email: `${id}@teameet.test`,
  accountStatus: 'active',
  onboardingStatus: 'completed',
});

type StaffRole = 'TOURNAMENT_DIRECTOR' | 'FIELD_OPERATOR' | 'SUPPORT_READONLY';

type Assignment = {
  userId: string;
  role: StaffRole;
  fieldId: string | null;
  fixtureIds: string[];
};

type VideoRow = {
  id: string;
  fixtureId: string;
  title: string | null;
  url: string;
  sortOrder: number;
  createdAt: Date;
};

/**
 * 권한은 목이 아니라 **실제 정책**(`decideTournamentStaffAccess`)으로 검증한다 — 여기서
 * `TournamentStaffAccessService` 를 진짜로 만들고 배정 행만 가짜 prisma 로 공급한다. 그래서
 * "영상 등록 = event_append" 매핑이 각 역할에 어떤 결과를 내는지가 실제로 확인된다.
 */
function createHarness(options: {
  assignments?: Assignment[];
  fixtureFieldId?: string | null;
  videos?: VideoRow[];
  uploadAssets?: { url: string; ownerUserId: string; kind: 'image' | 'video' }[];
  fixtureExists?: boolean;
}) {
  const assignments = options.assignments ?? [];
  const videos: VideoRow[] = [...(options.videos ?? [])];
  const uploadAssets = [...(options.uploadAssets ?? [])];
  const fixtureExists = options.fixtureExists ?? true;

  const removedUrls: string[] = [];
  const discarded: UploadedFile[][] = [];

  const prisma = {
    v1AdminUser: { findUnique: jest.fn().mockResolvedValue(null) },
    v1TournamentStaffAssignment: {
      findMany: jest.fn(async ({ where }: { where: { userId: string } }) =>
        assignments
          .filter((assignment) => assignment.userId === where.userId)
          .map((assignment, index) => ({
            id: `assignment-${index}`,
            tournamentId,
            role: assignment.role,
            fieldId: assignment.fieldId,
            version: 1,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            expiresAt: null,
            revokedAt: null,
            fixtureScopes: assignment.fixtureIds.map((id) => ({ fixtureId: id })),
          })),
      ),
    },
    v1Tournament: { findFirst: jest.fn().mockResolvedValue({ id: tournamentId }) },
    v1TournamentFixture: {
      findUnique: jest.fn(async ({ where }: { where: { tournamentId_id: { id: string } } }) =>
        fixtureExists
          ? { id: where.tournamentId_id.id, fieldId: options.fixtureFieldId ?? null }
          : null,
      ),
    },
    v1TournamentFixtureVideo: {
      findMany: jest.fn(async ({ where }: { where: { fixtureId: string } }) =>
        videos.filter((video) => video.fixtureId === where.fixtureId),
      ),
      findFirst: jest.fn(async ({ where }: { where: { id: string; fixtureId: string } }) =>
        videos.find((video) => video.id === where.id && video.fixtureId === where.fixtureId) ?? null,
      ),
      count: jest.fn(async ({ where }: { where: { url: string } }) =>
        videos.filter((video) => video.url === where.url).length,
      ),
      create: jest.fn(async ({ data }: { data: Omit<VideoRow, 'id' | 'createdAt'> }) => {
        const row: VideoRow = { id: `video-${videos.length + 1}`, createdAt: new Date(), ...data };
        videos.push(row);
        return row;
      }),
      delete: jest.fn(async ({ where }: { where: { id: string } }) => {
        const index = videos.findIndex((video) => video.id === where.id);
        const [removed] = videos.splice(index, 1);
        return removed;
      }),
    },
    v1UploadAsset: {
      findUnique: jest.fn(async ({ where }: { where: { url: string } }) =>
        uploadAssets.find((asset) => asset.url === where.url) ?? null,
      ),
      deleteMany: jest.fn(async ({ where }: { where: { url: string } }) => {
        const before = uploadAssets.length;
        for (let i = uploadAssets.length - 1; i >= 0; i -= 1) {
          if (uploadAssets[i]!.url === where.url) uploadAssets.splice(i, 1);
        }
        return { count: before - uploadAssets.length };
      }),
    },
  };

  const uploads = {
    storeFiles: jest.fn(),
    removeStoredUrl: jest.fn(async (url: string) => {
      removedUrls.push(url);
    }),
    discardTemps: jest.fn(async (files: UploadedFile[]) => {
      discarded.push(files);
    }),
  };

  const access = new TournamentStaffAccessService(prisma as unknown as PrismaService);
  const service = new TournamentFixtureVideosService(
    prisma as unknown as PrismaService,
    access,
    uploads as unknown as UploadsService,
  );
  return { service, prisma, uploads, videos, uploadAssets, removedUrls, discarded };
}

describe('TournamentFixtureVideosService — 권한', () => {
  it('배정이 없는 사용자는 등록할 수 없다', async () => {
    const { service } = createHarness({ assignments: [] });

    await expect(
      service.createVideo(user('stranger'), tournamentId, fixtureId, {
        url: 'https://youtu.be/abcdefghijk',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('지원 담당(SUPPORT_READONLY)은 조회는 되지만 등록은 막힌다', async () => {
    const { service } = createHarness({
      assignments: [{ userId: 'support', role: 'SUPPORT_READONLY', fieldId: null, fixtureIds: [] }],
    });

    await expect(service.listFixtureVideos(user('support'), tournamentId, fixtureId)).resolves.toEqual({
      items: [],
    });
    await expect(
      service.createVideo(user('support'), tournamentId, fixtureId, {
        url: 'https://youtu.be/abcdefghijk',
      }),
    ).rejects.toMatchObject({ response: { details: { reason: 'ROLE_ACTION_DENIED' } } });
  });

  it('대회 디렉터는 대회 전체 경기에 등록할 수 있다', async () => {
    const { service } = createHarness({
      assignments: [{ userId: 'director', role: 'TOURNAMENT_DIRECTOR', fieldId: null, fixtureIds: [] }],
    });

    await expect(
      service.createVideo(user('director'), tournamentId, fixtureId, {
        url: 'https://youtu.be/abcdefghijk',
        title: '  결승골  ',
      }),
    ).resolves.toMatchObject({ title: '결승골', source: 'external', sortOrder: 0 });
  });

  it('필드 담당자는 담당 경기에만 등록할 수 있다', async () => {
    const { service } = createHarness({
      assignments: [
        { userId: 'operator', role: 'FIELD_OPERATOR', fieldId: null, fixtureIds: [fixtureId] },
      ],
    });

    await expect(
      service.createVideo(user('operator'), tournamentId, fixtureId, {
        url: 'https://youtu.be/abcdefghijk',
      }),
    ).resolves.toMatchObject({ source: 'external' });

    await expect(
      service.createVideo(user('operator'), tournamentId, otherFixtureId, {
        url: 'https://youtu.be/abcdefghijk',
      }),
    ).rejects.toMatchObject({ response: { details: { reason: 'FIXTURE_SCOPE_DENIED' } } });
  });

  it('필드 단위로 배정된 담당자는 그 필드에서 열리는 경기에만 등록할 수 있다', async () => {
    const assigned = createHarness({
      assignments: [{ userId: 'operator', role: 'FIELD_OPERATOR', fieldId, fixtureIds: [] }],
      fixtureFieldId: fieldId,
    });
    await expect(
      assigned.service.createVideo(user('operator'), tournamentId, fixtureId, {
        url: 'https://youtu.be/abcdefghijk',
      }),
    ).resolves.toMatchObject({ source: 'external' });

    const elsewhere = createHarness({
      assignments: [{ userId: 'operator', role: 'FIELD_OPERATOR', fieldId, fixtureIds: [] }],
      fixtureFieldId: '00000000-0000-4000-8000-000000000009',
    });
    await expect(
      elsewhere.service.createVideo(user('operator'), tournamentId, fixtureId, {
        url: 'https://youtu.be/abcdefghijk',
      }),
    ).rejects.toMatchObject({ response: { details: { reason: 'FIELD_SCOPE_DENIED' } } });
  });

  it('권한 없는 요청에는 경기 존재 여부를 알려 주지 않는다', async () => {
    const { service } = createHarness({ assignments: [], fixtureExists: false });

    // 존재하지 않는 경기라도 권한 판정이 먼저 — 404 가 아니라 403 이 나와야 한다.
    await expect(
      service.createVideo(user('stranger'), tournamentId, fixtureId, {
        url: 'https://youtu.be/abcdefghijk',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('TournamentFixtureVideosService — 등록', () => {
  const director: Assignment = {
    userId: 'director',
    role: 'TOURNAMENT_DIRECTOR',
    fieldId: null,
    fixtureIds: [],
  };

  it('http/https 가 아닌 링크는 저장 전에 막는다', async () => {
    const { service, prisma } = createHarness({ assignments: [director] });

    await expect(
      service.createVideo(user('director'), tournamentId, fixtureId, {
        url: 'javascript:alert(document.cookie)',
      }),
    ).rejects.toMatchObject({
      response: { code: 'FIXTURE_VIDEO_URL_INVALID', details: { reason: 'SCHEME_NOT_ALLOWED' } },
    });
    expect(prisma.v1TournamentFixtureVideo.create).not.toHaveBeenCalled();
  });

  it('내가 올린 업로드 파일만 등록할 수 있다', async () => {
    const url = '/uploads/2026/08/clip.mp4';
    const mine = createHarness({
      assignments: [director],
      uploadAssets: [{ url, ownerUserId: 'director', kind: 'video' }],
    });
    await expect(
      mine.service.createVideo(user('director'), tournamentId, fixtureId, { url }),
    ).resolves.toMatchObject({ url, source: 'upload' });

    const someoneElses = createHarness({
      assignments: [director],
      uploadAssets: [{ url, ownerUserId: 'other-user', kind: 'video' }],
    });
    await expect(
      someoneElses.service.createVideo(user('director'), tournamentId, fixtureId, { url }),
    ).rejects.toMatchObject({ response: { code: 'FIXTURE_VIDEO_UPLOAD_NOT_FOUND' } });
  });

  it('같은 경기에 같은 영상을 두 번 등록하지 않는다', async () => {
    const { service } = createHarness({
      assignments: [director],
      videos: [
        {
          id: 'video-existing',
          fixtureId,
          title: null,
          url: 'https://youtu.be/abcdefghijk',
          sortOrder: 0,
          createdAt: new Date(),
        },
      ],
    });

    await expect(
      service.createVideo(user('director'), tournamentId, fixtureId, {
        url: 'https://youtu.be/abcdefghijk',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('업로드 등록이 막히면 방금 저장한 파일을 되돌린다', async () => {
    const url = '/uploads/2026/08/rollback.mp4';
    const harness = createHarness({
      assignments: [director],
      videos: Array.from({ length: 10 }, (_, index) => ({
        id: `video-${index}`,
        fixtureId,
        title: null,
        url: `https://youtu.be/video${index}xyz`,
        sortOrder: index,
        createdAt: new Date(),
      })),
      uploadAssets: [{ url, ownerUserId: 'director', kind: 'video' }],
    });
    harness.uploads.storeFiles.mockResolvedValue({ urls: [url] });

    await expect(
      harness.service.uploadAndCreateVideo(user('director'), tournamentId, fixtureId, [], undefined),
    ).rejects.toMatchObject({ response: { code: 'FIXTURE_VIDEO_LIMIT_EXCEEDED' } });

    expect(harness.removedUrls).toEqual([url]);
    expect(harness.uploadAssets).toHaveLength(0);
  });

  it('권한이 없으면 multer 가 받아 둔 임시 파일을 지우고 거부한다', async () => {
    const harness = createHarness({ assignments: [] });
    const temps = [{ path: '/tmp/upload-abc' }] as unknown as UploadedFile[];

    await expect(
      harness.service.uploadAndCreateVideo(user('stranger'), tournamentId, fixtureId, temps, undefined),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(harness.discarded).toEqual([temps]);
    expect(harness.uploads.storeFiles).not.toHaveBeenCalled();
  });
});

describe('TournamentFixtureVideosService — 삭제와 파일 회수', () => {
  const director: Assignment = {
    userId: 'director',
    role: 'TOURNAMENT_DIRECTOR',
    fieldId: null,
    fixtureIds: [],
  };
  const uploadUrl = '/uploads/2026/08/clip.mp4';

  function videoRow(overrides: Partial<VideoRow> = {}): VideoRow {
    return {
      id: 'video-1',
      fixtureId,
      title: null,
      url: uploadUrl,
      sortOrder: 0,
      createdAt: new Date(),
      ...overrides,
    };
  }

  it('업로드 영상을 지우면 물리 파일과 업로드 원장까지 회수한다', async () => {
    const harness = createHarness({
      assignments: [director],
      videos: [videoRow()],
      uploadAssets: [{ url: uploadUrl, ownerUserId: 'director', kind: 'video' }],
    });

    await expect(
      harness.service.deleteVideo(user('director'), tournamentId, fixtureId, 'video-1'),
    ).resolves.toEqual({ deleted: true });

    expect(harness.removedUrls).toEqual([uploadUrl]);
    expect(harness.uploadAssets).toHaveLength(0);
    expect(harness.videos).toHaveLength(0);
  });

  it('같은 파일을 다른 경기가 아직 참조하면 파일을 남긴다', async () => {
    const harness = createHarness({
      assignments: [director],
      videos: [videoRow(), videoRow({ id: 'video-2', fixtureId: otherFixtureId })],
      uploadAssets: [{ url: uploadUrl, ownerUserId: 'director', kind: 'video' }],
    });

    await harness.service.deleteVideo(user('director'), tournamentId, fixtureId, 'video-1');

    expect(harness.removedUrls).toEqual([]);
    expect(harness.uploadAssets).toHaveLength(1);
  });

  it('외부 링크 삭제는 지울 파일이 없다', async () => {
    const harness = createHarness({
      assignments: [director],
      videos: [videoRow({ url: 'https://youtu.be/abcdefghijk' })],
    });

    await harness.service.deleteVideo(user('director'), tournamentId, fixtureId, 'video-1');

    expect(harness.removedUrls).toEqual([]);
  });

  it('없는 영상 삭제는 404 — 다른 경기의 영상 id 로는 지울 수 없다', async () => {
    const harness = createHarness({
      assignments: [director],
      videos: [videoRow({ id: 'video-9', fixtureId: otherFixtureId })],
    });

    await expect(
      harness.service.deleteVideo(user('director'), tournamentId, fixtureId, 'video-9'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('파일 삭제가 실패해도 영상 삭제는 끝나고 업로드 원장은 남는다', async () => {
    const harness = createHarness({
      assignments: [director],
      videos: [videoRow()],
      uploadAssets: [{ url: uploadUrl, ownerUserId: 'director', kind: 'video' }],
    });
    harness.uploads.removeStoredUrl.mockRejectedValue(new Error('EACCES'));

    await expect(
      harness.service.deleteVideo(user('director'), tournamentId, fixtureId, 'video-1'),
    ).resolves.toEqual({ deleted: true });
    // 원장이 남아 있어야 어떤 파일이 남았는지 나중에 추적할 수 있다.
    expect(harness.uploadAssets).toHaveLength(1);
  });
});

describe('TournamentFixtureVideosService — 대회 단위 조회', () => {
  it('배정된 스태프만 대회 전체 목록을 볼 수 있다', async () => {
    const denied = createHarness({ assignments: [] });
    await expect(
      denied.service.listTournamentVideos(user('stranger'), tournamentId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('없는 대회는 404', async () => {
    const harness = createHarness({
      assignments: [
        { userId: 'director', role: 'TOURNAMENT_DIRECTOR', fieldId: null, fixtureIds: [] },
      ],
    });
    harness.prisma.v1Tournament.findFirst.mockResolvedValue(null);
    // 대회 단위 목록은 fixture 조회를 쓰지 않으므로 findMany 스텁이 필요 없다.
    await expect(
      harness.service.listTournamentVideos(user('director'), tournamentId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('TournamentFixtureVideosService — 업로드 응답 계약', () => {
  it('업로드가 파일을 반환하지 않으면 400 으로 끝난다', async () => {
    const harness = createHarness({
      assignments: [
        { userId: 'director', role: 'TOURNAMENT_DIRECTOR', fieldId: null, fixtureIds: [] },
      ],
    });
    harness.uploads.storeFiles.mockResolvedValue({ urls: [] });

    await expect(
      harness.service.uploadAndCreateVideo(user('director'), tournamentId, fixtureId, [], undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
