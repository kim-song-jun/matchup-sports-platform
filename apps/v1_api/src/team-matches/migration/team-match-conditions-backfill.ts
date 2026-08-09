import type { PrismaClient } from '@prisma/client';

/**
 * Expand/contract backfill for the match-conditions structuring feature.
 *
 * apps/v1_api/prisma/migrations/20260809000100_v1_team_match_structured_conditions
 * only adds three nullable/default-[] columns (match_format/match_style/
 * uniform_color) — no DML. Migrating pre-existing `format_note` free text into
 * those columns happens here instead, following the
 * competition-config-backfill.ts / fixture-game-backfill.ts precedent
 * (scripts/qa/check-expand-contract-migrations.mjs never treats DML as
 * additive, so any data migration must live in an app-level CLI, not
 * migration.sql).
 *
 * `grade` (실력등급) is deliberately NOT part of this backfill — it never
 * lived in formatNote as the source of truth; minSportLevelId/maxSportLevelId
 * are independently authoritative (resolveSportLevelRange() has populated
 * them on every create/update all along). Only format/style/uniform — the
 * three fields create-client.tsx used to concatenate into formatNote via
 * `[grade, format, style, uniform].join(' · ')` — are migrated, and grade's
 * position (index 0) is discarded on read.
 *
 * Idempotent and safe to re-run: only rows whose three new columns are still
 * completely empty (matchFormat null, matchStyle `{}`, uniformColor null) are
 * candidates, and once a row is updated it drops out of that set.
 */
export type TeamMatchConditionsBackfillCounts = {
  /** Legacy rows found with formatNote set and no structured value yet. */
  candidates: number;
  /** Rows actually written (parsed to at least one non-empty structured field). */
  updated: number;
};

export async function backfillTeamMatchConditions(
  prisma: PrismaClient,
): Promise<TeamMatchConditionsBackfillCounts> {
  const candidates = await prisma.v1TeamMatch.findMany({
    where: {
      formatNote: { not: null },
      matchFormat: null,
      uniformColor: null,
      matchStyle: { equals: [] },
    },
    select: { id: true, formatNote: true },
  });

  let updated = 0;
  for (const row of candidates) {
    // create-client.tsx's parseNotes() reads the same [grade, format, style, uniform]
    // ' · '-joined convention (buildTeamMatchMutationPayload) — index 0 (grade) is
    // discarded here on purpose, see the module doc comment above.
    const parts = (row.formatNote ?? '').split(' · ').map((part) => part.trim());
    const matchFormat = parts[1] ? parts[1] : null;
    const matchStyle = parts[2] ? [parts[2]] : [];
    const uniformColor = parts[3] ? parts[3] : null;
    if (!matchFormat && matchStyle.length === 0 && !uniformColor) continue;

    await prisma.v1TeamMatch.update({
      where: { id: row.id },
      data: { matchFormat, matchStyle, uniformColor },
    });
    updated += 1;
  }

  return { candidates: candidates.length, updated };
}
