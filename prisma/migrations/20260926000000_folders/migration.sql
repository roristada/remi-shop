-- CreateEnum
CREATE TYPE "FolderStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "folder_id" UUID,
ADD COLUMN     "folder_sort_order" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "folders" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "status" "FolderStatus" NOT NULL DEFAULT 'ACTIVE',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "folders_slug_key" ON "folders"("slug");

-- CreateIndex
CREATE INDEX "folders_status_sort_order_idx" ON "folders"("status", "sort_order");

-- CreateIndex
CREATE INDEX "products_folder_id_folder_sort_order_idx" ON "products"("folder_id", "folder_sort_order");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─────────────────────── Supabase security ───────────────────────
alter table public.folders
  add constraint folders_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

-- Defense-in-depth: the app reads through Prisma (server-only); anon/authenticated
-- may only see active folders, matching the categories policy.
alter table public.folders enable row level security;
grant select on public.folders to anon, authenticated;
create policy "folders: read active" on public.folders
  for select to anon, authenticated using (status = 'ACTIVE');
