import type { V1MyTeam, V1MyTeamsResponse } from '@/types/api';
import type { AdminLoadState } from './admin.types';

export function myTeamItems(value?: V1MyTeamsResponse): readonly V1MyTeam[] {
  if (!value) return [];
  if ('items' in value && Array.isArray(value.items)) return value.items;
  return Array.isArray(value) ? value : [];
}

export function queryState(isPending: boolean, isError: boolean): AdminLoadState {
  if (isError) return 'error';
  if (isPending) return 'loading';
  return 'ready';
}

export function firstErrorMessage(errors: readonly unknown[]) {
  const error = errors.find((item) => item instanceof Error);
  return error instanceof Error ? error.message : undefined;
}
