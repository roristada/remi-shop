-- Run once in Supabase SQL Editor (idempotent).
-- Buckets are accessed via the service-role key on the server only,
-- so private buckets intentionally have NO storage.objects policies for anon/authenticated.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-previews', 'product-previews', true,  5242880, array['image/jpeg','image/png','image/webp']),
  ('digital-files',    'digital-files',    false, 5242880, null),
  ('payment-slips',    'payment-slips',    false, 5242880, array['image/jpeg','image/png','image/webp']),
  ('avatars',          'avatars',          false, 2097152, array['image/jpeg','image/png','image/webp']),
  ('license-artworks', 'license-artworks', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
