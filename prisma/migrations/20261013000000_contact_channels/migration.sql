-- Store contact channels (footer + /contact), managed by the admin. Additive only.

-- CreateEnum
CREATE TYPE "ContactChannelType" AS ENUM ('LINE', 'FACEBOOK', 'INSTAGRAM', 'X', 'TIKTOK', 'YOUTUBE', 'DISCORD', 'EMAIL', 'PHONE', 'WEBSITE');

-- CreateTable
CREATE TABLE "contact_channels" (
    "id" UUID NOT NULL,
    "type" "ContactChannelType" NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_channels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_channels_sort_order_idx" ON "contact_channels"("sort_order");

-- Server-only table (Prisma via the service connection); no client policies.
ALTER TABLE "contact_channels" ENABLE ROW LEVEL SECURITY;
