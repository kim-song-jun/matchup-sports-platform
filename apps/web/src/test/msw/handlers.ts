// Barrel — re-exports all domain handler arrays as a single flat handlers array.
// server.ts imports `handlers` from here; do not remove this export.

import { authHandlers } from './handlers/auth';
import { usersHandlers } from './handlers/users';
import { matchesHandlers } from './handlers/matches';
import { teamMatchesHandlers } from './handlers/team-matches';
import { teamsHandlers } from './handlers/teams';
import { mercenaryHandlers } from './handlers/mercenary';
import { marketplaceHandlers } from './handlers/marketplace';
import { lessonsHandlers } from './handlers/lessons';
import { paymentsHandlers } from './handlers/payments';
import { chatHandlers } from './handlers/chat';
import { venuesHandlers } from './handlers/venues';
import { reviewsHandlers } from './handlers/reviews';
import { notificationsHandlers } from './handlers/notifications';
import { adminHandlers } from './handlers/admin';
import { miscHandlers } from './handlers/misc';

export const handlers = [
  ...authHandlers,
  ...usersHandlers,
  ...matchesHandlers,
  ...teamMatchesHandlers,
  ...teamsHandlers,
  ...mercenaryHandlers,
  ...marketplaceHandlers,
  ...lessonsHandlers,
  ...paymentsHandlers,
  ...chatHandlers,
  ...venuesHandlers,
  ...reviewsHandlers,
  ...notificationsHandlers,
  ...adminHandlers,
  ...miscHandlers,
];
