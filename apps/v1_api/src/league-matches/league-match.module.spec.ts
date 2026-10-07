import { Test, type TestingModule } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from '../prisma/prisma.module';
import { TermsModule } from '../terms/terms.module';
import { UploadsService } from '../uploads/uploads.service';
import { LeagueFixtureVideosController } from './league-fixture-videos.controller';
import { LeagueFixtureVideosService } from './league-fixture-videos.service';
import { LeagueCoverImageService } from './league-cover-image.service';
import { LeagueEntryFeeController } from './league-entry-fee.controller';
import { LeagueEntryFeeService } from './league-entry-fee.service';
import { LeagueMatchModule } from './league-match.module';
import { LeagueMatchSettingsController } from './league-match-settings.controller';
import { LeagueRegistrationCloseService } from './league-registration-close.service';

/**
 * DI 그래프가 실제로 풀리고 **컨트롤러가 모듈에 등록돼 있는지** 확인한다 —
 * tournament-fixture-videos.module.spec.ts 와 같은 이유의 배선 스펙이다.
 *
 * 실사고(2026-08-25, #750): LeagueFixtureVideosController 를 import 구문만 추가하고
 * controllers 배열에 넣지 않아 컴파일·유닛 스펙은 전부 green 인 채로 alpha 에서 모든
 * 영상 라우트가 404 였다. 이 스펙은 그 누락을 부팅 전에 잡는다 — moduleRef.get 은
 * 배열에 등록되지 않은 컨트롤러를 resolve 하지 못한다.
 */
describe('LeagueMatchModule wiring', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      // LoggerModule: GamesModule 이 PinoLogger 를 앱 레벨 LoggerModule 에서 받는다 —
      // task-7-module-wiring.spec.ts 와 같은 최소 배선.
      // TermsModule: RealtimeGateway 가 ManagedTermsRuntimeService 를 요구한다(TermsModule 은
      // @Global 이지만 이 부분 모듈 트리엔 다른 경로로 들어오지 않는다) — task-7-module-wiring.spec.ts
      // 와 같은 이유.
      imports: [PrismaModule, LoggerModule.forRoot(), TermsModule, LeagueMatchModule],
    }).compile();
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  it('resolves the league fixture videos controller with its admin-context and uploads dependencies', () => {
    expect(moduleRef.get(LeagueFixtureVideosController)).toBeInstanceOf(LeagueFixtureVideosController);
    expect(moduleRef.get(LeagueFixtureVideosService)).toBeInstanceOf(LeagueFixtureVideosService);
    expect(moduleRef.get(UploadsService)).toBeInstanceOf(UploadsService);
  });

  // 서비스·컨트롤러가 import 만 되고 모듈에 안 올라가면 유닛은 green 인데 alpha 에서 라우트가 404 다.
  it('resolves the close-registration, cover-image and entry-fee controllers and services', () => {
    expect(moduleRef.get(LeagueMatchSettingsController)).toBeInstanceOf(LeagueMatchSettingsController);
    expect(moduleRef.get(LeagueEntryFeeController)).toBeInstanceOf(LeagueEntryFeeController);
    expect(moduleRef.get(LeagueRegistrationCloseService)).toBeInstanceOf(LeagueRegistrationCloseService);
    expect(moduleRef.get(LeagueCoverImageService)).toBeInstanceOf(LeagueCoverImageService);
    expect(moduleRef.get(LeagueEntryFeeService)).toBeInstanceOf(LeagueEntryFeeService);
  });
});
