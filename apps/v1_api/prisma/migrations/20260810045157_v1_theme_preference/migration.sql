-- CreateEnum
CREATE TYPE "V1ThemePreference" AS ENUM ('light', 'dark', 'system');

-- AlterTable
ALTER TABLE "v1_users" ADD COLUMN     "theme_preference" "V1ThemePreference" NOT NULL DEFAULT 'light';
