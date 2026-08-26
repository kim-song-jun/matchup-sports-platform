import { Test, type TestingModule } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from '../prisma/prisma.module';
import { GamesModule } from './games.module';
import { LeagueClaimableFixturesController } from './league-claimable-fixtures.controller';
import { LeagueClaimableFixturesService } from './league-claimable-fixtures.service';

/**
 * 배선 스펙 — 새 컨트롤러가 **모듈 배열에 실제로 등록됐는지** 확인한다.
 *
 * 실사고(2026-08-25, #750/#755): 컨트롤러를 import 구문만 추가하고 `controllers` 배열에
 * 넣지 않으면 tsc·유닛 스펙이 전부 green 인 채로 alpha 에서 그 라우트만 404 가 난다.
 * `moduleRef.get` 은 등록되지 않은 컨트롤러를 resolve 하지 못하므로 이 스펙이 그 누락을
 * 부팅 전에 잡는다(games.module.spec.ts 가 세운 관례).
 *
 * 서비스도 함께 확인한다 — 컨트롤러만 등록하고 provider 를 빠뜨리면 `compile()` 단계에서
 * 의존성 해석이 실패해야 하고, 그 실패를 이 스펙이 대신 받는다.
 */
describe('LeagueClaimableFixturesController wiring', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      // LoggerModule: GamesModule 이 PinoLogger 를 앱 레벨 LoggerModule 에서 받는다.
      imports: [PrismaModule, LoggerModule.forRoot(), GamesModule],
    }).compile();
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  it('리그 범위 claimable 조회 컨트롤러와 서비스가 GamesModule 에서 해석된다', () => {
    expect(moduleRef.get(LeagueClaimableFixturesController)).toBeInstanceOf(
      LeagueClaimableFixturesController,
    );
    expect(moduleRef.get(LeagueClaimableFixturesService)).toBeInstanceOf(
      LeagueClaimableFixturesService,
    );
  });
});
