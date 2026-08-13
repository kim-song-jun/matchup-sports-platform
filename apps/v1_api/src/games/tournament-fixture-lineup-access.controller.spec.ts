import { BadRequestException } from '@nestjs/common';
import type { V1AuthUser } from '../auth/v1-auth-user';
import type { GamesService } from './games.service';
import { TournamentFixtureLineupAccessController } from './tournament-fixture-lineup-access.controller';

/**
 * `sideId` 없는 lineup-roster 요청을 컨트롤러에서 잘라내는지 검증한다.
 *
 * 이 가드가 없으면 서비스가 `prisma.v1GameSide.findFirst({ where: { id: undefined, ... } })`
 * 를 부르는데, Prisma는 `undefined` 를 "이 조건 없음"으로 해석한다 — 즉 에러가 나는 게
 * 아니라 **그 경기의 아무 사이드나** 집어 들고, 요청하지 않은 팀의 명단이 조용히 나간다.
 * 조용한 오동작이라 화면에서는 알아채기 어렵다(Copilot 리뷰 지적).
 */
describe('TournamentFixtureLineupAccessController.lineupRoster', () => {
  const user = { id: 'user-1', accountStatus: 'active' } as V1AuthUser;

  function makeController() {
    const resolveFixtureLineupRoster = jest.fn().mockResolvedValue({ players: [] });
    const controller = new TournamentFixtureLineupAccessController({
      resolveFixtureLineupRoster,
    } as unknown as GamesService);
    return { controller, resolveFixtureLineupRoster };
  }

  it.each([
    ['누락', undefined],
    ['빈 문자열', ''],
    ['공백만', '   '],
  ])('sideId가 %s이면 서비스를 부르지 않고 400으로 막는다', (_label, sideId) => {
    const { controller, resolveFixtureLineupRoster } = makeController();

    expect(() => controller.lineupRoster(user, 't-1', 'f-1', sideId)).toThrow(BadRequestException);
    expect(resolveFixtureLineupRoster).not.toHaveBeenCalled();
  });

  it('sideId가 있으면 그대로 서비스에 넘긴다', async () => {
    const { controller, resolveFixtureLineupRoster } = makeController();

    await controller.lineupRoster(user, 't-1', 'f-1', 'side-9');

    expect(resolveFixtureLineupRoster).toHaveBeenCalledWith(user, 't-1', 'f-1', 'side-9');
  });
});
