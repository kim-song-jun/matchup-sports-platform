import type { V1TeamMatchMutationPayload, V1TeamMatchPeriodInput } from '@/types/api';
import isISO8601 from 'validator/lib/isISO8601';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPeriods(value: unknown): value is readonly V1TeamMatchPeriodInput[] {
  return Array.isArray(value) && value.length >= 1 && value.length <= 2
    && value.every((period: unknown) => isRecord(period)
      && Object.keys(period).every(key => key === 'durationMinutes')
      && typeof period.durationMinutes === 'number'
      && Number.isInteger(period.durationMinutes) && period.durationMinutes > 0);
}

const requiredStrings = ['hostTeamId', 'sportId', 'regionId', 'title', 'startsAt', 'manualPlaceName'];
const nullableStrings = [
  'description', 'imageUrl', 'listImageUrl', 'endsAt', 'deadlineAt', 'addressText',
  'costNote', 'rulesText', 'minLevelCode', 'maxLevelCode', 'genderRule',
  'matchFormat', 'uniformColor', 'placeProviderId',
];
const allowedKeys = new Set([
  ...requiredStrings, ...nullableStrings, 'placeLatitude', 'placeLongitude',
  'placeProvider', 'matchStyle', 'periods', 'version',
]);

/** Preserve the full allowed form body; UI-only draft metadata must not pass the DTO boundary. */
export function isTeamMatchRulesPayload(
  value: unknown,
): value is V1TeamMatchMutationPayload & { version?: string } {
  if (!isRecord(value) || !Object.keys(value).every(key => allowedKeys.has(key))) return false;
  if (!requiredStrings.every(key => typeof value[key] === 'string')) return false;
  if (typeof value.startsAt !== 'string' || !isISO8601(value.startsAt)) return false;
  if (!['endsAt', 'deadlineAt'].every(key => value[key] == null
    || (typeof value[key] === 'string' && isISO8601(value[key])))) return false;
  if (value.regionId === '') return false;
  if (!nullableStrings.every(key => value[key] == null || typeof value[key] === 'string')) return false;
  if (!['placeLatitude', 'placeLongitude'].every(key => value[key] == null
    || (typeof value[key] === 'number' && Number.isFinite(value[key])))) return false;
  if (value.placeProvider != null && value.placeProvider !== 'kakao') return false;
  if (value.matchStyle !== undefined && (!Array.isArray(value.matchStyle)
    || !value.matchStyle.every((item: unknown) => typeof item === 'string'))) return false;
  if (value.version !== undefined && typeof value.version !== 'string') return false;
  return value.periods === undefined || isPeriods(value.periods);
}
