# Remi Shop

Digital file store for a solo seller (brushes, textures, presets, fonts, templates).

Stack: Next.js 16 (App Router, `proxy.ts`) · TypeScript strict · Tailwind v4 · shadcn/ui · next-intl (`/th`, `/en`) · Supabase (Auth, Postgres, Storage) · Prisma 7 (`@prisma/adapter-pg`) · Zod · Resend.

## Setup

1. `npm install` (runs `prisma generate`)
2. `cp .env.example .env.local` and fill in Supabase keys + DB URLs
3. Run `supabase/sql/001_storage_buckets.sql` in the Supabase SQL Editor (done for the current project)
4. `npm run db:deploy` (uses `DIRECT_URL`)
5. `npm run dev`

## Scripts

| Script | Purpose |
| --- | --- |
| `dev` / `build` / `start` | Next.js |
| `typecheck` | `tsc --noEmit` |
| `lint` | ESLint |
| `db:deploy` / `db:status` / `db:diff` / `db:studio` | Prisma (see Database workflow) |

## Layout

- `app/[locale]/` — storefront (Thai default, English)
- `app/admin/` — admin area (Thai only, role checked server-side in layout)
- `lib/supabase/` — `client` (browser), `server` (cookies), `admin` (service role, server only), `proxy` (session refresh)
- `lib/prisma/` — lazy Prisma client
- `lib/auth/guards.ts` — `requireUser`, `requireAdmin` (role read from `profiles`)
- `lib/storage/` — bucket names, limits, filename sanitizing
- `locales/{th,en}/*.json` — UI strings
- `prisma/schema.prisma` — manages the `public` schema only; never touch `auth`/`storage`


## Database workflow

`prisma migrate dev` is **not** used: its shadow database has no Supabase `auth` schema,
so the hand-written Supabase migrations can't replay. Instead:

1. Edit `prisma/schema.prisma`
2. `mkdir prisma/migrations/<YYYYMMDDHHMMSS>_<name>`
3. `npm run db:diff -- -o prisma/migrations/<that dir>/migration.sql` — review it
4. Append any Supabase-only SQL (RLS policies, grants, CHECKs, partial indexes)
5. `npm run db:deploy`, then `npm run db:diff` must print an empty migration

Every new table must get `enable row level security` plus explicit grants/policies
(anon/authenticated have no default privileges in `public`).

Migrations so far:
- `..._init` — tables, enums, FKs, indexes (generated)
- `..._supabase_security` — auth triggers, CHECKs, partial unique indexes, seeds, RLS, grants
- `..._profiles_auth_delete_trigger` — replaces cross-schema FK with a delete trigger

## Auth setup (Supabase dashboard)

- **URL Configuration** → Site URL `http://localhost:3000`; Redirect URLs `http://localhost:3000/**` (+ production domain later)
- **Emails → Templates** → paste `supabase/templates/confirm-signup.html` and `reset-password.html`
  (token-hash links → `/auth/confirm`, work across devices)
- **Providers → Email** → minimum password length 8
- First admin: sign up, then `npm run role:set -- you@example.com ADMIN`

## Security notes

- `SUPABASE_SERVICE_ROLE_KEY` is server only (`import "server-only"`).
- All data access goes through the server (Prisma). RLS is on as a second layer of defense.
- `digital-files` and `payment-slips` are private buckets; downloads go through short-lived signed URLs.
