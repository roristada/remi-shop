-- Automatic slip check (SlipOK). Additive only: existing payments keep NULLs (checked by hand).

-- CreateEnum
CREATE TYPE "SlipCheckResult" AS ENUM ('PASSED', 'AMOUNT_MISMATCH', 'RECEIVER_MISMATCH', 'DUPLICATE', 'BEFORE_ORDER', 'NOT_FOUND', 'UNREADABLE', 'UNAVAILABLE');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "auto_check_result" "SlipCheckResult",
ADD COLUMN     "auto_checked_at" TIMESTAMPTZ(6),
ADD COLUMN     "trans_ref" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "payments_trans_ref_key" ON "payments"("trans_ref");
