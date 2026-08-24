import { NotFoundException } from '@nestjs/common';
import { ProfileService } from './profile.service';

/**
 * 선수 카드 숨김 토글 (Task 155).
 *
 * 이 컬럼(`V1UserProfile.playerCardHidden`)은 카드와 함께 넣었지만 **읽기만 하고
 * 쓰는 경로가 없었다** -- 사용자가 켤 방법이 아예 없는 상태로 배포돼 있었다.
 * 게임화에 거부감이 있는 사용자를 위한 탈출구가 목적인데, 잠글 수 없으면 탈출구가
 * 아니다. 여기서 거는 것은 그 계약이다.
 */

const authUser = {
  id: 'user-1',
  email: 'u1@example.test',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

describe('ProfileService 선수 카드 숨김 토글', () => {
  describe('조회', () => {
    it('프로필 row 가 없으면 컬럼 기본값과 같은 false 를 준다 -- 카드를 보여준다는 뜻', async () => {
      const prisma = { v1UserProfile: { findUnique: jest.fn().mockResolvedValue(null) } };
      const service = new ProfileService(prisma as never);

      await expect(service.myPlayerCardHidden(authUser)).resolves.toEqual({ hidden: false });
    });

    it('저장된 값을 그대로 준다', async () => {
      const prisma = { v1UserProfile: { findUnique: jest.fn().mockResolvedValue({ playerCardHidden: true }) } };
      const service = new ProfileService(prisma as never);

      await expect(service.myPlayerCardHidden(authUser)).resolves.toEqual({ hidden: true });
    });
  });

  describe('저장', () => {
    it('켜면 컬럼에 true 가 그대로 들어간다 -- 화면·API·DB 가 같은 방향이어야 반전 실수가 없다', async () => {
      const update = jest.fn().mockResolvedValue({ playerCardHidden: true });
      const prisma = {
        v1UserProfile: { findUnique: jest.fn().mockResolvedValue({ id: 'p-1' }), update },
      };
      const service = new ProfileService(prisma as never);

      await expect(service.updateMyPlayerCardHidden(authUser, { hidden: true })).resolves.toEqual({ hidden: true });
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { playerCardHidden: true } }),
      );
    });

    it('끄면 false 가 들어간다', async () => {
      const update = jest.fn().mockResolvedValue({ playerCardHidden: false });
      const prisma = {
        v1UserProfile: { findUnique: jest.fn().mockResolvedValue({ id: 'p-1' }), update },
      };
      const service = new ProfileService(prisma as never);

      await expect(service.updateMyPlayerCardHidden(authUser, { hidden: false })).resolves.toEqual({ hidden: false });
      expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { playerCardHidden: false } }));
    });

    it('프로필이 아직 없으면 404 로 막는다 -- 닉네임 없이 row 를 만들 수 없다', async () => {
      const update = jest.fn();
      const prisma = {
        v1UserProfile: { findUnique: jest.fn().mockResolvedValue(null), update },
      };
      const service = new ProfileService(prisma as never);

      await expect(service.updateMyPlayerCardHidden(authUser, { hidden: true })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(update).not.toHaveBeenCalled();
    });
  });
});
