-- Giveaways: registration + admin-drawn winners. Additive only.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'GIVEAWAY_WON';

-- CreateTable
CREATE TABLE "giveaways" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title_th" TEXT NOT NULL,
    "title_en" TEXT NOT NULL,
    "description_th" TEXT NOT NULL DEFAULT '',
    "description_en" TEXT NOT NULL DEFAULT '',
    "image_path" TEXT,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "drawn_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "giveaways_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "giveaway_prizes" (
    "id" UUID NOT NULL,
    "giveaway_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID,
    "winner_count" INTEGER NOT NULL DEFAULT 1,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "giveaway_prizes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "giveaway_entries" (
    "id" UUID NOT NULL,
    "giveaway_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disqualified_at" TIMESTAMPTZ(6),

    CONSTRAINT "giveaway_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "giveaway_winners" (
    "id" UUID NOT NULL,
    "giveaway_id" UUID NOT NULL,
    "prize_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "prize_value" DECIMAL(10,2) NOT NULL,
    "drawn_at" TIMESTAMPTZ(6) NOT NULL,
    "claim_deadline" TIMESTAMPTZ(6) NOT NULL,
    "claimed_at" TIMESTAMPTZ(6),
    "forfeited_at" TIMESTAMPTZ(6),
    "order_id" UUID,

    CONSTRAINT "giveaway_winners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "giveaways_slug_key" ON "giveaways"("slug");

-- CreateIndex
CREATE INDEX "giveaways_is_published_ends_at_idx" ON "giveaways"("is_published", "ends_at");

-- CreateIndex
CREATE INDEX "giveaway_prizes_giveaway_id_sort_order_idx" ON "giveaway_prizes"("giveaway_id", "sort_order");

-- CreateIndex
CREATE INDEX "giveaway_prizes_product_id_idx" ON "giveaway_prizes"("product_id");

-- CreateIndex
CREATE INDEX "giveaway_prizes_variant_id_idx" ON "giveaway_prizes"("variant_id");

-- CreateIndex
CREATE INDEX "giveaway_entries_user_id_idx" ON "giveaway_entries"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "giveaway_entries_giveaway_id_user_id_key" ON "giveaway_entries"("giveaway_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "giveaway_winners_entry_id_key" ON "giveaway_winners"("entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "giveaway_winners_order_id_key" ON "giveaway_winners"("order_id");

-- CreateIndex
CREATE INDEX "giveaway_winners_giveaway_id_drawn_at_idx" ON "giveaway_winners"("giveaway_id", "drawn_at");

-- CreateIndex
CREATE INDEX "giveaway_winners_prize_id_idx" ON "giveaway_winners"("prize_id");

-- AddForeignKey
ALTER TABLE "giveaway_prizes" ADD CONSTRAINT "giveaway_prizes_giveaway_id_fkey" FOREIGN KEY ("giveaway_id") REFERENCES "giveaways"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "giveaway_prizes" ADD CONSTRAINT "giveaway_prizes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "giveaway_prizes" ADD CONSTRAINT "giveaway_prizes_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "giveaway_entries" ADD CONSTRAINT "giveaway_entries_giveaway_id_fkey" FOREIGN KEY ("giveaway_id") REFERENCES "giveaways"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "giveaway_entries" ADD CONSTRAINT "giveaway_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "giveaway_winners" ADD CONSTRAINT "giveaway_winners_giveaway_id_fkey" FOREIGN KEY ("giveaway_id") REFERENCES "giveaways"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "giveaway_winners" ADD CONSTRAINT "giveaway_winners_prize_id_fkey" FOREIGN KEY ("prize_id") REFERENCES "giveaway_prizes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "giveaway_winners" ADD CONSTRAINT "giveaway_winners_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "giveaway_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "giveaway_winners" ADD CONSTRAINT "giveaway_winners_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- A prize goes to at least one winner.
ALTER TABLE "giveaway_prizes" ADD CONSTRAINT "giveaway_prizes_winner_count_check" CHECK ("winner_count" BETWEEN 1 AND 1000);
ALTER TABLE "giveaways" ADD CONSTRAINT "giveaways_window_check" CHECK ("ends_at" > "starts_at");

-- Server-only tables (Prisma via the service connection); no client policies.
ALTER TABLE "giveaways" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "giveaway_prizes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "giveaway_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "giveaway_winners" ENABLE ROW LEVEL SECURITY;
