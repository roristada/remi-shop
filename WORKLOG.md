# Work Log

Progress notes for the Remi Shop digital file store. Engineering rules live in `CLAUDE.md`;
setup and commands live in `README.md`. Newest entries first.

## Status (2026-09-24)

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Foundation (Next.js 16, Tailwind v4, shadcn/ui, next-intl TH/EN) | Done |
| 2 | Database + Supabase (Prisma schema, RLS, storage buckets) | Done |
| 3 | Authentication (register, login, verify, reset, account) | Done |
| 4 | Products (admin product/category management) | Done, tested in browser |
| 5 | Storefront (shop, category, product detail, SEO) | **Next** |
| 6–12 | Cart/checkout, payment review, downloads, account, admin, email, hardening | Not started |

## Confirmed decisions

Business rules agreed with the owner. Follow these over the defaults in `CLAUDE.md`.

- Supabase cloud project in Singapore; deploy Vercel functions to `sin1`.
- All data access goes through the server (Prisma + `requireAdmin` / `requireUser`).
  RLS is on for every table as a second layer; there are no client write grants.
- Buyers get **all versions** of a product, including future ones.
- A `PENDING_PAYMENT` order with no slip expires after 1 hour.
- Downloads are unlimited by default, with a rate limit against rapid repeat clicks.
- One order can have many payments: re-uploading after a rejection creates a new `Payment` row.
- Digital files: an extension allowlist of art formats plus a magic-byte check where the format has one.
- Files in versions that have buyers can still be added or deleted, behind a confirm that shows the buyer count.
- Uploads go browser → Supabase Storage using a signed upload token, then the server verifies
  the stored object. Vercel caps function request bodies at 4.5 MB, so files cannot pass through the server.

## Phase 4: Products (done)

**Business logic** (pure, unit-tested; `npm test`)
- `lib/products/status.ts`: derives DRAFT / SCHEDULED / ACTIVE / DISABLED / ENDED
  from publish state and the sale window.
- `lib/pricing/calculate.ts`: price in integer satang. A discount applies only when
  `discountStartAt <= now <= discountEndAt`.
- `lib/storage/file-types.ts`: allowlists, magic bytes; executables and HTML are rejected for every type.
- `lib/storage/paths.ts`: storage-safe file names; the extension is kept for Thai names.
- `lib/datetime.ts`: the form sends Bangkok wall-clock time, which is stored as UTC.

**Admin UI**
- `/admin/products`: search, category and status filters, pagination.
- `/admin/products/new` and `/admin/products/[id]`, with three tabs:
  - details: prices, discount and sale windows, compatibility, license, download limit, SEO
  - images: drag-and-drop ordering, primary image, alt text TH/EN
  - versions and files
- `/admin/categories`: create, edit, hide. A category can be deleted only when it has no products.
- Publishing requires a latest version with at least one file.
- A product can be hard-deleted only if it has never been ordered. Otherwise use "ปิดการขาย" (disable).
- On a published product, a new version does not become latest right away. Upload its files,
  then click "ตั้งเป็นล่าสุด" (set as latest).
- Inputs use shadcn Select, a Calendar-based date/time picker (Thai labels, Gregorian years)
  and `@dnd-kit` for sorting.
- `/th/admin/*` and `/en/admin/*` redirect to `/admin/*`, since the admin area is not localized.

**Browser QA (2026-09-24)**
Tested with temporary accounts, all removed afterwards. Areas covered: validation,
uploads (including malicious files), sorting, versions, derived status, categories,
a non-admin user getting 404, and a 375 px mobile layout.

Bugs found and fixed:
- Files with Thai names could not be uploaded.
- An uploaded object stayed in storage when confirmation was rejected.
- A published product could end up with a latest version that has no files.
- The year picker only allowed years up to 2026.
- Buddhist-era and Gregorian years were mixed on the same page.
- A 100% discount showed the wrong error message.
- The slug field was too narrow.
- React logged a controlled/uncontrolled Select warning.

## Known gaps / follow-ups

- Hard delete of a product that has orders, and the buyer-count warning, can only be tested
  once orders exist (Phase 6–7).
- Server actions have no automated tests yet; only the pure logic is unit-tested.
- An upload abandoned mid-way (for example, the tab was closed) leaves an orphaned object.
  It sits in a private bucket and is harmless, but no cleanup job exists yet.
- Category images are not supported; categories are text only.
- Dev tip: do not run `next build` while `next dev` is running. It left the dev server
  serving a stale page. Restart `npm run dev` if a page does not reflect code changes.

## Next: Phase 5, Storefront

- `/shop` with filters, search, sort and pagination
- `/category/[slug]`
- `/product/[slug]` with:
  - gallery
  - price, discount and a countdown (the countdown is UI only)
  - a "Sale Ended" state
  - compatibility details and version history
- Reusable components: `ProductCard`, `ProductPrice`, `DiscountBadge`, `CountdownTimer`, `ProductGallery`
- SEO: metadata, Open Graph, canonical URL, JSON-LD
- Show published products only. Status and price are always computed server-side.
