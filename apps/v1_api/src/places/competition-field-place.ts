import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { resolvePlaceSnapshot, type PlaceSnapshot } from './place-snapshot';

export function normalizedFieldName(name: string): string {
  return name.trim().toLowerCase();
}

/** Catalogue entries created before the venue extension are deliberately name-only. */
export function tournamentFieldPlace(field: { name: string; placeSnapshot?: Prisma.JsonValue | null }): PlaceSnapshot {
  const value = field.placeSnapshot;
  if (value == null) return { name: field.name.trim(), address: null, latitude: null, longitude: null, provider: null, providerPlaceId: null };
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException({ code: 'FIELD_PLACE_INVALID', message: '경기장 장소 정보를 확인해 주세요.' });
  }
  const place = resolvePlaceSnapshot({
    name: typeof value.name === 'string' ? value.name : field.name,
    address: typeof value.address === 'string' ? value.address : null,
    latitude: typeof value.latitude === 'number' ? value.latitude : null,
    longitude: typeof value.longitude === 'number' ? value.longitude : null,
    provider: typeof value.provider === 'string' ? value.provider : null,
    providerPlaceId: typeof value.providerPlaceId === 'string' ? value.providerPlaceId : null,
  });
  if (place === null) throw new BadRequestException({ code: 'FIELD_PLACE_INVALID', message: '경기장 이름을 확인해 주세요.' });
  if (place.latitude !== null && (!Number.isFinite(place.latitude) || Math.abs(place.latitude) > 90) ||
      place.longitude !== null && (!Number.isFinite(place.longitude) || Math.abs(place.longitude) > 180)) {
    throw new BadRequestException({ code: 'FIELD_PLACE_INVALID', message: '경기장 좌표를 확인해 주세요.' });
  }
  return { ...place, name: field.name.trim() };
}

/** All competition place inputs register/select one scoped field in the same transaction. */
export async function registerCompetitionPlace(
  tx: Pick<Prisma.TransactionClient, 'v1TournamentField' | '$executeRaw'>,
  tournamentId: string,
  place: PlaceSnapshot | null,
): Promise<string | null> {
  if (!place || ['', '장소 미정', '미정', 'tbd'].includes(normalizedFieldName(place.name))) return null;
  const name = place.name.trim();
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`competition-field-names:${tournamentId}`}, 0))`;
  const fields = await tx.v1TournamentField.findMany({ where: { tournamentId }, orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }] });
  const existing = fields.find((field) => normalizedFieldName(field.name) === normalizedFieldName(name));
  if (existing) {
    if (!existing.active) throw new BadRequestException({ code: 'FIELD_INACTIVE', message: '사용하지 않는 경기장 이름이에요. 다른 경기장을 선택해 주세요.' });
    // Preserve per-game historical pins, but never silently accept a conflicting new pin.
    if (existing.placeSnapshot != null) {
      const stored = tournamentFieldPlace(existing);
      const identity = (value: PlaceSnapshot) => JSON.stringify([value.address, value.latitude, value.longitude, value.provider, value.providerPlaceId]);
      if (identity(stored) !== identity(place)) throw new BadRequestException({ code: 'FIELD_PLACE_CONFLICT', message: '같은 이름의 경기장이 다른 장소로 등록되어 있어요. 등록된 경기장을 선택하거나 다른 이름으로 등록해 주세요.' });
    }
    return existing.id;
  }
  const field = await tx.v1TournamentField.create({ data: {
    tournamentId, name, scopeKey: `place-${createHash('md5').update(normalizedFieldName(name)).digest('hex')}`,
    sortOrder: fields.length, placeSnapshot: { ...place, name } as unknown as Prisma.InputJsonValue,
  } });
  return field.id;
}

/** Match writers lock Game before TeamMatch; catalogue mutations use the same order. */
export async function lockCompetitionFieldMatches(tx: Prisma.TransactionClient, tournamentId: string) {
  await tx.$queryRaw`SELECT g.id FROM v1_games g JOIN v1_team_matches tm ON tm.id = g.team_match_id
    WHERE tm.tournament_id = ${tournamentId} AND tm.deleted_at IS NULL ORDER BY g.id FOR UPDATE OF g`;
  await tx.$queryRaw`SELECT id FROM v1_team_matches WHERE tournament_id = ${tournamentId}
    AND deleted_at IS NULL ORDER BY id FOR UPDATE`;
}

/** Caller owns the match row lock and authorization; selection and place are committed together. */
export async function resolveCompetitionFieldPlace(
  tx: Pick<Prisma.TransactionClient, 'v1TournamentField' | '$queryRaw'>,
  tournamentId: string,
  fieldId: string,
  currentPlace: PlaceSnapshot | null,
  currentFieldId?: string | null,
): Promise<PlaceSnapshot> {
  await tx.$queryRaw`SELECT id FROM v1_tournament_fields WHERE id = ${fieldId} AND tournament_id = ${tournamentId} FOR SHARE`;
  const field = await tx.v1TournamentField.findFirst({ where: { id: fieldId, tournamentId } });
  if (!field) throw new NotFoundException({ code: 'FIELD_NOT_FOUND', message: '이 리그·대회의 경기장이 아니에요.' });
  if (field.active && currentFieldId === fieldId && currentPlace) return { ...currentPlace, name: field.name.trim() };
  return fieldPlaceForMatch(field, currentPlace);
}

export function fieldPlaceForMatch(
  field: { name: string; active: boolean; placeSnapshot?: Prisma.JsonValue | null },
  currentPlace: PlaceSnapshot | null,
): PlaceSnapshot {
  if (!field.active) throw new BadRequestException({ code: 'FIELD_INACTIVE', message: '사용하지 않는 경기장은 선택할 수 없어요.' });
  // Name-based import may have grouped several addresses. Preserve this match's actual pin.
  if (currentPlace && normalizedFieldName(currentPlace.name) === normalizedFieldName(field.name)) return { ...currentPlace, name: field.name.trim() };
  return tournamentFieldPlace(field);
}

export function assertFieldPlaceInput(fieldId: string | null | undefined, placeProvided: boolean): void {
  if (fieldId != null && placeProvided) throw new BadRequestException({
    code: 'FIELD_PLACE_INPUT_CONFLICT', message: '등록된 경기장 선택과 다른 장소 입력을 함께 보낼 수 없어요.',
  });
}
