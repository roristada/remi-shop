-- Defense-in-depth: the app reads through Prisma (server-only). Catalog-like tables are
-- readable when they only describe what is on sale, matching the license_usage_types policy.
alter table public.software_tags        enable row level security;
alter table public.product_software_tags enable row level security;

grant select on public.software_tags, public.product_software_tags to anon, authenticated;

create policy "software_tags: read active" on public.software_tags
  for select to anon, authenticated using (is_active);

create policy "product_software_tags: read of published" on public.product_software_tags
  for select to anon, authenticated using (
    exists (select 1 from public.products p where p.id = product_id and p.publish_status = 'PUBLISHED')
  );
