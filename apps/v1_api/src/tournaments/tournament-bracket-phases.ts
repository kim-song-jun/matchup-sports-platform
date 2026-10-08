/**
 * Phases a bracket match may take its sources from, keyed by target phase.
 * round16 and round12 are both the stage before quarter and are not used together in one tournament.
 * round16 is the first knockout phase, so it has no key. third_place takes the semi losers.
 */
export const BRACKET_SOURCE_PHASES: Readonly<Record<string, readonly string[]>> = {
  quarter: ['round16', 'round12'],
  semi: ['quarter'],
  final: ['semi'],
  third_place: ['semi'],
};

export function acceptsBracketSource(
  targetPhase: string | null | undefined,
  sourcePhase: string | null | undefined,
): boolean {
  if (!targetPhase || !sourcePhase) return false;
  return BRACKET_SOURCE_PHASES[targetPhase]?.includes(sourcePhase) ?? false;
}
