import { UnprocessableEntityException } from '@nestjs/common';
import type { NamedFinalDto } from './multi-finals.dto';

// Read-side seeding must not load the fixture planner and its GamesService graph.
export const invalidMultiFinal = (message: string): never => {
  throw new UnprocessableEntityException({ code: 'MULTI_FINAL_INVALID', message });
};

/** Explicit capacity lets creation precede rank rules; legacy definitions retain their size. */
export function namedFinalSize(final: NamedFinalDto): number {
  return final.capacity ?? (final.registrationIds == null ? final.rules.length : final.registrationIds.length);
}
