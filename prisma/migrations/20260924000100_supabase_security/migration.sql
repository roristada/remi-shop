-- Supabase-specific setup that Prisma schema cannot express:
-- auth.users link + triggers, CHECK constraints, partial unique indexes,
-- trigram search indexes, seeds, RLS, and Data API grants.
--
-- Access model: the app reads/writes ONLY through the server (Prisma as `postgres`,
-- which bypasses RLS). The Data API roles (anon/authenticated) get SELECT on a few
-- tables with strict RLS policies as defense-in-depth, and NO write access anywhere.

-- ─────────────────────────── Extensions ───────────────────────────
create extension if not exists pg_trgm with schema extensions;

-- ──────────────────── Link profiles → auth.users ──────────────────
alter table public.profiles
  add constraint profiles_id_fkey foreign key (id) references auth.users (id) on delete cascade;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email, updated_at = now() where id = new.id;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.handle_user_email_change() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- ─────────────────────────── Constraints ──────────────────────────
alter table public.products
  add constraint products_price_nonneg check (price >= 0),
  add constraint products_discount_range check (discount_percent is null or (discount_percent > 0 and discount_percent < 100)),
  add constraint products_sale_window check (sale_start_at is null or sale_end_at is null or sale_end_at > sale_start_at),
  add constraint products_discount_window check (discount_start_at is null or discount_end_at is null or discount_end_at > discount_start_at),
  add constraint products_download_limit_pos check (download_limit is null or download_limit > 0),
  add constraint products_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

alter table public.categories
  add constraint categories_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

alter table public.product_version_files
  add constraint product_version_files_size check (file_size > 0 and file_size <= 5242880);

alter table public.cart_items
  add constraint cart_items_quantity_one check (quantity = 1);

alter table public.order_items
  add constraint order_items_quantity_pos check (quantity >= 1),
  add constraint order_items_prices_nonneg check (unit_price >= 0 and discount >= 0 and final_price >= 0);

alter table public.orders
  add constraint orders_amounts_nonneg check (subtotal >= 0 and discount >= 0 and total >= 0),
  add constraint orders_total_consistent check (total = subtotal - discount);

alter table public.payments
  add constraint payments_amount_nonneg check (amount >= 0),
  add constraint payments_reject_reason check (status <> 'REJECTED' or length(trim(coalesce(reject_reason, ''))) > 0);

alter table public.payment_settings add constraint payment_settings_singleton check (id = 1);
alter table public.store_settings
  add constraint store_settings_singleton check (id = 1),
  add constraint store_settings_positive check (order_expiry_minutes > 0 and download_rate_limit_per_minute > 0);

-- ───────────────────── Partial unique indexes ─────────────────────
create unique index product_images_one_primary on public.product_images (product_id) where is_primary;
create unique index product_versions_one_latest on public.product_versions (product_id) where is_latest;
-- A new slip may be uploaded only after the previous one was rejected.
create unique index payments_one_open_per_order on public.payments (order_id) where status <> 'REJECTED';

-- ───────────────────────── Search indexes ─────────────────────────
create index products_name_th_trgm on public.products using gin (name_th extensions.gin_trgm_ops);
create index products_name_en_trgm on public.products using gin (name_en extensions.gin_trgm_ops);
create index products_software_trgm on public.products using gin (software extensions.gin_trgm_ops);
create index products_file_format_trgm on public.products using gin (file_format extensions.gin_trgm_ops);

-- ────────────────────────────── Seeds ─────────────────────────────
insert into public.payment_settings (id) values (1) on conflict do nothing;
insert into public.store_settings (id) values (1) on conflict do nothing;

insert into public.categories (id, slug, name_th, name_en, sort_order) values
  (gen_random_uuid(), 'brushes',   'แปรง',        'Brushes',   1),
  (gen_random_uuid(), 'textures',  'เท็กซ์เจอร์',  'Textures',  2),
  (gen_random_uuid(), 'patterns',  'แพทเทิร์น',    'Patterns',  3),
  (gen_random_uuid(), 'presets',   'พรีเซ็ต',      'Presets',   4),
  (gen_random_uuid(), 'fonts',     'ฟอนต์',       'Fonts',     5),
  (gen_random_uuid(), 'templates', 'เทมเพลต',     'Templates', 6),
  (gen_random_uuid(), 'assets',    'แอสเซ็ต',      'Assets',    7),
  (gen_random_uuid(), 'others',    'อื่น ๆ',        'Others',    8)
on conflict (slug) do nothing;

-- ──────────────────────── Data API privileges ─────────────────────
-- Supabase grants anon/authenticated full DML on new public tables by default. Undo that.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;

-- ─────────────────────────────── RLS ──────────────────────────────
alter table public.profiles              enable row level security;
alter table public.categories            enable row level security;
alter table public.products              enable row level security;
alter table public.product_images        enable row level security;
alter table public.product_versions      enable row level security;
alter table public.product_version_files enable row level security;
alter table public.wishlists             enable row level security;
alter table public.carts                 enable row level security;
alter table public.cart_items            enable row level security;
alter table public.orders                enable row level security;
alter table public.order_items           enable row level security;
alter table public.payments              enable row level security;
alter table public.downloads             enable row level security;
alter table public.announcements         enable row level security;
alter table public.payment_settings      enable row level security;
alter table public.store_settings        enable row level security;
alter table public._prisma_migrations    enable row level security;

-- Public catalog (read-only, published content only)
grant select on public.categories, public.products, public.product_images,
                public.product_versions, public.announcements, public.store_settings
  to anon, authenticated;

create policy "categories: read active" on public.categories
  for select to anon, authenticated using (status = 'ACTIVE');

create policy "products: read published" on public.products
  for select to anon, authenticated using (publish_status = 'PUBLISHED');

create policy "product_images: read of published" on public.product_images
  for select to anon, authenticated using (
    exists (select 1 from public.products p where p.id = product_id and p.publish_status = 'PUBLISHED')
  );

create policy "product_versions: read of published" on public.product_versions
  for select to anon, authenticated using (
    exists (select 1 from public.products p where p.id = product_id and p.publish_status = 'PUBLISHED')
  );

create policy "announcements: read live" on public.announcements
  for select to anon, authenticated using (
    is_active and (start_at is null or start_at <= now()) and (end_at is null or end_at > now())
  );

create policy "store_settings: read" on public.store_settings
  for select to anon, authenticated using (true); -- non-sensitive public store info

-- Customer-owned data (read own rows only)
grant select on public.profiles, public.wishlists, public.carts, public.cart_items,
                public.orders, public.order_items, public.payments, public.downloads,
                public.payment_settings
  to authenticated;

create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create policy "wishlists: read own" on public.wishlists
  for select to authenticated using (user_id = (select auth.uid()));

create policy "carts: read own" on public.carts
  for select to authenticated using (user_id = (select auth.uid()));

create policy "cart_items: read own" on public.cart_items
  for select to authenticated using (
    exists (select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid()))
  );

create policy "orders: read own" on public.orders
  for select to authenticated using (user_id = (select auth.uid()));

create policy "order_items: read own" on public.order_items
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))
  );

create policy "payments: read own" on public.payments
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))
  );

create policy "downloads: read own" on public.downloads
  for select to authenticated using (user_id = (select auth.uid()));

create policy "payment_settings: read (signed-in)" on public.payment_settings
  for select to authenticated using (true); -- QR/PromptPay info shown at checkout

-- product_version_files, _prisma_migrations: no grants, no policies → server only.
-- No INSERT/UPDATE/DELETE grants or policies anywhere → all writes go through the server.
