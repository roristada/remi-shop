---
version: 1
slug: "app-locale-page-tsx"
primary_target: "app/[locale]/page.tsx"
related_targets: []
---

# Surface: Home (`app/[locale]/page.tsx`)

Mode: **Persuade** (a first-time visitor decides to browse/buy) blended with light **Operate** for returning customers (recommended products, folders).

Audience: Thai digital-art hobbyists and working artists/studios, browsing in Thai first. Job: quickly tell "is there something for my software/style here" and start browsing with trust that a human-run store is legit.

Untouched: real product data only (no fake ratings/counts/testimonials), honest payment-flow copy ("download after payment confirmed," never "instant"), existing routes/queries, i18n structure, a11y (44px targets, focus rings, semantic landmarks).

## Direction contract

**THESIS:** The home page proves "a real person curates and ships real Thai-artist assets" through an artwork-led hero and a genuine trust bar — never a marketplace wall of stamps and stars. Refuses the category default of stock-photo SaaS hero OR a Shopee-style banner wall.

**OWN-WORLD:** Existing Swatch Board tokens (sakura-pink accent, powder-sky surface, graphite text, Mitr/Anuphan, full-pill buttons, 25–31px radii) plus: the bunny-mark logo (hand-drawn SVG, `currentColor`), a new legible brand pink (`brand-pink`, ~`#EC3A92`, text/icon use only, contrast-checked), one Google Sans/serif-adjacent Thai-supporting script-style accent face used sparingly for a hand-written-feeling line near the hero (or omitted if no such face clears both the Thai-coverage and legibility bars — a plain italic Anuphan/Mitr accent is the fallback, not a placeholder failure).

**STORY:** Visitor lands, sees the store's own real product art (not stock/illustrated people) fanned or featured in the hero with a plain, honest headline + one primary CTA to `/shop`; a four-icon trust row states real capabilities (Thai support, private secure files, manual-verified payment, lifetime version updates); a recommended-products rail with category-tab filtering shows the catalog is alive; an announcement/banner slot (admin-managed, falling back to random product previews when empty) closes the page — never a fabricated "30% OFF" stamp with no real discount behind it.

**FIRST VIEWPORT:** Header (logo + search + nav) sits above a full-bleed pastel hero panel containing: eyebrow/script accent line, `<h1>` (Mitr display), one-line subhead, one pill CTA, and a real-image swatch-stack/feature visual to the right (desktop) or below (mobile) — built from actual product preview images, not an illustrated hero character. Trust bar sits immediately below, four items in a row (2×2 on mobile).

**FORM:** Extension of the established "Swatch Board" world (not a replacement) — no concept-seed roll run: direction was already agreed with the user across two prior sessions plus this one (mockup reference approved, deltas resolved: no image-gen available so no comp; user explicitly framed this as evolution not rebuild).

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
