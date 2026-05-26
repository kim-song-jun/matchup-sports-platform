ALTER TYPE "V1OnboardingStatus" ADD VALUE 'social_terms_required';
ALTER TYPE "V1OnboardingStatus" ADD VALUE 'social_profile_required';

ALTER TABLE "v1_users" ALTER COLUMN "email" DROP NOT NULL;
