---
name: Remi Shop
description: Thai-first store for digital-art files (brushes, textures, presets, fonts), styled as a soft swatch board.
colors:
  sakura-pink: "#f5bfd4"
  cherry-ink: "#b0426b"
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
  link:
    textColor: "{colors.cherry-ink}"
---

# Design System: Remi Shop

## Overview

**Creative North Star: "The Swatch Board"**

Remi Shop reads like a clean board where an artist pins swatches of their brushes and palettes. The artwork is the loudest thing on every page; the interface is soft paper, quiet type and rounded tiles that hold the work without competing with it. The signature is the home hero's fanned swatch stack: preview tiles tilted like cards pinned to a board, one real preview on top.

The mood is cute and gentle but still premium: pastel pink and powder blue on near-white paper, generous whitespace and friendly rounded Thai type. Cute comes from softness, roundness and small moments (a swatch fanning in, a check mark after copying), never from clutter, stickers or loud color. Thai is the primary language, so every decision is checked against Thai text first: tone marks, line height and word length.

The store is explicitly not a dense marketplace (no Shopee-style banner walls or shouting discount stamps), not generic corporate SaaS, and not a dark or neon gamer look. V1 is light theme only.

**Key Characteristics:**
- Artwork first: preview images carry the color; UI surfaces stay pale.
- Pink is an accent, powder blue is the surface, graphite is the voice.
- Everything rounded: pills for actions and chips, 25–31px corners for tiles and panels.
- Depth by tone (tinted panels on paper), with one soft shadow for lifted items.
- Thai-first type: Mitr for titles, Anuphan for reading, no negative tracking.
- 44px touch targets and AA contrast are part of the look, not an afterthought.

## Colors

A pastel pair (pink accent, powder-blue surface) on cool paper, anchored by soft graphite text.

### Primary
- **Sakura Pink** (sakura-pink): the one brand accent. Fills primary buttons (add to cart, checkout, search), the logo mark and swatch placeholders. It is too light to carry text or icons on white (1.6:1), so it is only ever a fill with graphite text on it.
- **Cherry Ink** (cherry-ink): the readable pink. Links ("view all"), the active step in the order stepper, category labels on product pages, checkbox accents and focus rings (at 80% opacity to stay ≥3:1). Use it whenever pink must be read.

### Secondary
- **Powder Sky** (powder-sky): the working surface. Filter bar, purchase panel, payment panel, cart summary, footer and product image wells, usually at 40–60% opacity over paper. It groups content without borders.
- **Blush Mist** (blush-mist): the faint pink wash for hover rows, the countdown chip and small highlights.

### Neutral
- **Paper White** (paper-white): page and card background. Slightly cool, never pure #fff.
- **Graphite** (graphite): all body and heading text, the active chip fill, step numbers. Soft instead of black.
- **Pencil Gray** (pencil-gray): secondary text (meta, counts, hints). Darkened from the brief's #777777 so it passes AA on paper *and* on powder-sky and fog surfaces.
- **Fog** (fog): muted fills (skeletons, neutral badges, image-less tiles).
- **Hairline** (hairline) and **Input Line** (input-line): dividers, dashed empty states, input strokes.
- **Status**: error-red, success-green and warning-amber are used as text on a 10% tint of themselves, always with a text label.

### Named Rules
**The Accent Not Wallpaper Rule.** Sakura pink covers only the primary action and small marks. If a screen has more than one pink-filled area besides the primary button, one of them is wrong.

**The Readable Pink Rule.** Pink that carries meaning as text, icon or outline is cherry-ink, never sakura-pink.

## Typography

**Display Font:** Mitr (with Anuphan, system sans)
**Body Font:** Anuphan (with system sans)

**Character:** Mitr is a soft geometric Thai/Latin face with rounded terminals: friendly, a little cute, confident at size. Anuphan is a clean loopless Thai sans that stays legible at 12–14px. Together they give warmth in titles and calm in reading.

### Hierarchy
- **Display** (Mitr 500, 2rem → 3rem, 1.2–1.25): the home hero title only, `text-balance`.
- **Headline** (Mitr 500, 1.5rem → 1.875rem, 1.3): page h1s (shop, cart, order number).
- **Title** (Mitr 500, 1.125–1.5rem, 1.3): section h2s (folder sections, "new arrivals", panel titles).
- **Body** (Anuphan 400, 1rem, 1.5): descriptions and forms. Product-card names use Anuphan 600 at 0.95–1rem, 1.5 line height, clamped to 2 lines.
- **Label** (Anuphan 400, 0.75rem): meta rows, counts, hints, captions; tabular numerals for prices, sizes and counters.

### Named Rules
**The Tone Mark Rule.** Thai text never gets line height under 1.3 in headings or 1.5 in clamped body text, and never negative letter-spacing; stacked vowels and tone marks must not be clipped.

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

Everything is rounded, from 14px base radius upward: pills for every button, chip and toggle; 20px for inputs; 25px for product tiles and image wells; 31px for panels and admin folder cards. Borders are hairlines (1px, hairline) or dashed for empty and drop zones. No sharp corners, no thick outlines, no colored side borders.

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

### Cards / Containers
- **Product tile:** frameless. The square image well (25px radius, powder-sky, inset ring) *is* the card; category, software, name and price sit below it with no box. The whole tile is one stretched link. Hovering scales the image 1.04 (disabled under reduced motion).
- **Panels** (purchase, payment, cart summary, filters): powder-sky at about 45%, 31px radius, 20–24px padding, no border.
- **Never nest cards:** inside a panel, group rows with a paper `dl` and dividers, not another card.

### Inputs / Fields
- **Style:** 40px tall, 20px radius, paper fill (transparent border inside tinted bars), placeholder in pencil-gray.
- **Focus:** cherry-ink ring. Errors show red text under the field with `aria-invalid`.
- **Drop zone** (slip upload): dashed 2px hairline, 20px radius, icon plus label centered.

### Navigation
- **Header:** sticky, translucent paper with blur, 64px tall, logo pill mark "R" plus the Mitr wordmark. Text links on desktop, a left sheet menu on phones (including the language switch). Icon controls are 44px circles.
- **Footer:** powder-sky at 40%, small graphite headings, pencil-gray links.

### Swatch Stack (signature)
The home hero: three rounded preview tiles fanned at small rotations on a powder-sky board, the front one a real product image, the back ones painted pink/blue gradients or a pink stripe. They fan in once on load (600ms, `cubic-bezier(0.2, 0.8, 0.2, 1)`), with no animation under reduced motion.

### Order Stepper & Payment Steps
Three columns ("pay → store checks slip → download") marked by a top rule: graphite for done, cherry-ink for current, hairline for upcoming, each with a number or check disc. The payment panel repeats the sequence as numbered graphite discs (scan QR, transfer the exact amount with copy buttons, attach slip), since the order carries real meaning.

## Do's and Don'ts

### Do:
- **Do** let product previews supply the color; keep surrounding UI in paper, powder-sky and graphite.
- **Do** use cherry-ink (not sakura-pink) for any pink text, icon, link or focus ring.
- **Do** make every interactive target at least 44px on touch screens.
- **Do** keep secondary text at pencil-gray or darker on any tinted surface (≥4.5:1).
- **Do** give Thai text room: headings at 1.3 line height, clamped body at 1.5, no negative tracking.
- **Do** keep cuteness soft: rounded shapes, pastel tints and small, purposeful motion.

### Don't:
- **Don't** flood a screen with pink; it is an accent, not a wallpaper.
- **Don't** build dense marketplace layouts (banner walls, starbursts, shouting sale stamps).
- **Don't** drift into generic corporate SaaS: gray boxes, sharp corners, icon-card grids.
- **Don't** ship dark or neon "gamer" styling; V1 is light theme only.
- **Don't** nest cards or add colored side borders to cards and alerts.
- **Don't** signal status by color alone; every badge carries its text label.
