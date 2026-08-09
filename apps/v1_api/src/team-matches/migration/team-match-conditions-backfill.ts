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
 * `[grade, format, style, uniform].filter(Boolean).join(' · ')` — are
 * migrated.
 *
 * That old write used `filter(Boolean)`, so any of the four fields left blank
 * at creation time is simply missing from the joined string instead of
 * leaving an empty slot — every field after a blank one shifts left. A
 * partial segment count therefore cannot be trusted positionally (e.g.
 * 'B · 친선 · 파랑' could be [grade,format,uniform] or [grade,style,uniform]
 * with no way to tell which). Only when all 4 segments are present (proving
 * nothing was blank) is the row mapped positionally to
 * [grade, format, style, uniform] (grade at index 0 still discarded, per the
 * previous paragraph). Every other row keeps its full, unlabeled segment list
 * in matchStyle rather than guessing a value into matchFormat/uniformColor
 * under the wrong heading.
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
    // create-client.tsx's old buildTeamMatchMutationPayload wrote
    // [draft.grade, draft.format, draft.style, draft.uniform].filter(Boolean).join(' · ')
    // — any of the four fields could be left blank, and filter(Boolean) drops it instead
    // of keeping an empty slot, so every field after a blank one shifts left by one. A
    // partial segment count therefore can't be trusted positionally: 'B · 친선 · 파랑'
    // could be [grade,format,uniform] (style left blank) just as easily as
    // [grade,style,uniform] (format left blank) — there is no way to tell which from the
    // count alone. Only the full 4-segment case proves nothing was blank, so only that
    // case is mapped to [grade, format, style, uniform] (index 0/grade still discarded,
    // see the module doc comment above). Anything else is kept — unlabeled, nothing
    // silently dropped — under matchStyle instead of being guessed into matchFormat or
    // uniformColor under the wrong heading.
    const parts = (row.formatNote ?? '').split(' · ').map((part) => part.trim()).filter(Boolean);
    let matchFormat: string | null;
    let matchStyle: string[];
    let uniformColor: string | null;
    if (parts.length === 4) {
      matchFormat = parts[1] || null;
      matchStyle = parts[2] ? [parts[2]] : [];
      uniformColor = parts[3] || null;
    } else {
      matchFormat = null;
      matchStyle = parts;
      uniformColor = null;
    }
    if (!matchFormat && matchStyle.length === 0 && !uniformColor) continue;

    await prisma.v1TeamMatch.update({
      where: { id: row.id },
      data: { matchFormat, matchStyle, uniformColor },
    });
    updated += 1;
  }

  return { candidates: candidates.length, updated };
}
