---
name: Remi Shop
description: Thai-first store for digital-art files (brushes, textures, presets, fonts), styled as a soft swatch board with a cat-with-glasses mark and a real, honest storefront hero.
colors:
  sakura-pink: "#f5bfd4"
  cherry-ink: "#b0426b"
  logo-pink: "#ec3a92"
  powder-sky: "#def1f6"
  blush-mist: "#fcebf2"
  paper-white: "#fefeff"
  graphite: "#333333"
  pencil-gray: "#6b6b6b"
  fog: "#f6f6f8"
  hairline: "#ebebef"
  input-line: "#e3e3e8"
  error-red: "#c62828"
  success-green: "#2e7d32"
  warning-amber: "#a15c00"
typography:
  display:
    fontFamily: "Mitr, Anuphan, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2rem, 5vw, 3rem)"
    fontWeight: 500
    lineHeight: 1.2
  headline:
    fontFamily: "Mitr, Anuphan, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 500
    lineHeight: 1.3
  title:
    fontFamily: "Mitr, Anuphan, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 500
    lineHeight: 1.3
  body:
    fontFamily: "Anuphan, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Anuphan, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
  script-accent:
    fontFamily: "Charmonman, cursive"
    fontSize: "clamp(1.5rem, 3vw, 2rem)"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  sm: "8.4px"
  md: "11.2px"
  lg: "14px"
  xl: "19.6px"
  2xl: "25.2px"
  3xl: "30.8px"
  full: "9999px"
spacing:
  gutter: "16px"
  stack-sm: "12px"
  stack-md: "24px"
  section: "48px"
components:
  button-primary:
    backgroundColor: "{colors.sakura-pink}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.full}"
    height: "44px"
    padding: "0 20px"
  button-outline:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.full}"
    height: "44px"
  button-icon:
    backgroundColor: "transparent"
    textColor: "{colors.graphite}"
    rounded: "{rounded.full}"
    size: "44px"
  chip:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.full}"
    height: "44px"
    padding: "0 16px"
  chip-active:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.full}"
  input:
    backgroundColor: "{colors.paper-white}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.xl}"
    height: "40px"
  panel:
    backgroundColor: "{colors.powder-sky}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.3xl}"
    padding: "24px"
  product-tile:
    backgroundColor: "{colors.powder-sky}"
    rounded: "{rounded.2xl}"
  hero-panel:
    backgroundColor: "{colors.powder-sky}"
    rounded: "{rounded.3xl}"
    padding: "32px"
  link:
    textColor: "{colors.cherry-ink}"
---

# Design System: Remi Shop

## Overview

**Creative North Star: "The Swatch Board"**

Remi Shop reads like a clean board where an artist pins swatches of their brushes and palettes. The artwork is the loudest thing on every page; the interface is soft paper, quiet type and rounded tiles that hold the work without competing with it. The signature is the home hero's fanned swatch stack: preview tiles tilted like cards pinned to a board, one real preview on top. A small pastel cat in glasses — the shop's mark — sits in the header and the favicon; it is a brand touch, not a mascot that appears throughout the UI.

The mood is cute and gentle but still premium: pastel pink and powder blue on near-white paper, generous whitespace and friendly rounded Thai type. Cute comes from softness, roundness and small moments (a swatch fanning in, a check mark after copying, the cat mark), never from clutter, stickers or loud color. Thai is the primary language, so every decision is checked against Thai text first: tone marks, line height and word length.

The store is a boutique, single-seller shop, not a dense multi-vendor marketplace: no banner walls, no seller badges, no shouting discount stamps stacked on top of each other. It is allowed exactly one deliberate "hero" moment per page (the home hero panel, the sale/announcement slot) — a bounded, tasteful use of tinted background, not a habit. Not generic corporate SaaS, and not a dark or neon gamer look. Light is the default; the storefront also offers a quiet dark theme (owner request, 2026-10-09): warm plum-graphite surfaces, never pure black or neon, with the same tokens re-tuned for AA (`.dark` in `app/globals.css`). Visitors pick light / dark / system from the header (phones: the menu sheet); the choice is kept in their browser. Admin stays light.

**Honesty is part of the identity, not a QA checklist.** Every number on the page must be real: no invented review counts or star averages, no discount badge without a real discount behind it, no "instant download" language (payment is always human-verified before download). A page that has to fake a number to look finished is not finished.

**Key Characteristics:**
- Artwork first: real product previews carry the color; UI surfaces stay pale.
- Sakura pink is a small-mark accent, powder blue is the surface, graphite is the voice; logo-pink is reserved for large display accents and large display accents.
- Everything rounded: pills for actions and chips, 25–31px corners for tiles and panels.
- Depth by tone (tinted panels on paper), with one soft shadow for lifted items.
- Thai-first type: Mitr for titles, Anuphan for reading, an occasional Charmonman script line for warmth; no negative tracking anywhere.
- 44px touch targets and AA contrast are part of the look, not an afterthought.
- Real numbers only: ratings, discounts and "sold" language always trace back to actual data.

## Colors

A pastel pair (pink accent, powder-blue surface) on cool paper, anchored by soft graphite text, plus one saturated brand pink reserved for the logo.

### Primary
- **Sakura Pink** (sakura-pink): the one brand *fill* accent. Fills primary buttons (add to cart, checkout, search), swatch placeholders and the hero panel's own small highlights. It is too light to carry text or icons on white (1.6:1), so it is only ever a fill with graphite text on it.
- **Cherry Ink** (cherry-ink): the readable pink. Links ("view all"), the active step in the order stepper, category labels on product pages, checkbox accents, filled star ratings and focus rings (at 80% opacity to stay ≥3:1). Use it whenever pink must be read at body/UI size.
- **Logo Pink** (logo-pink): the brand's more saturated pink (from the original logo) (measured contrast: 3.7:1 for white-on-logo-pink, 3.4:1 for logo-pink-on-white/fog — enough for a large mark or ≥24px display text, not enough for body text, buttons or small icons). Reserved for: the bunny mark itself, and the Charmonman script accent line when it needs a color instead of graphite. Never used for button labels, links, small icons or any AA-body-text role — cherry-ink keeps that job.

### Secondary
- **Powder Sky** (powder-sky): the working surface. Filter bar, purchase panel, payment panel, cart summary, footer, product image wells and the home hero panel, usually at 40–60% opacity over paper. It groups content without borders.
- **Blush Mist** (blush-mist): the faint pink wash for hover rows, the countdown chip and small highlights.

### Neutral
- **Paper White** (paper-white): card and panel background (panels at 80% over the page gradient). Slightly cool, never pure #fff.
- **Page gradient** (`.bg-page-gradient`, on the storefront `<main>`): paper white with a soft sakura-pink glow in the top-left corner and a powder-sky glow in the bottom-right corner of the screen (fixed to the viewport), chosen by the owner so pages are not flat white. Corners only: text never sits on saturated pink, and cards/panels stay paper-white.
- **Graphite** (graphite): all body and heading text, the active chip fill, step numbers. Soft instead of black.
- **Pencil Gray** (pencil-gray): secondary text (meta, counts, hints). Darkened from the brief's #777777 so it passes AA on paper *and* on powder-sky and fog surfaces.
- **Fog** (fog): muted fills (skeletons, neutral badges, image-less tiles, empty star outlines).
- **Hairline** (hairline) and **Input Line** (input-line): dividers, dashed empty states, input strokes.
- **Status**: error-red, success-green and warning-amber are used as text on a 10% tint of themselves, always with a text label.

### Named Rules
**The Accent Not Wallpaper Rule.** Sakura pink covers only the primary action and small marks. Outside the one hero panel a page is allowed, if a screen has more than one pink-filled area besides the primary button, one of them is wrong.

**The Readable Pink Rule.** Pink that carries meaning as text, icon or outline at UI/body size is cherry-ink, never sakura-pink or logo-pink.

**The Honest Number Rule.** A rating, a discount percentage, a countdown or a "N sold" claim is either computed from real data at render time, or it is not shown — never a placeholder number left in from a reference mockup.

## Typography

**Display Font:** Mitr (with Anuphan, system sans)
**Body Font:** Anuphan (with system sans)
**Script Accent:** Charmonman (Thai + Latin coverage; used sparingly)

**Character:** Mitr is a soft geometric Thai/Latin face with rounded terminals: friendly, a little cute, confident at size. Anuphan is a clean loopless Thai sans that stays legible at 12–14px. Charmonman is a genuine Thai calligraphic/cursive face (not a Latin-only script stretched over Thai) that adds a hand-written, personal warmth in one short line near the hero — never for anything a customer must scan quickly (labels, prices, buttons, body copy).

### Hierarchy
- **Display** (Mitr 500, 2rem → 3rem, 1.2–1.25): the home hero title only, `text-balance`.
- **Headline** (Mitr 500, 1.5rem → 1.875rem, 1.3): page h1s (shop, cart, order number).
- **Title** (Mitr 500, 1.125–1.5rem, 1.3): section h2s (folder sections, "new arrivals", panel titles).
- **Body** (Anuphan 400, 1rem, 1.5): descriptions and forms. Product-card names use Anuphan 600 at 0.95–1rem, 1.5 line height, clamped to 2 lines.
- **Label** (Anuphan 400, 0.75rem): meta rows, counts, hints, captions; tabular numerals for prices, sizes and counters.
- **Script Accent** (Charmonman 400, 1.5rem → 2rem, 1.4): one short line beside/under the home hero headline only (e.g. a small "made for artists" aside). Always at large size (≥24px) so its contrast clears AA-large; never the only carrier of information the heading doesn't already say.

### Named Rules
**The Tone Mark Rule.** Thai text never gets line height under 1.3 in headings or 1.5 in clamped body text, and never negative letter-spacing; stacked vowels and tone marks must not be clipped. This applies to Charmonman too, which needs *more* vertical room than Mitr for Thai tone marks, not less.

**The One Script Line Rule.** Charmonman appears at most once per page. It is an accent, not a heading font — never used for anything below display size.

## Layout

A single centered column (max 72rem on storefront, 64rem on order pages, 48rem on reading and account pages) with a 16px side gutter at every width. Product listings use a 2 → 3 → 4 column grid (12–16px gaps). Detail pages split into content plus a 24–26rem side panel from `lg` up, and stack in a single `minmax(0,1fr)` column below it so long file names can never widen the page.

Rhythm is tight inside groups (8–12px) and generous between sections (32–48px). Folder sections on /shop separate with a hairline and 32px of air rather than boxes. Horizontal chip rows scroll on phones instead of wrapping into a wall.

## Elevation & Depth

Depth comes from tone first: powder-sky or fog panels on paper, image wells with an inset 5% ring. Shadows are rare and soft, reserved for things that sit on top (header over content, dialogs, a lifted admin card, the active view toggle).

### Shadow Vocabulary
- **Soft lift** (`box-shadow: 0 1px 2px rgb(51 51 51 / 0.04), 0 8px 24px -12px rgb(51 51 51 / 0.12)`): cards and panels that must read as raised, badges over photos.
- **Small** (Tailwind `shadow-sm`): the selected segment of a segmented control.

### Named Rules
**The Tone Before Shadow Rule.** Reach for a tinted surface before a shadow. A shadow is allowed only when the element actually overlaps something.

## Shapes

Everything is rounded, from 14px base radius upward: pills for every button, chip and toggle; 20px for inputs; 25px for product tiles and image wells; 31px for panels, the hero panel and admin folder cards. Borders are hairlines (1px, hairline) or dashed for empty and drop zones. No sharp corners, no thick outlines, no colored side borders.

## Components

### Buttons
Soft, rounded and quietly confident.
- **Shape:** full pill (9999px).
- **Primary:** sakura-pink fill, graphite text, 40–44px tall with 20px side padding. Hover drops the fill to 80%; press nudges down 1px.
- **Outline / Ghost:** paper or transparent, hover to fog. Used for secondary actions and header icons.
- **Icon buttons:** 44px circle (`icon-xl`) in the header and for copy actions.
- **Focus:** 3px cherry-ink ring at 80%.

### Chips
- **Style:** pill, 44px tall, paper fill, hairline border, graphite text. Hover darkens the border.
- **State:** the active filter chip inverts to a graphite fill with paper text and `aria-current`.
- **Segmented toggle** ("by folder" / "all"): powder-sky track, active segment on paper with the small shadow.
- **Category tabs** (recommended-products rail): the same chip vocabulary, horizontally scrollable on phones, never wrapping into a grid.

### Cards / Containers
- **Product tile:** framed. One paper-white card (radius 1.5rem, `shadow-soft`, hairline ring, 8px inner padding) holds the square image well (rounded, powder-sky while loading) and, below it, category (supported software stays on the product page), name, then price with sold count and compact rating, so each product reads as one unit on the page gradient (owner request; the earlier frameless tile made neighbouring products blur together). The whole card is one stretched link; hover lifts the shadow slightly.
- **Panels** (purchase, payment, cart summary, filters, hero): powder-sky at about 45–60%, 31px radius, 24–32px padding, no border.
- **Never nest cards:** inside a panel, group rows with a paper `dl` and dividers, not another card.

### Inputs / Fields
- **Style:** 40px tall, 20px radius, paper fill (transparent border inside tinted bars), placeholder in pencil-gray.
- **Focus:** cherry-ink ring. Errors show red text under the field with `aria-invalid`.
- **Drop zone** (slip upload): dashed 2px hairline, 20px radius, icon plus label centered.
- **Header search:** a real, submittable field (not decoration) — 40px pill, paper-on-blur, submits to `/search?q=`.

### Navigation
- **Header:** sticky, translucent paper with blur, 64px tall, the cat mark plus the Mitr wordmark ("Remi Shop"), a search field, then icon controls. Text links on desktop, a left sheet menu on phones (including the language switch). Icon controls are 44px circles.
- **Footer:** powder-sky at 40%, small graphite headings, pencil-gray links.

### Swatch Stack (signature)
The home hero: real product-preview tiles fanned at small rotations on the hero panel, the front one an actual current product image (never an illustrated character or stock photo). They fan in once on load (600ms, `cubic-bezier(0.2, 0.8, 0.2, 1)`), with no animation under reduced motion.

### Trust Bar
Four short, true capabilities as icon + one line (e.g. real-time Thai support, private/secure files, human-verified payment, lifetime version updates) directly under the hero: 4-across on desktop, 2×2 on phones, plain graphite icons, no card shells.

### Rating (honest by construction)
- **Shape:** five small star glyphs, filled in cherry-ink up to the rounded average, the rest as a fog/hairline outline — never gold, keeping the mark on-brand instead of reaching for the generic marketplace star color.
- **Data:** the component always takes `{ average, count }`; `count === 0` renders an outline-only row plus "ยังไม่มีรีวิว" / "No reviews yet" in pencil-gray, never a hidden component and never a guessed number.
- **Placement:** the full five-star row sits in the product detail price block (with the empty state above).
- **Cards (compact):** on product cards the rating is one cherry-ink star, the average to one decimal and the review count in parentheses (`★ 4.8 (12)`), on the price line next to the real sold count (`ขายแล้ว 233`). With no reviews (or no sales) that part is simply left out on the card, since the product page carries the full empty state.

### Banner / Announcement Slot
One bounded slot on the home page (never more): an admin-authored `Announcement` when one is live, falling back to a plain rotation of real product preview images when none is. A discount percentage may only appear when a real, currently-active product discount backs it.

### Order Stepper & Payment Steps
Three columns ("pay → store checks slip → download") marked by a top rule: graphite for done, cherry-ink for current, hairline for upcoming, each with a number or check disc. The payment panel repeats the sequence as numbered graphite discs (scan QR, transfer the exact amount with copy buttons, attach slip), since the order carries real meaning.

## Logo

An illustrated pastel cat mark: white fur with pink inner ears, round glasses, a pink tie and a curled tail, supplied by the owner as a transparent PNG (`template/445 huabaiwuji (2).png`, replacing the earlier hand-drawn bunny SVG on 2026-10-01). It is a full-color illustration, not a single-color glyph, so it is never recolored with `currentColor`: the header shows it at 44px from `public/brand/remi-mark.png` (trimmed, 256px) beside the Mitr wordmark, and the favicon set is generated from the same art (`app/icon.png` 192px, `app/apple-icon.png` 180px on paper, `app/favicon.ico` 32/48px). Its fine detail needs at least ~32px to read, so it is not used as a tiny inline icon. It is a wordmark companion, not a mascot: header and favicon only, never scattered through the UI as decoration.

## Do's and Don'ts

### Do:
- **Do** let product previews supply the color; keep surrounding UI in paper, powder-sky and graphite.
- **Do** use cherry-ink (not sakura-pink or logo-pink) for any pink text, icon, link or focus ring at body/UI size.
- **Do** make every interactive target at least 44px on touch screens.
- **Do** keep secondary text at pencil-gray or darker on any tinted surface (≥4.5:1).
- **Do** give Thai text room: headings at 1.3 line height, clamped body at 1.5, no negative tracking — Charmonman gets even more room.
- **Do** keep cuteness soft: rounded shapes, pastel tints and small, purposeful motion.
- **Do** show a rating's honest empty state ("ยังไม่มีรีวิว") when there is no data, exactly like any other empty state.

### Don't:
- **Don't** flood a screen with pink; it is an accent, not a wallpaper — one hero panel per page is the whole budget.
- **Don't** build dense marketplace layouts (banner walls, seller badges, starbursts, shouting sale stamps).
- **Don't** show a rating number, review count, discount badge or "N sold" claim that isn't computed from real data.
- **Don't** claim "instant download" anywhere; the store is always "download after payment is confirmed."
- **Don't** drift into generic corporate SaaS: gray boxes, sharp corners, icon-card grids.
- **Don't** ship neon "gamer" styling or pure-black surfaces; the dark theme stays soft and uses theme tokens only (no hardcoded colors), except the PromptPay QR, which always sits on white so banking apps can scan it.
- **Don't** nest cards or add colored side borders to cards and alerts.
- **Don't** signal status by color alone; every badge carries its text label.
- **Don't** use logo-pink for anything smaller than a large display line; it fails body-text contrast by design.
