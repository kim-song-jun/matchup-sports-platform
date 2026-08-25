import { Test, type TestingModule } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from '../prisma/prisma.module';
import { UploadsService } from '../uploads/uploads.service';
import { LeagueFixtureVideosController } from './league-fixture-videos.controller';
import { LeagueFixtureVideosService } from './league-fixture-videos.service';
import { LeagueMatchModule } from './league-match.module';

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
      imports: [PrismaModule, LoggerModule.forRoot(), LeagueMatchModule],
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
});
