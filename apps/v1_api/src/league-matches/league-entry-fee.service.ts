import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { findTournamentOnSurface, LEAGUE_KINDS } from '../tournaments/tournament-surface-lookup';
import type { UpdateLeagueEntryFeeDto } from './dto/league-entry-fee.dto';
import { countLeagueActiveRegistrations } from './league-active-registration';

type FeeSnapshot = {
  entryFee: number;
  bankName: string | null;
  bankAccount: string | null;
  bankHolder: string | null;
};

// 계좌번호·예금주 평문은 감사 로그에 남기지 않는다 — 대회 어드민 수정 경로도 계좌를 감사에 싣지 않으므로
// 같게 맞춘다. 바뀌었는지는 아래 changed 플래그로만 남긴다.
const snapshotOf = (row: FeeSnapshot, configured: boolean) => ({
  entryFee: row.entryFee,
  entryFeeConfigured: configured,
  bankName: row.bankName,
  hasBankAccount: row.bankAccount !== null,
  hasBankHolder: row.bankHolder !== null,
});

/**
 * 리그 참가비·입금 계좌 설정(MD-QA #36). 기존 신청의 `payment.amount` 는 신청 당시 스냅샷이라
 * 여기서 건드리지 않는다 — 신청·결제 쪽 테이블에는 쓰기가 없다.
 */
@Injectable()
export class LeagueEntryFeeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
  ) {}

  async update(user: V1AuthUser, leagueId: string, dto: UpdateLeagueEntryFeeDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const reason = dto.reason?.trim() || null;

    return this.prisma.$transaction(async (tx) => {
      const league = await findTournamentOnSurface(tx, LEAGUE_KINDS, {
        where: { id: leagueId },
        select: {
          id: true,
          status: true,
          deletedAt: true,
          entryFee: true,
          entryFeeConfiguredAt: true,
          bankName: true,
          bankAccount: true,
          bankHolder: true,
        },
      });
      if (league === null) {
        throw new NotFoundException({ code: 'LEAGUE_NOT_FOUND', message: '리그를 찾을 수 없어요.' });
      }
      if (league.deletedAt !== null) {
        throw new ConflictException({ code: 'LEAGUE_MIRROR_MISSING', message: '삭제된 리그예요.' });
      }
      if (league.status === 'completed' || league.status === 'cancelled') {
        throw new ConflictException({
          code: 'LEAGUE_ENTRY_FEE_NOT_ALLOWED',
          message: '끝났거나 취소된 리그는 참가비를 바꿀 수 없어요.',
        });
      }

      const next: FeeSnapshot = {
        entryFee: dto.entryFee,
        bankName: dto.bankName?.trim() ?? league.bankName,
        bankAccount: dto.bankAccount?.trim() ?? league.bankAccount,
        bankHolder: dto.bankHolder?.trim() ?? league.bankHolder,
      };
      if (next.entryFee > 0 && (!next.bankName || !next.bankAccount || !next.bankHolder)) {
        throw new UnprocessableEntityException({
          code: 'LEAGUE_PAYMENT_INSTRUCTIONS_REQUIRED',
          message: '유료 리그는 은행명, 계좌번호, 예금주를 모두 입력해야 해요.',
        });
      }

      const moneyChanged =
        next.entryFee !== league.entryFee ||
        next.bankName !== league.bankName ||
        next.bankAccount !== league.bankAccount ||
        next.bankHolder !== league.bankHolder;
      // 값이 같아도 미설정(null)이면 '무료 확정·이어받은 설정 확인'이라는 변경이므로 쓴다.
      if (!moneyChanged && league.entryFeeConfiguredAt !== null) {
        return {
          leagueId,
          entryFee: league.entryFee,
          entryFeeConfiguredAt: league.entryFeeConfiguredAt.toISOString(),
          bankName: league.bankName,
          bankAccount: league.bankAccount,
          bankHolder: league.bankHolder,
          alreadyProcessed: true,
        };
      }

      const now = new Date();
      // 조건부 UPDATE 가 승자 판정이다. null 은 undefined 가 아니라 리터럴이어야 조건이 지워지지 않는다.
      const written = await tx.v1Tournament.updateMany({
        where: {
          id: leagueId,
          kind: 'regular_league',
          deletedAt: null,
          status: { notIn: ['completed', 'cancelled'] },
          entryFee: league.entryFee,
          entryFeeConfiguredAt: league.entryFeeConfiguredAt ?? null,
          bankName: league.bankName ?? null,
          bankAccount: league.bankAccount ?? null,
          bankHolder: league.bankHolder ?? null,
        },
        data: { ...next, entryFeeConfiguredAt: now },
      });
      if (written.count !== 1) {
        throw new ConflictException({
          code: 'LEAGUE_STATE_CHANGED',
          message: '참가비가 방금 바뀌었어요. 새로고침한 뒤 다시 시도해 주세요.',
        });
      }

      // 행 잠금을 잡은 뒤에 센다 — 신청 제출은 같은 행을 FOR UPDATE 하므로 이 순서가 경합을 닫는다.
      // 던지면 위 UPDATE 도 함께 롤백된다.
      if (moneyChanged && reason === null && (await countLeagueActiveRegistrations(tx, leagueId)) > 0) {
        throw new UnprocessableEntityException({
          code: 'LEAGUE_ENTRY_FEE_REASON_REQUIRED',
          message: '이미 신청한 팀이 있어 사유가 필요해요.',
        });
      }

      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'league_match.entry_fee_updated',
          targetType: 'league_match',
          targetId: leagueId,
          reason,
          beforeJson: snapshotOf(league, league.entryFeeConfiguredAt !== null),
          afterJson: {
            ...snapshotOf(next, true),
            bankAccountChanged: next.bankAccount !== league.bankAccount,
            bankHolderChanged: next.bankHolder !== league.bankHolder,
          },
        },
        tx,
      );
      return {
        leagueId,
        entryFee: next.entryFee,
        entryFeeConfiguredAt: now.toISOString(),
        bankName: next.bankName,
        bankAccount: next.bankAccount,
        bankHolder: next.bankHolder,
        alreadyProcessed: false,
      };
    });
  }
}
