-- Separate SlipOK "wait after transfer" (1010) and "bank temporarily down" (1009) from UNAVAILABLE,
-- so the admin sees why and can re-run the check. Additive only.

-- AlterEnum
ALTER TYPE "SlipCheckResult" ADD VALUE 'BANK_DELAY';
ALTER TYPE "SlipCheckResult" ADD VALUE 'BANK_DOWN';
