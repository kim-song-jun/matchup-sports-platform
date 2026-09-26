import { Prisma } from '@prisma/client';

// The database claim trigger uses this same key to protect older worker replicas.
export const TOURNAMENT_CUTOVER_SHARED_LOCK = Prisma.sql`
  SELECT pg_try_advisory_xact_lock_shared(168, 3001) AS acquired
`;
export const TOURNAMENT_CUTOVER_EXCLUSIVE_LOCK = Prisma.sql`
  SELECT pg_try_advisory_xact_lock(168, 3001) AS acquired
`;
