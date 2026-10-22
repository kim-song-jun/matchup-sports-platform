import { PrismaService } from '../../src/prisma/prisma.service';
import { AdminContextService } from '../../src/common/admin-context.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { TournamentsAdminService } from '../../src/tournaments/tournaments-admin.service';
import { presentTournamentCard } from '../../src/tournaments/tournament-card.presenter';
import { presentTournamentDetail } from '../../src/tournaments/tournament-detail.presenter';
import { TOURNAMENT_DETAIL_INCLUDE, TOURNAMENT_LIST_INCLUDE } from '../../src/tournaments/tournaments-read.query';
import { competitionConfigFixture as ids, seedCompetitionConfigFixture } from '../fixtures/competition-config.fixture';
import { seedSupportAdmin } from '../helpers/bracket-canvas-fixture';

jest.setTimeout(60_000);
const prisma = new PrismaService();
const user = { id: ids.adminUserId, email: 'tournament-images@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const service = new TournamentsAdminService(prisma, new AdminContextService(prisma), {} as NotificationsService);

describe('대회 이미지 실제 저장/재조회 계약', () => {
  beforeAll(async () => { await prisma.$connect(); await seedCompetitionConfigFixture(prisma, user); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('DB 기본값 true와 두 URL 저장, 숨김/재표시 및 공개 표면을 보존한다', async () => {
    const seeded = await prisma.v1Tournament.findUniqueOrThrow({ where: { id: ids.tournamentId } });
    expect(seeded.showDetailImage).toBe(true);
    const created = await service.create(user, { title: '두 장 이미지 대회', sportId: ids.soccerSportId, teamCount: 8, coverImageUrl: '/uploads/detail.webp', listImageUrl: '/uploads/list.webp' });
    expect(created.showDetailImage).toBe(true);
    const hidden = await service.update(user, created.id, { expectedVersion: created.updatedAt, showDetailImage: false });
    expect(hidden).toMatchObject({ coverImageUrl: '/uploads/detail.webp', listImageUrl: '/uploads/list.webp', showDetailImage: false });
    const detailRow = await prisma.v1Tournament.findUniqueOrThrow({ where: { id: created.id }, include: TOURNAMENT_DETAIL_INCLUDE });
    expect(presentTournamentDetail(detailRow, false)).toMatchObject({ coverImageUrl: '/uploads/detail.webp', listImageUrl: '/uploads/list.webp', showDetailImage: false });
    const listRow = await prisma.v1Tournament.findUniqueOrThrow({ where: { id: created.id }, include: TOURNAMENT_LIST_INCLUDE });
    expect(presentTournamentCard(listRow)).toMatchObject({ coverImageUrl: '/uploads/list.webp', listImageUrl: '/uploads/list.webp' });
    const restored = await service.update(user, created.id, { expectedVersion: hidden.updatedAt, showDetailImage: true });
    expect(restored).toMatchObject({ showDetailImage: true, coverImageUrl: '/uploads/detail.webp', listImageUrl: '/uploads/list.webp' });
  });

  it('읽기 전용 권한·CAS 충돌은 사진/표시 설정을 바꾸지 않는다', async () => {
    const created = await service.create(user, { title: '이미지 권한 대회', sportId: ids.soccerSportId, teamCount: 8 });
    const support = await seedSupportAdmin(prisma, 'tournament-images-support');
    await expect(service.update(support, created.id, { expectedVersion: created.updatedAt, showDetailImage: false })).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    await expect(service.update(user, created.id, { expectedVersion: '2020-01-01T00:00:00.000Z', showDetailImage: false })).rejects.toMatchObject({ response: { code: 'TOURNAMENT_VERSION_CONFLICT' } });
    expect((await service.get(user, created.id)).showDetailImage).toBe(true);
  });
});
