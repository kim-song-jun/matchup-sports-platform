import { BadRequestException } from '@nestjs/common';
import { findTournamentOnSurface, TOURNAMENT_KINDS } from '../tournament-surface-lookup';
import type { Prisma } from '@prisma/client';

/** Called under the competition lock so renaming/removing a final cannot race an award save. */
export async function assertNamedAwardScopes(tx: Prisma.TransactionClient, tournamentId: string, scopes: readonly string[]) {
  const tournament = await findTournamentOnSurface(tx, TOURNAMENT_KINDS, { where: { id: tournamentId }, select: { format: true, multiFinals: true } });
  if (tournament?.format !== 'league_knockouts') return;
  const config = tournament.multiFinals as { finals?: Array<{ name: string }> } | null;
  const allowed = new Set(['overall', ...(config?.finals?.map(f => f.name) ?? [])]);
  if (scopes.some(scope => !allowed.has(scope))) throw new BadRequestException({ code: 'AWARD_TRACK_UNSUPPORTED', message: '이 대회에 설정된 토너먼트의 시상 범위를 선택해 주세요.' });
}

/** Existing formats keep their three legacy scopes; named scopes belong to the new format only. */
export function assertLegacyAwardScopes(format: string | undefined, scopes: readonly string[]) {
  if (format !== 'league_knockouts' && scopes.some(scope => !['overall', 'upper', 'lower'].includes(scope))) {
    throw new BadRequestException({ code: 'AWARD_TRACK_UNSUPPORTED', message: '이 대회 진행 방식에서는 전체·상위·하위 시상 범위를 선택해 주세요.' });
  }
}
