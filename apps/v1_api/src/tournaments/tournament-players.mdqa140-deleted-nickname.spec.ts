import { Test } from '@nestjs/testing';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentPlayersService } from './tournament-players.service';
import { deletedNicknameCases, makeDeletedNicknamePrisma } from './tournament-players.mdqa140-deleted-nickname.fixtures';

describe('MD-QA #140 deleted nickname boundary', () => {
  it.each(deletedNicknameCases)('listPlayersForAdmin: $label의 현재 닉네임만 반환한다', async ({ user, nickname }) => {
    // Given: 완료 대회의 보존 명단과 실제 삭제/활성 상태를 Prisma select에 맞춰 조회한다.
    const prisma = makeDeletedNicknamePrisma(user);
    const module = await Test.createTestingModule({
      providers: [
        TournamentPlayersService,
        AdminContextService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    const service = module.get(TournamentPlayersService);

    // When: 기존 관리자 서비스와 실제 어드민 권한 경계를 거쳐 명단을 읽는다.
    try {
      const result = await service.listPlayersForAdmin({
        id: 'admin-user-id', email: 'admin@example.test',
        accountStatus: 'active', onboardingStatus: 'completed',
      }, 'reg-1');

      // Then: 삭제된 현재 프로필은 식별값을 노출하지 않고 등록 기록은 보존한다.
      expect(result.players).toEqual([expect.objectContaining({
        id: 'player-1', userId: 'player-user-id', realName: '등록 당시 실명',
        jerseyNumber: 7, nickname, isTeamCaptain: false,
      })]);
      expect(result.belowMinimum).toBe(false);
    } finally {
      await module.close();
    }
  });
});
