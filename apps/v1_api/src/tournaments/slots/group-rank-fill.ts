import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { V1CompetitionKind, type Prisma } from '@prisma/client';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import type { AdminContextService, V1ActiveAdmin } from '../../common/admin-context.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { findTournamentOnSurface, TOURNAMENT_KINDS } from '../tournament-surface-lookup';
import { loadGroupRankPreview, type GroupRankPreview } from './load-group-rank-preview';

export type FillOverride = { slotId: string; registrationId: string };
export type FillPlan = {
  assignments: Array<{ slotId: string; registrationId: string }>;
  writes: Array<{ slotId: string; from: string | null; to: string }>;
  skipped: Array<{ slotId: string; reason: 'tied' | 'group_incomplete' }>;
};

const invalidOverride = (message: string) =>
  new UnprocessableEntityException({ code: 'SLOT_REGISTRATION_INVALID', message });

export function planFillFromStandings(preview: GroupRankPreview, overrides: readonly FillOverride[]): FillPlan {
  const rowBySlot = new Map(preview.rows.map((row) => [row.slotId, row]));
  const overrideBySlot = new Map<string, string>();
  for (const override of overrides) {
    const row = rowBySlot.get(override.slotId);
    if (row === undefined) {
      throw new NotFoundException({ code: 'SLOT_NOT_FOUND', message: '순위로 채우는 자리를 찾을 수 없어요.' });
    }
    if (overrideBySlot.has(override.slotId)) throw invalidOverride('같은 자리를 두 번 고를 수 없어요.');
    if (row.state === 'group_incomplete') {
      throw invalidOverride(`${row.label}은 조별 경기가 아직 끝나지 않아 팀을 고를 수 없어요.`);
    }
    const allowed =
      row.state === 'tied' ? new Set(row.tiedRegistrationIds) : preview.groupMembers.get(override.slotId);
    if (allowed === undefined || !allowed.has(override.registrationId)) {
      throw invalidOverride(`${row.label}에 넣을 수 없는 팀이에요.`);
    }
    overrideBySlot.set(override.slotId, override.registrationId);
  }

  const assignments: FillPlan['assignments'] = [];
  const skipped: FillPlan['skipped'] = [];
  for (const row of preview.rows) {
    const picked = overrideBySlot.get(row.slotId) ?? (row.state === 'ready' ? row.candidateRegistrationId : null);
    if (picked !== null) {
      assignments.push({ slotId: row.slotId, registrationId: picked });
    } else {
      skipped.push({ slotId: row.slotId, reason: row.state === 'tied' ? 'tied' : 'group_incomplete' });
    }
  }

  const placed = new Set<string>();
  for (const assignment of assignments) {
    if (placed.has(assignment.registrationId)) {
      throw new ConflictException({ code: 'SLOT_TEAM_ALREADY_PLACED', message: '같은 팀을 두 자리에 넣을 수 없어요.' });
    }
    placed.add(assignment.registrationId);
  }

  const writes = assignments.flatMap((assignment) => {
    const from = rowBySlot.get(assignment.slotId)!.currentRegistrationId;
    return from === assignment.registrationId ? [] : [{ slotId: assignment.slotId, from, to: assignment.registrationId }];
  });
  return { assignments, writes, skipped };
}

async function requireTournament(prisma: PrismaService, tournamentId: string) {
  const tournament = await findTournamentOnSurface(prisma, TOURNAMENT_KINDS, {
    where: { id: tournamentId, deletedAt: null },
    select: { id: true, kind: true },
  });
  if (tournament === null) {
    throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
  }
  return tournament;
}

export async function previewGroupRankStandings(
  deps: { prisma: PrismaService; adminContext: Pick<AdminContextService, 'getActiveAdmin'> },
  user: V1AuthUser,
  tournamentId: string,
) {
  await deps.adminContext.getActiveAdmin(user.id);
  await requireTournament(deps.prisma, tournamentId);
  const { rows } = await loadGroupRankPreview(deps.prisma, tournamentId);
  return { slots: rows };
}

export type FillDeps = {
  prisma: PrismaService;
  adminContext: Pick<AdminContextService, 'getMutationAdmin' | 'logAdminAction'>;
  lock: (tx: Prisma.TransactionClient, competition: { id: string; kind: V1CompetitionKind }) => Promise<void>;
  /** 바뀔 자리를 먼저 모두 비운 뒤 넣는 배치 — PR-1b `assignSlotsBatchInTx`. */
  assignBatch: (
    tx: Prisma.TransactionClient,
    admin: V1ActiveAdmin,
    changes: readonly { slotId: string; registrationId: string | null }[],
  ) => Promise<unknown>;
  transactionOptions: { timeout: number; maxWait: number };
};

export async function fillSlotsFromStandings(
  deps: FillDeps,
  user: V1AuthUser,
  tournamentId: string,
  overrides: readonly FillOverride[],
) {
  const admin = await deps.adminContext.getMutationAdmin(user.id);
  const tournament = await requireTournament(deps.prisma, tournamentId);
  return deps.prisma.$transaction(async (tx) => {
    await deps.lock(tx, { id: tournament.id, kind: tournament.kind ?? V1CompetitionKind.regular_tournament });
    // 잠금 안에서 다시 읽는다 — 미리보기를 본 뒤 결과가 바뀌었을 수 있다.
    const preview = await loadGroupRankPreview(tx, tournamentId);
    const plan = planFillFromStandings(preview, overrides);
    if (plan.writes.length > 0) {
      await deps.assignBatch(tx, admin, plan.writes.map((write) => ({ slotId: write.slotId, registrationId: write.to })));
    }
    await deps.adminContext.logAdminAction(
      admin,
      {
        action: 'tournament.slots.fill_from_standings',
        targetType: 'tournament',
        targetId: tournamentId,
        afterJson: {
          assignments: plan.assignments,
          skipped: plan.skipped,
          overridden: overrides.map((override) => override.slotId),
        },
      },
      tx,
    );
    return { assignments: plan.assignments, skipped: plan.skipped };
  }, deps.transactionOptions);
}
