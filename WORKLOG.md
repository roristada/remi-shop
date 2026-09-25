# Work Log

Progress notes for the Remi Shop digital file store. Engineering rules live in `CLAUDE.md`;
setup and commands live in `README.md`. Newest entries first.

## Status (2026-09-26)

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Foundation (Next.js 16, Tailwind v4, shadcn/ui, next-intl TH/EN) | Done |
| 2 | Database + Supabase (Prisma schema, RLS, storage buckets) | Done |
| 3 | Authentication (register, login, verify, reset, account) | Done |
| 4 | Products (admin product/category management) | Done, tested in browser |
| 5 | Storefront (shop, category, product detail, SEO) | Done, tested in browser |
| 6 | Cart + checkout (personal purchases) | Done, tested in browser |
| 7 | Payment review (slip upload, approve/reject, payment settings) | Done, tested in browser |
| 7b | Commercial license requests | **Next**, rules confirmed below |
| 8–12 | Downloads, account, admin, email, hardening | Not started |

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
- The cart requires login. Personal purchases are once per product; new orders can be created any time.
- Commercial license: an option on a product, buyable many times, rights only (no extra files, no prior
  personal purchase needed). The request form collects buyer contact, artist contact, platform, usage types
  and the finished artwork image. Usage types are an admin-managed global list; each product sets its own
  price per type (or turns it off). One request can pick several types; the price is their sum.
  Flow: submit form → admin approves → customer is notified and shown payment details (3-day window,
  configurable) → slip → admin verifies. It does not use the cart. After payment the account shows the status,
  order number, product, usage types, buyer/artist and approval date, and an email is sent. There is no license number.
  Still open: does the product discount apply to license prices?
- Uploads go browser → Supabase Storage using a signed upload token, then the server verifies
  the stored object. Vercel caps function request bodies at 4.5 MB, so files cannot pass through the server.

## Phase 7: Payment Review (done)

**Customer** (`/[locale]/orders/[orderNumber]`)
- An unpaid order shows PromptPay details and a slip form: choose → preview → send (JPG/PNG/WEBP ≤ 5 MB).
- Upload: the server issues a one-time token for a server-generated key in the private `payment-slips`
  bucket (`{yyyy}/{mm}/{orderId}/{uuid}.{ext}`). The browser uploads, then the server checks the key belongs
  to the caller's own order and verifies the real size and magic bytes. Invalid objects are deleted.
- The slip is attached in one transaction (conditional order update + `Payment` row). The order moves to
  `WAITING_REVIEW`. A second open payment is blocked by the partial unique index.
- A slip can be sent before the unpaid deadline, or any time after a rejection (`lib/payments/rules.ts`).
  A rejected order shows the reason and accepts a new slip; the customer can also cancel it.
- Under review: the customer sees their own slip through a short-lived signed URL.

**Admin**
- `/admin/payments`: Pending (oldest first) / Approved / Rejected tabs. The slip and the order (customer,
  items, amounts, attempt count) are shown side by side.
- Approve → `Payment APPROVED` + `Order COMPLETED` (`paidAt`). Reject needs a reason (quick-pick
  suggestions) → `PAYMENT_REJECTED`. Both use conditional updates in one transaction, so a double click or
  two reviewers cannot decide twice.
- `/admin/settings`: PromptPay name/number (10/13/15 digits), TH/EN instructions and the QR image
  (public `product-previews/settings/promptpay-qr/…`; the old image is deleted on replace).

**QA (2026-09-26)**: temporary customer and admin, all data removed afterwards (orders, payments, slip
and QR objects, settings reset to empty). Covered: invalid PromptPay number, QR upload, HTML disguised as
`.png` rejected and deleted from storage, slip sent → under review, empty reject reason blocked, reject
with a reason → customer sees it → re-upload → approve with a double click (one approval, the second
reports "already reviewed") → order completed, product shows as owned, a customer gets 404 on `/admin/payments`.

## Phase 6: Cart + Checkout (done)

**Rules** (`lib/orders/rules.ts`, unit-tested)
- The cart requires login. Personal purchases are once per customer per product.
- A product is blocked from cart/checkout when the customer owns it (COMPLETED order) or it is in an
  open order (awaiting payment, under review, or payment rejected). Otherwise it could be paid for twice.
  New orders can always be created for other products.
- A `PENDING_PAYMENT` order with no slip is cancelled once `expiresAt` passes (`orderExpiryMinutes`,
  default 60). No scheduled job yet: `cancelExpiredOrders()` runs whenever the customer's orders are read or created.
- Order number: `RS` + Bangkok yymmdd + `-` + 6 Crockford base32 characters (`RS260926-7K3QX9`).

**Checkout** (`lib/orders/actions.ts`): one transaction with a per-customer advisory lock. It re-reads the
cart, re-validates and re-prices every line, and refuses when the total differs from the total the
customer saw (`PRICE_CHANGED`) or a line is no longer purchasable (`CART_CHANGED`). It creates `Order` +
`OrderItem` snapshots (names TH/EN, latest version, unit/discount/final price), then empties the cart.

**Pages**: `/[locale]/cart`, `/[locale]/orders` (paginated), `/[locale]/orders/[orderNumber]`
(items, totals, payment window countdown, PromptPay QR/name/number from `PaymentSetting`, cancel).
The product page buy button shows add / in cart / owned / in an open order. Another customer's order
number returns 404.

**QA (2026-09-26)**: temporary customer, all orders and the account removed afterwards.
Guest → login → back to the product; add; price raised mid-checkout → `PRICE_CHANGED`; order created
with correct snapshots and an empty cart; product blocked while the order is open; expiry → cancelled
and buyable again; cancel via dialog; triple-click checkout → one order; unknown/bad order numbers → 404.

## Phase 5: Storefront (done)

**Routes** (all dynamic: price, discount and sale state depend on the current time)
- `/[locale]` home: new arrivals grid (falls back to the placeholder when there are no products).
- `/[locale]/shop`: search (name TH/EN, software, file format), category, sort, on-sale filter, 12 per page.
  Plain GET form, works without JavaScript. `/[locale]/search?q=` redirects here.
- `/[locale]/category` and `/[locale]/category/[slug]`.
- `/[locale]/product/[slug]`: gallery, price/discount, countdown, sale state, file details,
  files of the latest version (name + size only), version history, related products.
- `app/sitemap.ts` and `app/robots.ts`.

**Listing rules** (`lib/products/storefront.ts`, unit-tested)
- Listed: `PUBLISHED`, category `ACTIVE`, sale not ended. Scheduled products are listed with a "coming soon" tag.
- Ended products drop out of listings, but their detail page stays up with "สิ้นสุดการขาย".
- A product in a hidden category 404s on the storefront.
- A version created after the current latest is hidden until the admin sets it as latest.

**Components** (`components/shop/`): `ProductCard`, `ProductGrid`, `ProductPrice`, `DiscountBadge`,
`ProductStatusTag`, `CountdownTimer`, `ProductGallery`, `PurchasePanel`, `FileList`, `VersionHistory`,
`ShopFilterForm`, `ShopPagination`. The admin pagination moved to `components/shared/pagination.tsx`
with translatable labels.
- The countdown corrects for browser clock skew with the server time and calls `router.refresh()`
  at zero so the server recalculates the price. It never decides the price.

**SEO**: per-page title/description, canonical + `hreflang`, Open Graph image (primary preview),
Product JSON-LD (`<` escaped), filtered/search pages `noindex, follow`.

**QA (2026-09-26)**: tested on the dev server with the `test` product, temporarily changed in the DB and
restored afterwards: 20% discount + countdown expiring live (the price reverted after refresh),
scheduled, ended, TH/EN, 375 px mobile, invalid query params, unknown slugs.

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

- No header cart count yet (it would add an auth lookup to every page).
- Emails (slip submitted / approved / rejected) come in Phase 11. The admin has no new-slip notification yet.
- `Payment.status` REVIEWING is unused; a slip is WAITING until the admin decides.
- Price sorting uses the base price; an active discount does not change the order.
- Unknown product/category slugs return a soft 404 (HTTP 200 + `noindex`), because `loading.tsx`
  starts streaming before the page can call `notFound()`. Removing the skeleton would give a real 404.
- `ogImagePath` exists in the schema but the admin UI has no field for it; OG uses the primary image.
- Hard delete of a product that has orders, and the buyer-count warning, can only be tested
  once orders exist (Phase 6–7).
- Server actions have no automated tests yet; only the pure logic is unit-tested.
- An upload abandoned mid-way (for example, the tab was closed) leaves an orphaned object.
  It sits in a private bucket and is harmless, but no cleanup job exists yet.
- Category images are not supported; categories are text only.
- Dev tip: do not run `next build` while `next dev` is running. It left the dev server
  serving a stale page. Restart `npm run dev` if a page does not reflect code changes.

## Next: Phase 7b, Commercial license requests

- Admin: usage type list; per-product license prices per type (on/off).
- Customer: request form on the product page (buyer contact, artist contact, platform, usage types,
  finished artwork image in a private bucket).
- Admin review → approve creates an order with a 3-day payment window → the same slip flow as Phase 7.
- Account page listing license requests and their status.
- Open question: does the product discount apply to license prices?
