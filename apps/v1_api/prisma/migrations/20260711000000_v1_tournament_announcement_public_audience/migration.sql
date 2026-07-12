-- Add a public audience for tournament announcements visible to logged-out users.
ALTER TYPE "V1TournamentAnnouncementAudience" ADD VALUE IF NOT EXISTS 'public';
