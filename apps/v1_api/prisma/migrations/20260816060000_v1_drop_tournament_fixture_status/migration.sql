-- Contract phase: drop v1_tournament_fixtures.status.
--
-- The column was a denormalized cache of "this fixture has an official result".
-- Only two of its four enum values were ever written -- `scheduled` at bracket
-- creation and `completed` inside the same transaction that swaps the official
-- result pointer. `in_progress` and `cancelled` were never written by any code
-- path, and a restored copy of both production and alpha confirms it: across
-- 205 fixture rows, `status = 'completed'` and
-- `v1_games.current_official_revision_id IS NOT NULL` agreed in both
-- directions with zero exceptions, and there were zero fixtures without a game
-- (the only shape where the column could hold information the game does not).
--
-- EXPAND/CONTRACT ORDERING (must not be violated): every read and write of this
-- column was removed in the PRECEDING release. Production runs
-- `prisma migrate deploy` BEFORE replacing the app containers, so the previous
-- app version is briefly live against this schema -- shipping the code removal
-- and this DROP together would make that old version fail on every fixture
-- query. This migration is therefore only safe once the deployed release no
-- longer references the column.
ALTER TABLE "v1_tournament_fixtures" DROP COLUMN "status";

DROP TYPE "V1TournamentFixtureStatus";
