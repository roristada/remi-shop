# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Customers are Thai digital artists split roughly evenly between hobbyists/students and working professionals/studios, buying brushes, textures, presets, patterns, fonts, templates and other digital-art assets for use in drawing/art software (Procreate, Clip Studio Paint, Photoshop, Illustrator, MediBang, Krita and similar). They browse and buy in Thai first; English is a secondary language. The seller is a single admin (no multi-vendor marketplace).

## Product Purpose

A single-seller digital storefront: browse and buy downloadable art assets, pay by scanning a QR code and uploading a bank transfer slip, and download files once the seller manually confirms the payment. Additionally, an artist (or someone commissioning one) can request a paid commercial-use license for a product — a right to use, not an extra file — reviewed and approved the same manual way.

## Positioning

No payment gateway, no automated fraud/payment processing: every purchase is confirmed by a human seller looking at an uploaded slip. This is deliberate (low transaction fees, direct trust with a known Thai audience) rather than a technical limitation, and it shapes the whole checkout/order/download flow: nothing is instant, and the UI must say so honestly at every step (e.g. "download after payment is confirmed," never "instant download"). It is explicitly a single boutique storefront, not a Shopee/Etsy-style dense marketplace with many competing sellers.

## Operating Context

Core flow: Home → Shop (by folder or full grid with filters) → Product detail → Add to cart → Login/Register → Checkout → QR payment page → upload slip → "waiting for review" → admin approves/rejects → download (or, for a commercial license: request on the product page → admin approves → same QR/slip flow on a dedicated order → license becomes active). A rejected slip shows a reason and lets the customer re-upload. Digital files are versioned (a product can have multiple versions/releases); buyers get lifetime access to all versions of what they bought. Products can have a discount window and a sale window, both server-computed, never client-trusted. Admin has a separate `/admin` area for products, folders, categories, payment review, license requests/usage types, settings and (later) a dashboard.

## Capabilities and Constraints

- Auth via Supabase (email/password); roles are `CUSTOMER` / `ADMIN`, checked server-side only.
- Every digital file ≤ 5 MB; payment slips and license artwork are images (JPG/PNG/WEBP) ≤ 5 MB.
- Digital files, payment slips and license artwork live in private Supabase Storage buckets; only short-lived signed URLs are ever exposed. Product preview images are the only public bucket.
- Pricing, discounts, sale windows, order totals and license prices are always recalculated server-side; the client only ever proposes a number the server verifies.
- i18n: `/th` (default) and `/en` routes via next-intl; product content has TH/EN name/description fields. No machine translation at render time.
- No reviews existed before this session; a first cut is being added now: star + text, buyer-of-record only (one COMPLETED order per product), one review per customer per product, shown immediately with admin able to hide it afterward. Until that ships, no rating number may be shown anywhere — no hardcoded "4.8 (86)"-style mockup numbers.
- No coupon engine, no multi-currency, no subscriptions/loyalty points, no automated payment gateway in V1 (see project CLAUDE.md §63 for the full out-of-scope list).
- Full engineering rules, phase plan and business rules live in `CLAUDE.md` at the repo root; treat it as binding project law alongside this file.

## Brand Commitments

- Name: **Remi Shop** (not "Aellly", which only ever existed in a reference mockup).
- Logo: an illustrated pastel cat wearing round glasses (`template/445 huabaiwuji (2).png`, transparent PNG supplied by the owner), used in the header and as the favicon set. It replaced the earlier bunny-face mark on 2026-10-01.
- Existing pink accent `#F5BFD4` (sakura-pink) stays; the logo's own pink (~`#EC3A92`) is a second, more saturated brand pink usable where legible pink is needed (verify contrast before using for text).
- Voice: soft, cute, premium-feeling, never a loud "sale!" marketplace voice; Thai-first phrasing throughout.

## Evidence on Hand

- `template/f8aefee9-…png`: a 9-screen reference mockup (home, shop, product, cart, checkout, orders, downloads, account, admin dashboard) in a soft pastel "shop" style with an anime-style illustrated hero. This is reference for layout/mood only — the illustration itself is not the user's asset and must never be cropped or reused as a real site asset (likely AI-generated, unlicensed for commercial reuse).
- Two logo JPGs as above — these ARE usable brand assets.
- No real hero photography/illustration has been supplied yet; no testimonials, press, or case studies exist. Do not fabricate any of these.
- The store currently has one real (test) product with real preview images already uploaded via the admin, usable as authentic "product carries the color" imagery in interim hero/banner work.

## Product Principles

1. Every screen must stay honest about the manual, human-reviewed payment flow — no "instant," no fabricated ratings/counts, no claims the backend can't back up.
2. The seller's single-boutique feel (not a crowded marketplace) is a deliberate positioning choice, not a missing feature — resist adding marketplace density (banner walls, seller badges, starbursts) even when a reference mockup suggests it.
3. Thai is the primary language everywhere; every typographic and layout decision is checked against Thai text (tone marks, line height, word length) before English.
4. Security-sensitive values (price, discount, role, ownership, file paths) are never trusted from the client, regardless of how the UI presents them.
5. Cute and premium can coexist: softness/roundness/pastel color carries the "cute," while restraint, whitespace and accessibility carry the "premium" — never stickers, clutter or loud discount stamps.

## Accessibility & Inclusion

No project-specific accessibility requirement beyond general WCAG practice (keyboard navigation, focus visibility, alt text, contrast, semantic HTML — see CLAUDE.md §47); 44px touch targets and AA contrast are already established as part of the visual identity, not an afterthought.
