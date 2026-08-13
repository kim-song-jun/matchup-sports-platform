import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../../prisma/prisma.module';
import { UploadsService } from '../../uploads/uploads.service';
import { TournamentStaffAccessService } from '../staff/tournament-staff-access.service';
import { TournamentFixtureVideosController } from './tournament-fixture-videos.controller';
import { TournamentFixtureVideosModule } from './tournament-fixture-videos.module';
import { TournamentFixtureVideosService } from './tournament-fixture-videos.service';

/**
 * DI 그래프가 실제로 풀리는지 확인한다 — 이 모듈은 다른 레인이 소유한 `TournamentsModule` 을
 * import 하는 대신 `TournamentStaffAccessService` 를 지역 provider 로 다시 등록하고
 * `UploadsModule` 에서 `UploadsService` 를 가져온다. 둘 중 하나만 빠져도 부팅 시점에야
 * 터지는데, 그 시점은 배포 후다.
 */
describe('TournamentFixtureVideosModule wiring', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, TournamentFixtureVideosModule],
    }).compile();
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  it('resolves the controller with its staff-access and uploads dependencies', () => {
    expect(moduleRef.get(TournamentFixtureVideosController)).toBeInstanceOf(
      TournamentFixtureVideosController,
    );
    expect(moduleRef.get(TournamentFixtureVideosService)).toBeInstanceOf(
      TournamentFixtureVideosService,
    );
    expect(moduleRef.get(TournamentStaffAccessService)).toBeInstanceOf(
      TournamentStaffAccessService,
    );
    expect(moduleRef.get(UploadsService)).toBeInstanceOf(UploadsService);
  });
});
