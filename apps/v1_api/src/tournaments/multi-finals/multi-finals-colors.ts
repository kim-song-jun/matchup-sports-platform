import { createHash, randomUUID } from 'node:crypto';
import { invalidMultiFinal } from './multi-finals-plan';
import type { NamedFinalDto } from './multi-finals.dto';

export type ColoredFinal = NamedFinalDto & { id: string; colorIndex: number };
export type FinalColorConfig = { finals: NamedFinalDto[]; nextColorIndex?: number };

/** Existing JSON needs no migration: materialize its original order before editing. */
export function normalizeFinalColors(config: FinalColorConfig): { finals: ColoredFinal[]; nextColorIndex: number } {
  const finals = config.finals.map((final, index) => {
    const stored = final as NamedFinalDto & { colorIndex?: number };
    const digest = createHash('sha256').update(final.name).digest('hex');
    const legacyId = digest.slice(0,8)+'-'+digest.slice(8,12)+'-4'+digest.slice(13,16)+'-a'+digest.slice(17,20)+'-'+digest.slice(20,32);
    return { ...final, id: final.id ?? legacyId,
      colorIndex: Number.isInteger(stored.colorIndex) && stored.colorIndex! >= 0 ? stored.colorIndex! : index };
  });
  return { finals, nextColorIndex: Math.max(config.nextColorIndex ?? 0, ...finals.map(f => f.colorIndex + 1), 0) };
}

/** Clients carry identity, never choose colors. Deleted colors are not renumbered/reused. */
export function reconcileFinalColors(previous: FinalColorConfig | null, incoming: readonly NamedFinalDto[]) {
  const old = normalizeFinalColors(previous ?? { finals: [] });
  // Name matching (clients without ids) must skip entries an incoming id already owns, or a renamed
  // final's old name would resolve a new final to the same identity.
  const claimed = new Set(incoming.flatMap(final => final.id ? [final.id] : []));
  const matches = incoming.map(final => {
    if (final.id) return old.finals.find(f => f.id === final.id);
    const match = old.finals.find(f => !claimed.has(f.id) && f.name === final.name.trim());
    if (match) claimed.add(match.id);
    return match;
  });
  let nextColorIndex = old.nextColorIndex;
  const seen = new Set<string>();
  const usedColors = new Set(matches.flatMap(match => match ? [match.colorIndex % 10] : []));
  const finals = incoming.map((final, index) => {
    const match = matches[index];
    if (final.id && !match) invalidMultiFinal('토너먼트 식별자가 오래됐어요. 다시 불러와 주세요.');
    const id = match?.id ?? randomUUID();
    if (seen.has(id)) invalidMultiFinal('동일한 토너먼트를 중복해서 저장할 수 없어요.');
    seen.add(id);
    if (!match && usedColors.size < 10) while (usedColors.has(nextColorIndex % 10)) nextColorIndex++;
    const colorIndex = match?.colorIndex ?? nextColorIndex++;
    usedColors.add(colorIndex % 10);
    return { ...final, id, colorIndex };
  });
  return { finals, nextColorIndex };
}
