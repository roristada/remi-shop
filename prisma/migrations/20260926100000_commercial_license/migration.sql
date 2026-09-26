-- CreateEnum
CREATE TYPE "OrderKind" AS ENUM ('PRODUCT', 'LICENSE');

-- CreateEnum
CREATE TYPE "LicenseRequestStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "kind" "OrderKind" NOT NULL DEFAULT 'PRODUCT';

-- AlterTable
ALTER TABLE "store_settings" ADD COLUMN     "license_payment_days" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "license_usage_types" (
    "id" UUID NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "description_th" TEXT,
    "description_en" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "license_usage_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_license_prices" (
    "product_id" UUID NOT NULL,
    "usage_type_id" UUID NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "product_license_prices_pkey" PRIMARY KEY ("product_id","usage_type_id")
);

-- CreateTable
CREATE TABLE "license_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "product_name_th_snapshot" TEXT NOT NULL,
    "product_name_en_snapshot" TEXT NOT NULL,
    "buyer_name" TEXT NOT NULL,
    "buyer_email" TEXT NOT NULL,
    "buyer_contact" TEXT NOT NULL,
    "artist_name" TEXT NOT NULL,
    "artist_contact" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "note" TEXT,
    "artwork_path" TEXT NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "status" "LicenseRequestStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reject_reason" TEXT,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "order_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "license_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "license_request_items" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "usage_type_id" UUID NOT NULL,
    "name_th_snapshot" TEXT NOT NULL,
    "name_en_snapshot" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "license_request_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "license_usage_types_is_active_sort_order_idx" ON "license_usage_types"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "product_license_prices_usage_type_id_idx" ON "product_license_prices"("usage_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "license_requests_order_id_key" ON "license_requests"("order_id");

-- CreateIndex
CREATE INDEX "license_requests_user_id_created_at_idx" ON "license_requests"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "license_requests_status_created_at_idx" ON "license_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "license_requests_product_id_idx" ON "license_requests"("product_id");

-- CreateIndex
CREATE INDEX "license_request_items_usage_type_id_idx" ON "license_request_items"("usage_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "license_request_items_request_id_usage_type_id_key" ON "license_request_items"("request_id", "usage_type_id");

-- AddForeignKey
ALTER TABLE "product_license_prices" ADD CONSTRAINT "product_license_prices_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_license_prices" ADD CONSTRAINT "product_license_prices_usage_type_id_fkey" FOREIGN KEY ("usage_type_id") REFERENCES "license_usage_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_requests" ADD CONSTRAINT "license_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_requests" ADD CONSTRAINT "license_requests_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_requests" ADD CONSTRAINT "license_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_requests" ADD CONSTRAINT "license_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_request_items" ADD CONSTRAINT "license_request_items_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "license_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_request_items" ADD CONSTRAINT "license_request_items_usage_type_id_fkey" FOREIGN KEY ("usage_type_id") REFERENCES "license_usage_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─────────────────────── Supabase security ───────────────────────
alter table public.store_settings
  add constraint store_settings_license_days check (license_payment_days between 1 and 30);

alter table public.product_license_prices
  add constraint product_license_prices_positive check (price > 0);

alter table public.license_request_items
  add constraint license_request_items_price_positive check (price > 0);

alter table public.license_requests
  add constraint license_requests_total_positive check (total > 0),
  add constraint license_requests_reject_reason check (status <> 'REJECTED' or length(trim(coalesce(reject_reason, ''))) > 0),
  add constraint license_requests_order_on_approve check (status <> 'APPROVED' or order_id is not null);

-- Defense-in-depth: the app reads through Prisma (server-only). Catalog-like tables are
-- readable when they only describe what is on sale; requests are readable by their owner.
alter table public.license_usage_types    enable row level security;
alter table public.product_license_prices enable row level security;
alter table public.license_requests       enable row level security;
alter table public.license_request_items  enable row level security;

grant select on public.license_usage_types, public.product_license_prices to anon, authenticated;
grant select on public.license_requests, public.license_request_items to authenticated;

create policy "license_usage_types: read active" on public.license_usage_types
  for select to anon, authenticated using (is_active);

create policy "product_license_prices: read of published" on public.product_license_prices
  for select to anon, authenticated using (
    exists (select 1 from public.products p where p.id = product_id and p.publish_status = 'PUBLISHED')
  );

create policy "license_requests: read own" on public.license_requests
  for select to authenticated using (user_id = (select auth.uid()));

create policy "license_request_items: read own" on public.license_request_items
  for select to authenticated using (
    exists (select 1 from public.license_requests r where r.id = request_id and r.user_id = (select auth.uid()))
  );

-- Private bucket for the finished artwork attached to a request (server-side access only).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('license-artworks', 'license-artworks', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
