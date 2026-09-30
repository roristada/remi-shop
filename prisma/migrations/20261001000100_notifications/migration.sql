-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('PRODUCT_UPDATED', 'PAYMENT_APPROVED', 'PAYMENT_REJECTED', 'LICENSE_APPROVED', 'LICENSE_REJECTED', 'ADMIN_SLIP_SUBMITTED', 'ADMIN_LICENSE_REQUESTED');

-- AlterTable
ALTER TABLE "product_versions" ADD COLUMN     "notified_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Unread badge count: only unread rows are indexed.
CREATE INDEX "notifications_user_id_unread_idx" ON "notifications"("user_id") WHERE "read_at" IS NULL;

-- Defense in depth: the app reads and writes through Prisma (server-only). Through the Data API a
-- signed-in user may only read their own notifications; nobody writes.
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON "notifications" TO authenticated;

CREATE POLICY "notifications: read own" ON "notifications"
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
