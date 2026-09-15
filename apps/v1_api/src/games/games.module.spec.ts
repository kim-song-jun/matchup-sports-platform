import { Test, type TestingModule } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from '../prisma/prisma.module';
import { GamesModule } from './games.module';
import { LeagueFixtureClaimAccessController } from './league-fixture-claim-access.controller';
import {
  MyTournamentFixturesController,
  TournamentFixtureLineupAccessController,
} from './tournament-fixture-lineup-access.controller';

/**
 * DI 그래프가 실제로 풀리고 **컨트롤러가 모듈 배열에 등록돼 있는지** 확인한다 —
 * league-match.module.spec.ts 와 같은 이유의 배선 스펙이다.
 *
 * 실사고(2026-08-25, #750/#755): 컨트롤러를 import 구문만 추가하고 controllers 배열에
 * 넣지 않으면 컴파일·유닛 스펙이 전부 green 인 채로 alpha 에서 해당 라우트만 404 가
 * 난다. moduleRef.get 은 배열에 등록되지 않은 컨트롤러를 resolve 하지 못하므로
 * 이 스펙이 그 누락을 부팅 전에 잡는다.
 */
describe('GamesModule wiring', () => {
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

  it('resolves every registered games controller (league claim route included)', () => {
    expect(moduleRef.get(LeagueFixtureClaimAccessController)).toBeInstanceOf(
      LeagueFixtureClaimAccessController,
    );
    expect(moduleRef.get(TournamentFixtureLineupAccessController)).toBeInstanceOf(
      TournamentFixtureLineupAccessController,
    );
    expect(moduleRef.get(MyTournamentFixturesController)).toBeInstanceOf(
      MyTournamentFixturesController,
    );
  });
});
