# ย้าย Remi Shop จาก Netlify ไป DigitalOcean App Platform — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ `https://remii.cc` กลับมาใช้งานได้ โดยรัน Next.js เป็น server ตัวเดียวบน DigitalOcean App Platform region สิงคโปร์ (`sgp`) ขนาด 1 GiB ราคาคงที่ $10/เดือน ใช้ Supabase และ Cloudflare R2 ตัวเดิม ไม่ย้ายข้อมูล

**Architecture:** DigitalOcean build จาก GitHub ด้วย Node.js buildpack (`npm run build` → `npm run start`) แล้วรันบนเครื่อง 1 vCPU / 1 GiB ตัวเดียว DNS ของ `remii.cc` อยู่ที่ Cloudflare แบบ **DNS only (เมฆสีเทา)** ชี้ CNAME ไปที่แอป และเพิ่มโดเมนใน App Platform ให้ DigitalOcean ออก certificate เอง (Host header ของ request จึงเป็น `remii.cc` ตรงๆ ไม่ต้องตั้ง Origin Rules) ก่อน deploy ต้องปรับโค้ด 3 จุดที่ตั้งไว้สำหรับ serverless: การย่อรูปให้ทำทีละงาน, ขนาด DB pool และการอ่าน IP ของลูกค้า

**Tech Stack:** Next.js 16.3.6 · Node 24 · Prisma 7 + `@prisma/adapter-pg` · `sharp` · Supabase · Cloudflare R2 + Worker · DigitalOcean App Platform + `doctl` · `wrangler` · `node:test` ผ่าน `tsx`

**Spec:** การตัดสินใจของลูกค้าใน [Remi Shop — สรุปค่าใช้จ่ายย้าย Hosting](https://claude.ai/artifact/CQF8BrxHDMvrjRPYGFad7D) (เลือก DigitalOcean $10/เดือน) + ข้อค้นพบใน `WORKLOG.md` หัวข้อ "Hosting move" + แผนเดิม `docs/plans/2026-10-22-netlify-to-railway.md` (ถูกแทนที่ด้วยแผนนี้)

## Global Constraints

- Node: `"engines": { "node": ">=24 <25" }` (ตั้งไว้แล้ว) — Prisma 7 ไม่รับ Node 23; DigitalOcean buildpack รองรับ 24.0.0–24.15.0
- Region: `sgp` (สิงคโปร์) — อยู่ที่เดียวกับ Supabase `ap-southeast-1`
- ขนาดเครื่อง: `apps-s-1vcpu-1gb-fixed`, `instance_count: 1` — **ห้ามเพิ่มจำนวนเครื่อง** (`unstable_cache` / `revalidateTag` เก็บ cache ในเครื่องใครเครื่องมัน เครื่องที่สองจะเสิร์ฟข้อมูลสินค้าเก่า) ถ้าต้องการแรงขึ้นให้เพิ่มขนาดเครื่องแทน
- เพดานเวลาต่อ request ของ App Platform: 100 วินาที ปรับไม่ได้
- ห้ามรัน `prisma migrate deploy` ตอน deploy — migration รันด้วยมือตาม README (Database workflow)
- ห้าม commit ค่า secret ใดๆ: `.env`, `.env.local` และ `.do/app.yaml` (ไฟล์ spec ที่ render แล้ว) ต้องอยู่ใน `.gitignore`
- ห้ามเปิด Cloudflare proxy (เมฆสีส้ม) ให้ `remii.cc` / `www.remii.cc` — DigitalOcean ห้ามใช้ proxy ร่วมกับโดเมนที่เพิ่มใน App Platform (certificate ต่ออายุไม่ได้) และ redirect ของ Next.js/next-intl ต้องเห็น Host เป็น `remii.cc`
- เพดานไฟล์สินค้า 50 MB และสลิป 5 MB ไม่เปลี่ยน
- ทุก commit จบด้วยบรรทัด `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`

## Review Focus

1. **แอดมินอัปโหลด GIF หลายรูปพร้อมกัน** → หน้าร้านต้องไม่ล่ม งานย่อรูปต้องรันทีละงาน (Task 3: test "runs jobs one at a time, in order" + ทดสอบจริงใน Task 8)
2. **งานย่อรูปงานหนึ่ง error** → งานถัดไปในคิวยังต้องรันต่อ ไม่ค้างทั้งคิว (Task 3: test "a failing job rejects only itself")
3. **IP ลูกค้าใน log หลัง edge ของ DigitalOcean** → ต้องเป็น IP ลูกค้า ไม่ใช่ IP ของ ingress (DigitalOcean ใส่ IP ของ ingress ไว้ใน `x-forwarded-for`) (Task 2: test "reads DigitalOcean's do-connecting-ip first")
4. **ค่า env ที่มีอักขระพิเศษ** เช่น `EMAIL_FROM="REMII <noreply@…>"` หรือรหัสที่มี `#`, `"` → ไฟล์ spec ต้องยังเป็น YAML ที่ถูกต้องและค่าไม่เพี้ยน (Task 5: test "quotes values so special characters survive")
5. **ลืมตั้งค่า env บางตัว** → ต้องหยุดตั้งแต่ตอน render พร้อมบอกชื่อตัวที่ขาด ไม่ใช่ deploy ออกไปพร้อม secret ว่าง (Task 5: tests "throws listing every missing key once" และ "treats an empty value as missing")

---

## File Structure

| ไฟล์ | สถานะ | หน้าที่ |
| --- | --- | --- |
| `lib/security/log.ts` | แก้ | `clientMeta` อ่าน `do-connecting-ip` ก่อน |
| `lib/security/log.test.ts` | แก้ | test ลำดับ header ใหม่ |
| `lib/storage/serial-queue.ts` | ใหม่ | `createSerialQueue()` — คิวรัน async ทีละงาน |
| `lib/storage/serial-queue.test.ts` | ใหม่ | test คิว |
| `lib/storage/image-optimize.ts` | แก้ | ห่อ `optimizePreviewImage` ด้วยคิว + `sharp.concurrency(1)` / `sharp.cache(false)` |
| `lib/prisma/client.ts` | แก้ | `DB_POOL_MAX` 3 → 10, idle 5s → 30s |
| `lib/deploy/app-spec.ts` | ใหม่ | `renderAppSpec()` — แทนค่า `${KEY}` ใน template |
| `lib/deploy/app-spec.test.ts` | ใหม่ | test renderer |
| `scripts/render-app-spec.ts` | ใหม่ | CLI: `.do/app.template.yaml` + env → `.do/app.yaml` |
| `.do/app.template.yaml` | ใหม่ | App spec (ไม่มี secret) |
| `.gitignore` | แก้ | ignore `/.do/app.yaml` |
| `package.json` | แก้ | script `do:spec` |
| `README.md`, `WORKLOG.md`, `docs/plans/2026-10-22-netlify-to-railway.md` | แก้ | เปลี่ยนจาก Railway เป็น DigitalOcean |
| `.github/workflows/db-backup.yml` | ใหม่ (Task 10, ถ้าลูกค้าเลือกทางฟรี) | `pg_dump` รายวันไป R2 |

---

### Task 1: Branch ใหม่ + เปลี่ยนเอกสารจาก Railway เป็น DigitalOcean

**Files:**
- Modify: `README.md` (หัวข้อ `## Deploy`)
- Modify: `WORKLOG.md` (หัวข้อ `## Hosting move` บรรทัด "Host decision")
- Modify: `docs/plans/2026-10-22-netlify-to-railway.md` (บรรทัดแรก)

**Interfaces:**
- Consumes: branch `chore/railway-deploy` (commit `9951f70`: Node 24, `clientMeta` แบบ Cloudflare/Railway, เอกสาร)
- Produces: branch `chore/digitalocean-deploy` ที่ทุก task ต่อจากนี้ commit ลง

- [ ] **Step 1: สร้าง branch จาก branch เดิม**

```bash
git checkout chore/railway-deploy
git pull
git checkout -b chore/digitalocean-deploy
```

- [ ] **Step 2: แก้หัวข้อ Deploy ใน `README.md`** — แทนทั้งหัวข้อ `## Deploy` (ตั้งแต่บรรทัด `## Deploy` ถึงก่อน `## Scripts`) ด้วย:

```markdown
## Deploy

DigitalOcean App Platform, region `sgp` (Singapore, next to the Supabase project), one `apps-s-1vcpu-1gb-fixed`
instance, domain `remii.cc` (Cloudflare DNS, DNS only). The Node.js buildpack runs `npm run build` and
`npm run start`; Node comes from `engines` (24).

- App spec: `.do/app.template.yaml`. Render it with real values into the gitignored `.do/app.yaml`:
  `$env:DEPLOY_BRANCH='master'; $env:NEXT_PUBLIC_SITE_URL='https://remii.cc'; npm run do:spec`,
  then `doctl apps update <app-id> --spec .do/app.yaml`.
- Keep one instance: `unstable_cache` / `revalidateTag` are per instance. Scale up, not out.
- Migrations are not run on deploy: run `npm run db:deploy` by hand.
- Logs: `doctl apps logs <app-id> web --type run --follow` (build logs: `--type build`).
- Requests are cut at 100 s by the platform.
```

- [ ] **Step 3: แก้ `WORKLOG.md`** — ในหัวข้อ `## Hosting move` แทนบรรทัด `**Host decision (pending, client to choose)**` และ 2 bullet ใต้มัน ด้วย:

```markdown
**Host decision (2026-10-23):** the client chose DigitalOcean App Platform, SGP, `apps-s-1vcpu-1gb-fixed` ($10/mo).
Railway was dropped (platform outage + security incident since 2026-10-21, status incident `QH8L8B3E`).
Plan: `docs/plans/2026-10-23-netlify-to-digitalocean.md`.
```

- [ ] **Step 4: ทำเครื่องหมายแผนเดิมว่าถูกแทนที่** — เพิ่มบรรทัดนี้เป็นบรรทัดแรกของ `docs/plans/2026-10-22-netlify-to-railway.md` (ก่อน `# แผนย้าย deploy`):

```markdown
> **ถูกแทนที่แล้ว (2026-10-23):** ใช้ `docs/plans/2026-10-23-netlify-to-digitalocean.md` แทน — ลูกค้าเลือก DigitalOcean
```

- [ ] **Step 5: Commit**

```bash
git add README.md WORKLOG.md docs/plans/2026-10-22-netlify-to-railway.md docs/plans/2026-10-23-netlify-to-digitalocean.md
git commit -m "docs: switch the hosting move from Railway to DigitalOcean

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: อ่าน IP ลูกค้าจาก `do-connecting-ip`

DigitalOcean ใส่ IP ของ ingress ไว้ใน `x-forwarded-for` และใส่ IP ลูกค้าจริงไว้ใน `do-connecting-ip` ([DigitalOcean docs](https://docs.digitalocean.com/support/where-can-i-find-the-client-ip-address-of-a-request-connecting-to-my-app/)) ลำดับปัจจุบัน (`cf-connecting-ip` → `x-real-ip` → `x-forwarded-for`) จะ log IP ของ ingress

**Files:**
- Modify: `lib/security/log.ts` (ฟังก์ชัน `clientMeta` และคอมเมนต์เหนือมัน)
- Test: `lib/security/log.test.ts`

**Interfaces:**
- Consumes: `clientMeta(headers: Headers): ClientMeta` (มีอยู่แล้ว)
- Produces: signature เดิม เปลี่ยนแค่ลำดับ header

- [ ] **Step 1: เขียน test ที่ต้อง fail** — เพิ่มท้าย `lib/security/log.test.ts`:

```ts
test("reads DigitalOcean's do-connecting-ip first", () => {
  const meta = clientMeta(
    new Headers({ "do-connecting-ip": "198.51.100.9", "cf-connecting-ip": "203.0.113.1", "x-forwarded-for": "10.0.0.5" }),
  );
  assert.equal(meta.ip, "198.51.100.0/24");
});
```

- [ ] **Step 2: รัน test ให้ fail**

Run: `npx tsx --test lib/security/log.test.ts`
Expected: FAIL ที่ "reads DigitalOcean's do-connecting-ip first" — ได้ `'203.0.113.0/24'` แทน `'198.51.100.0/24'`

- [ ] **Step 3: แก้ `clientMeta`** — ใน `lib/security/log.ts` แทนคอมเมนต์และบรรทัด `const ip = …` ด้วย:

```ts
/**
 * DigitalOcean App Platform sets `do-connecting-ip` (its `x-forwarded-for` holds the ingress, not the client);
 * Cloudflare (proxied DNS) sets `cf-connecting-ip` / `cf-ipcountry`; `x-real-ip` / `x-forwarded-for` cover
 * other hosts. Log-only: a client could forge these where no proxy rewrites them.
 */
export function clientMeta(headers: Headers): ClientMeta {
  const ip =
    headers.get("do-connecting-ip") ??
    headers.get("cf-connecting-ip") ??
    headers.get("x-real-ip") ??
    headers.get("x-forwarded-for");
```

(บรรทัด `return { ip: maskIp(ip), country: headers.get("cf-ipcountry"), … }` คงเดิม)

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `npx tsx --test lib/security/log.test.ts`
Expected: PASS ทุกเคส (รวม "reads Cloudflare client headers first" และ "falls back to Railway's x-real-ip, then x-forwarded-for" เดิม)

- [ ] **Step 5: Commit**

```bash
git add lib/security/log.ts lib/security/log.test.ts
git commit -m "fix: log the client IP from do-connecting-ip on DigitalOcean

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: ย่อรูปทีละงาน (กัน RAM หมดบนเครื่อง 1 GiB)

หน้า admin ยิง `POST /api/admin/images/optimize` หนึ่ง request ต่อรูปพร้อมกันทั้งหมด (`components/admin/use-direct-upload.ts:74`) GIF ยาวๆ ที่ decode แล้วกิน RAM หลายร้อย MB ถ้ารันพร้อมกันหลายงานบน process เดียว process จะถูก kill และหน้าร้านล่มไปด้วย

หมายเหตุ: request ที่รอคิวนานเกิน 100 วินาทีจะถูก edge ของ DigitalOcean ตัด แต่ Node ยังทำงานในคิวต่อจนเสร็จ (client ยิงแบบไม่รอผลอยู่แล้ว — `keepalive: true`) จึงยอมรับได้

**Files:**
- Create: `lib/storage/serial-queue.ts`
- Test: `lib/storage/serial-queue.test.ts`
- Modify: `lib/storage/image-optimize.ts`

**Interfaces:**
- Produces: `createSerialQueue(): <T>(job: () => Promise<T>) => Promise<T>`
- `optimizePreviewImage(path, sizes?)` signature เดิม (ผู้เรียก: `lib/products/image-jobs.ts`) แต่ตอนนี้รอคิว

- [ ] **Step 1: เขียน test ที่ต้อง fail** — สร้าง `lib/storage/serial-queue.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSerialQueue } from "./serial-queue";

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("runs jobs one at a time, in order", async () => {
  const run = createSerialQueue();
  let active = 0;
  let maxActive = 0;
  const finished: number[] = [];
  const job = (n: number, ms: number) => async () => {
    active++;
    maxActive = Math.max(maxActive, active);
    await tick(ms);
    finished.push(n);
    active--;
    return n;
  };

  const results = await Promise.all([run(job(1, 30)), run(job(2, 5)), run(job(3, 10))]);

  assert.deepEqual(results, [1, 2, 3]);
  assert.deepEqual(finished, [1, 2, 3]);
  assert.equal(maxActive, 1);
});

test("a failing job rejects only itself", async () => {
  const run = createSerialQueue();
  const failed = run(async () => {
    throw new Error("boom");
  });
  const next = run(async () => "ok");

  await assert.rejects(failed, /boom/);
  assert.equal(await next, "ok");
});
```

- [ ] **Step 2: รัน test ให้ fail**

Run: `npx tsx --test lib/storage/serial-queue.test.ts`
Expected: FAIL — `Cannot find module './serial-queue'`

- [ ] **Step 3: เขียน `lib/storage/serial-queue.ts`**

```ts
/**
 * Runs async jobs one at a time, in the order they were queued. A job that throws rejects only its
 * own promise; the next job still runs.
 */
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function run<T>(job: () => Promise<T>): Promise<T> {
    const result = tail.then(job);
    tail = result.catch(() => undefined);
    return result;
  };
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `npx tsx --test lib/storage/serial-queue.test.ts`
Expected: PASS 2/2

- [ ] **Step 5: ใช้คิวใน `lib/storage/image-optimize.ts`**

เพิ่ม import ต่อจาก import เดิม:

```ts
import { createSerialQueue } from "@/lib/storage/serial-queue";
```

เพิ่มต่อจากบรรทัด `export { previewObjectPaths, type PreviewSize } from "@/lib/storage/webp";`:

```ts
// One long-running server (not one function per request): a long GIF can take hundreds of MB once
// decoded, so jobs run one at a time and libvips keeps no cache between them.
sharp.concurrency(1);
sharp.cache(false);
const runExclusive = createSerialQueue();
```

เปลี่ยนชื่อฟังก์ชันเดิม `export async function optimizePreviewImage(` เป็น `async function optimizeNow(` (ตัวฟังก์ชันและพารามิเตอร์เหมือนเดิมทุกตัวอักษร รวม JSDoc) แล้วเพิ่ม wrapper ใต้ JSDoc เดิม เหนือ `optimizeNow`:

```ts
export function optimizePreviewImage(
  path: string,
  sizes: PreviewSize[] = ["card", "detail"],
): Promise<Partial<Record<PreviewSize, string>> | null> {
  return runExclusive(() => optimizeNow(path, sizes));
}
```

ย้าย JSDoc เดิม (`Builds the requested WebP copies … see app/api/admin/images/optimize.`) ไปไว้เหนือ wrapper ที่ export และเพิ่มบรรทัดท้าย JSDoc: ` * Jobs are queued: one runs at a time per server.`

- [ ] **Step 6: ตรวจทั้งหมด**

Run: `npm test` แล้ว `npm run typecheck`
Expected: test ผ่านทั้งหมด (188 เดิม + 2 ใหม่ + 1 จาก Task 2 = 191), typecheck ไม่มี error (ถ้าขึ้น `PageProps` ให้รัน `npm run build` ก่อน เพราะ type นี้ Next สร้างตอน build)

- [ ] **Step 7: Commit**

```bash
git add lib/storage/serial-queue.ts lib/storage/serial-queue.test.ts lib/storage/image-optimize.ts
git commit -m "fix: run image optimization one job at a time on a single server

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: ขยาย DB pool สำหรับ server ตัวเดียว

`DB_POOL_MAX = 3` ตั้งไว้สำหรับ serverless (หลายเครื่อง เครื่องละ 3) บน server ตัวเดียว request ทั้งหมดใช้ pool ร่วมกัน ช่วงคนเข้าเยอะจะต่อคิวรอ connection เพดานของ Supabase pooler คือ 200 client connection; 10 ต่อเครื่อง × 2 เครื่องช่วง deploy = 20

**Files:**
- Modify: `lib/prisma/client.ts:6-9` และคอมเมนต์ใน `getClient()`

**Interfaces:** ไม่เปลี่ยน (`prisma` export เดิม)

- [ ] **Step 1: แก้ค่าคงที่และคอมเมนต์** — แทนบรรทัด 6–9:

```ts
/** Connections per server instance. One long-running server shares this pool across every request. */
const DB_POOL_MAX = 10;
/** Idle connections go back to the pooler after this long. */
const DB_IDLE_TIMEOUT_MS = 30_000;
```

และแทนคอมเมนต์ 3 บรรทัดใน `getClient()` (`// Each serverless instance keeps its own pool, …`) ด้วย:

```ts
    // The Supabase pooler allows a fixed number of client connections (200 on small plans). One
    // instance runs in production (two for a moment during a deploy), so 10 each leaves room for
    // scripts and the Prisma CLI.
```

- [ ] **Step 2: ตรวจ**

Run: `npm run typecheck` แล้ว `npm run build`
Expected: ผ่านทั้งคู่

- [ ] **Step 3: Commit**

```bash
git add lib/prisma/client.ts
git commit -m "chore: size the DB pool for one long-running server

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: App spec + ตัว render ค่า env

App spec เก็บใน repo เป็น template ที่ไม่มี secret (`${KEY}`) แล้ว render ค่าจริงจาก env ไปไฟล์ `.do/app.yaml` ที่ถูก gitignore ใช้ทั้งตอนสร้างแอปและทุกครั้งที่อัปเดต spec

**Files:**
- Create: `lib/deploy/app-spec.ts`
- Test: `lib/deploy/app-spec.test.ts`
- Create: `scripts/render-app-spec.ts`
- Create: `.do/app.template.yaml`
- Modify: `.gitignore`, `package.json`

**Interfaces:**
- Produces: `renderAppSpec(template: string, lookup: (key: string) => string | undefined): string` — throw `Error("Missing values for: A, B")` เมื่อมี key ไม่มีค่า
- Produces: `npm run do:spec` → เขียน `.do/app.yaml`; ค่าเรียงตามลำดับ: env ของ shell → `.env.local` → `.env`
- Template ต้องการ `DEPLOY_BRANCH` และ `NEXT_PUBLIC_SITE_URL` จาก shell (ใน `.env` ค่า `NEXT_PUBLIC_SITE_URL` เป็น localhost)

- [ ] **Step 1: เขียน test ที่ต้อง fail** — สร้าง `lib/deploy/app-spec.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderAppSpec } from "./app-spec";

const from = (vars: Record<string, string>) => (key: string) => vars[key];

test("fills placeholders with quoted values", () => {
  const out = renderAppSpec("branch: ${DEPLOY_BRANCH}\nvalue: ${A_KEY}", from({ DEPLOY_BRANCH: "master", A_KEY: "x" }));
  assert.equal(out, 'branch: "master"\nvalue: "x"');
});

test("quotes values so special characters survive", () => {
  const out = renderAppSpec("value: ${EMAIL_FROM}\nsecret: ${PW}", from({ EMAIL_FROM: "REMII <noreply@remii.cc>", PW: 'a"b #c: d' }));
  assert.equal(out, 'value: "REMII <noreply@remii.cc>"\nsecret: "a\\"b #c: d"');
});

test("throws listing every missing key once", () => {
  assert.throws(() => renderAppSpec("${A} ${B} ${A}", from({})), /Missing values for: A, B$/);
});

test("treats an empty value as missing", () => {
  assert.throws(() => renderAppSpec("value: ${SLIPOK_API_KEY}", from({ SLIPOK_API_KEY: "" })), /SLIPOK_API_KEY/);
});

test("leaves text without placeholders alone", () => {
  assert.equal(renderAppSpec("name: remi-shop\n", from({})), "name: remi-shop\n");
});
```

- [ ] **Step 2: รัน test ให้ fail**

Run: `npx tsx --test lib/deploy/app-spec.test.ts`
Expected: FAIL — `Cannot find module './app-spec'`

- [ ] **Step 3: เขียน `lib/deploy/app-spec.ts`**

```ts
/**
 * Fills `${KEY}` placeholders in the App Platform spec template. Each value is written as a YAML
 * double-quoted string (JSON strings are valid YAML), so `<`, `#`, `:` and quotes survive. Throws
 * listing every key with no value, so a deploy never goes out with an empty secret.
 */
export function renderAppSpec(template: string, lookup: (key: string) => string | undefined): string {
  const missing = new Set<string>();
  const out = template.replace(/\$\{([A-Z0-9_]+)\}/g, (_match, key: string) => {
    const value = lookup(key);
    if (!value) {
      missing.add(key);
      return "";
    }
    return JSON.stringify(value);
  });
  if (missing.size > 0) throw new Error(`Missing values for: ${[...missing].join(", ")}`);
  return out;
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `npx tsx --test lib/deploy/app-spec.test.ts`
Expected: PASS 5/5

- [ ] **Step 5: เขียน CLI `scripts/render-app-spec.ts`**

```ts
/**
 * Renders .do/app.template.yaml into .do/app.yaml (gitignored) for `doctl apps create|update --spec`.
 * Values come from the shell first, then .env.local, then .env. The shell must set DEPLOY_BRANCH and
 * NEXT_PUBLIC_SITE_URL (the .env one is localhost):
 *   $env:DEPLOY_BRANCH='master'; $env:NEXT_PUBLIC_SITE_URL='https://remii.cc'; npm run do:spec
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parse } from "dotenv";
import { renderAppSpec } from "../lib/deploy/app-spec";

const readEnvFile = (file: string): Record<string, string> => (existsSync(file) ? parse(readFileSync(file)) : {});
const local = readEnvFile(".env.local");
const base = readEnvFile(".env");

const template = readFileSync(".do/app.template.yaml", "utf8");
const spec = renderAppSpec(template, (key) => process.env[key] ?? local[key] ?? base[key]);
writeFileSync(".do/app.yaml", spec);
console.log("Wrote .do/app.yaml (contains secrets; gitignored)");
```

- [ ] **Step 6: เขียน `.do/app.template.yaml`**

```yaml
# DigitalOcean App Platform spec. Secrets are ${KEY} placeholders: render with `npm run do:spec`
# into .do/app.yaml (gitignored) and apply that file. Never put real values in this file.
name: remi-shop
region: sgp
alerts:
  - rule: DEPLOYMENT_FAILED
  - rule: DOMAIN_FAILED
domains:
  - domain: remii.cc
    type: PRIMARY
    minimum_tls_version: "1.2"
  - domain: www.remii.cc
    type: ALIAS
    minimum_tls_version: "1.2"
services:
  - name: web
    github:
      repo: roristada/remi-shop
      branch: ${DEPLOY_BRANCH}
      deploy_on_push: true
    environment_slug: node-js
    build_command: npm run build
    run_command: npm run start
    # Keep ONE instance: unstable_cache / revalidateTag are per instance. Scale up, not out.
    instance_size_slug: apps-s-1vcpu-1gb-fixed
    instance_count: 1
    http_port: 8080
    health_check:
      http_path: /th
      initial_delay_seconds: 20
      period_seconds: 10
      timeout_seconds: 5
      failure_threshold: 3
    alerts:
      - rule: MEM_UTILIZATION
        operator: GREATER_THAN
        value: 85
        window: FIVE_MINUTES
      - rule: RESTART_COUNT
        operator: GREATER_THAN
        value: 2
        window: TEN_MINUTES
    envs:
      - { key: NEXT_PUBLIC_SITE_URL, value: ${NEXT_PUBLIC_SITE_URL}, scope: RUN_AND_BUILD_TIME, type: GENERAL }
      - { key: NEXT_PUBLIC_SUPABASE_URL, value: ${NEXT_PUBLIC_SUPABASE_URL}, scope: RUN_AND_BUILD_TIME, type: GENERAL }
      - { key: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, value: ${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}, scope: RUN_AND_BUILD_TIME, type: GENERAL }
      - { key: NEXT_PUBLIC_PREVIEW_IMAGE_URL, value: ${NEXT_PUBLIC_PREVIEW_IMAGE_URL}, scope: RUN_AND_BUILD_TIME, type: GENERAL }
      - { key: SUPABASE_SERVICE_ROLE_KEY, value: ${SUPABASE_SERVICE_ROLE_KEY}, scope: RUN_AND_BUILD_TIME, type: SECRET }
      - { key: DATABASE_URL, value: ${DATABASE_URL}, scope: RUN_AND_BUILD_TIME, type: SECRET }
      - { key: DIRECT_URL, value: ${DIRECT_URL}, scope: RUN_AND_BUILD_TIME, type: SECRET }
      - { key: RESEND_API_KEY, value: ${RESEND_API_KEY}, scope: RUN_AND_BUILD_TIME, type: SECRET }
      - { key: EMAIL_FROM, value: ${EMAIL_FROM}, scope: RUN_AND_BUILD_TIME, type: GENERAL }
      - { key: SLIPOK_BRANCH_ID, value: ${SLIPOK_BRANCH_ID}, scope: RUN_AND_BUILD_TIME, type: SECRET }
      - { key: SLIPOK_API_KEY, value: ${SLIPOK_API_KEY}, scope: RUN_AND_BUILD_TIME, type: SECRET }
      - { key: R2_ACCOUNT_ID, value: ${R2_ACCOUNT_ID}, scope: RUN_AND_BUILD_TIME, type: SECRET }
      - { key: R2_ACCESS_KEY_ID, value: ${R2_ACCESS_KEY_ID}, scope: RUN_AND_BUILD_TIME, type: SECRET }
      - { key: R2_SECRET_ACCESS_KEY, value: ${R2_SECRET_ACCESS_KEY}, scope: RUN_AND_BUILD_TIME, type: SECRET }
      - { key: R2_BUCKET, value: ${R2_BUCKET}, scope: RUN_AND_BUILD_TIME, type: GENERAL }
      - { key: R2_FILES_BUCKET, value: ${R2_FILES_BUCKET}, scope: RUN_AND_BUILD_TIME, type: GENERAL }
```

ทุกตัวใช้ `RUN_AND_BUILD_TIME` เหมือนที่ Netlify ตั้งไว้ เพราะ `lib/env.ts` validate env ด้วย zod ตั้งแต่ตอน import และ `NEXT_PUBLIC_*` ถูกฝังตอน build

- [ ] **Step 7: เพิ่ม `.gitignore` และ script** — ต่อท้าย `.gitignore`:

```
# rendered App Platform spec (holds secrets)
/.do/app.yaml
```

และใน `package.json` เพิ่มใน `"scripts"` ต่อจาก `"role:set"`:

```json
"do:spec": "tsx scripts/render-app-spec.ts",
```

- [ ] **Step 8: ลอง render และตรวจว่าไฟล์ไม่ถูก track**

```powershell
$env:DEPLOY_BRANCH='chore/digitalocean-deploy'; $env:NEXT_PUBLIC_SITE_URL='https://remii.cc'; npm run do:spec
git status --short .do
git check-ignore .do/app.yaml
```

Expected: `Wrote .do/app.yaml …`, `git status` แสดงแค่ `?? .do/app.template.yaml`, `git check-ignore` พิมพ์ `.do/app.yaml`

ถ้ามี `doctl` แล้ว (Task 6 Step 2) ตรวจ spec เพิ่ม: `doctl apps spec validate .do/app.yaml` → Expected: พิมพ์ spec กลับมาโดยไม่มี error

- [ ] **Step 9: ตรวจทั้งหมด + commit**

Run: `npm test` แล้ว `npm run lint`
Expected: test ผ่านทั้งหมด (196), lint ไม่มี error ใหม่

```bash
git add lib/deploy/app-spec.ts lib/deploy/app-spec.test.ts scripts/render-app-spec.ts .do/app.template.yaml .gitignore package.json
git commit -m "chore: add the DigitalOcean app spec and a renderer for its secrets

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push -u origin chore/digitalocean-deploy
```

---

### Task 6: สร้างแอปบน DigitalOcean (ทดสอบบนโดเมน `*.ondigitalocean.app`)

ขั้นที่มี **(ผู้ใช้)** ต้องให้ผู้ใช้ทำเองในเบราว์เซอร์ เพราะต้อง login หรือยืนยันสิทธิ์ GitHub

**Interfaces:**
- Consumes: `.do/app.template.yaml`, `npm run do:spec` (Task 5), branch `chore/digitalocean-deploy` บน GitHub
- Produces: `APP_ID` และ `APP_URL` (`https://remi-shop-xxxxx.ondigitalocean.app`) ที่ Task 7–9 ใช้

- [ ] **Step 1 (ผู้ใช้): สมัคร DigitalOcean + ผูกบัตร** แล้วสร้าง API token ที่ API → Tokens → Generate New Token (Full Access หรือ Custom: apps read/write) อายุ 90 วัน

- [ ] **Step 2: ติดตั้งและ login `doctl`**

```powershell
winget install DigitalOcean.Doctl
# (ผู้ใช้) รันใน PowerShell แยก เพื่อไม่ให้ token อยู่ในแชท แล้ววาง token ตอนถาม:
#   doctl auth init --context remi-shop
doctl auth switch --context remi-shop
doctl account get
doctl apps list-regions
```

Expected: `account get` แสดงอีเมลผู้ใช้, `list-regions` มีแถว `sgp`

- [ ] **Step 3 (ผู้ใช้): ให้ DigitalOcean เข้าถึง repo** — Dashboard → Apps → Create App → GitHub → **Manage Access / Install** → เลือกเฉพาะ repo `roristada/remi-shop` → กลับมาแล้ว **ยกเลิกหน้าสร้างแอป** (ให้ `doctl` สร้างแทน) — ถ้าข้ามขั้นนี้ `doctl apps create` จะ error เรื่อง GitHub

- [ ] **Step 4: render spec สำหรับช่วงทดสอบแล้วสร้างแอป**

```powershell
$env:DEPLOY_BRANCH='chore/digitalocean-deploy'; $env:NEXT_PUBLIC_SITE_URL='https://remii.cc'; npm run do:spec
doctl apps spec validate .do/app.yaml
doctl apps create --spec .do/app.yaml --wait
doctl apps list
```

Expected: แอป `remi-shop` phase `ACTIVE` จด `ID` เป็น `APP_ID` และ `DefaultIngress` เป็น `APP_URL` โดเมน `remii.cc` จะขึ้นสถานะรอ DNS ซึ่งปกติในช่วงนี้ (DNS ยังชี้ Netlify)

ถ้า build fail: `doctl apps logs $APP_ID web --type build` แก้แล้ว push — แอป deploy ใหม่เอง (`deploy_on_push`)

- [ ] **Step 5: ชี้ `NEXT_PUBLIC_SITE_URL` ไปโดเมนทดสอบ** — ลิงก์ในอีเมลยืนยันและ redirect ของ Supabase ใช้ค่านี้ ช่วงทดสอบต้องเป็น `APP_URL`:

```powershell
$env:DEPLOY_BRANCH='chore/digitalocean-deploy'; $env:NEXT_PUBLIC_SITE_URL='<APP_URL>'; npm run do:spec
doctl apps update <APP_ID> --spec .do/app.yaml --wait
```

Expected: deployment ใหม่ phase `ACTIVE`

- [ ] **Step 6: smoke test**

```powershell
foreach ($u in '/th','/en','/','/robots.txt') { try { $r = Invoke-WebRequest -UseBasicParsing -MaximumRedirection 0 "<APP_URL>$u"; "$u -> $($r.StatusCode)" } catch { "$u -> $($_.Exception.Response.StatusCode.value__)" } }
```

Expected: `/th` 200, `/en` 200, `/` 307, `/robots.txt` 200

- [ ] **Step 7: เช็ค IP ใน log** — เปิด `<APP_URL>/wp-login.php` หนึ่งครั้ง แล้ว:

```powershell
doctl apps logs <APP_ID> web --type run --tail 50 | Select-String '\[security\]'
```

Expected: บรรทัด `[security] probe path` ที่ `ip` เป็น /24 ของ IP เน็ตบ้านผู้ทดสอบ (ไม่ใช่ IP ของ DigitalOcean)

---

### Task 7: อนุญาตโดเมนทดสอบใน Supabase และ R2

**Interfaces:**
- Consumes: `APP_URL` (Task 6)
- Produces: login และอัปโหลดบน `APP_URL` ใช้ได้ (Task 8)

- [ ] **Step 1 (ผู้ใช้): Supabase Redirect URLs** — Dashboard → Authentication → URL Configuration → Redirect URLs → Add `<APP_URL>/**` (ยังไม่เปลี่ยน Site URL)

- [ ] **Step 2: เพิ่ม `APP_URL` ใน R2 CORS ทั้ง 2 bucket** — เขียนไฟล์ชั่วคราวนอก repo (scratchpad) ตามค่าที่ตั้งอยู่ตอนนี้ (อ่านจาก `npx wrangler r2 bucket cors list <bucket>`) แล้วเพิ่ม origin ใหม่:

`cors-previews.json` (bucket `remi-shop`, เดิม methods PUT/GET/HEAD):

```json
{
  "rules": [
    {
      "allowed": {
        "origins": ["https://remi-shop.netlify.app", "http://localhost:3000", "https://remii.cc", "<APP_URL>"],
        "methods": ["PUT", "GET", "HEAD"],
        "headers": ["content-type", "cache-control"]
      },
      "maxAgeSeconds": 3600
    }
  ]
}
```

`cors-files.json` (bucket `remi-shop-files`, เดิม method PUT อย่างเดียว): เหมือนกันแต่ `"methods": ["PUT"]`

```powershell
npx wrangler r2 bucket cors set remi-shop --file <scratchpad>\cors-previews.json
npx wrangler r2 bucket cors set remi-shop-files --file <scratchpad>\cors-files.json
npx wrangler r2 bucket cors list remi-shop
npx wrangler r2 bucket cors list remi-shop-files
```

Expected: `allowed_origins` ของทั้งสอง bucket มี `<APP_URL>` และ origin เดิมครบ

---

### Task 8: ทดสอบบน `APP_URL` ก่อนย้าย DNS

ใช้ `UAT_TEST_GUIDE_TH.md` เป็นหลัก แต่ทดสอบบน `APP_URL` บัญชีทดสอบควรเป็นอีเมลจริงที่เปิดอ่านได้

- [ ] **Step 1:** หน้าแรก `/th`, `/en`, หน้าสินค้า, ค้นหา — รูปสินค้าขึ้น (โหลดจาก `NEXT_PUBLIC_PREVIEW_IMAGE_URL`)
- [ ] **Step 2:** AUTH-01/02 สมัครสมาชิก → ลิงก์ในอีเมลพากลับมาที่ `APP_URL` และเข้าหน้าบัญชีได้
- [ ] **Step 3:** AUTH-05 ลืมรหัสผ่าน → ตั้งรหัสใหม่ได้
- [ ] **Step 4:** ใส่ตะกร้า → checkout → อัปโหลดสลิป (ไป Supabase Storage) → SlipOK ตรวจ → แอดมินอนุมัติ → อีเมลแจ้งลูกค้าถึง
- [ ] **Step 5:** ลูกค้าดาวน์โหลดไฟล์ที่ซื้อ (`/api/download/[fileId]` redirect ไปลิงก์ R2 ชั่วคราว)
- [ ] **Step 6:** แอดมินอัปโหลดรูปสินค้า JPG 1 รูป และไฟล์ดิจิทัล 1 ไฟล์ (presigned PUT ไป R2 — ถ้าเจอ CORS error ใน console ของเบราว์เซอร์ ให้กลับไป Task 7 Step 2)
- [ ] **Step 7: ทดสอบ RAM (Review Focus 1)** — แอดมินอัปโหลด GIF ขนาดใหญ่ (หลายสิบ MB, หลายร้อยเฟรม) **4 รูปพร้อมกัน** ระหว่างนั้นอีกเครื่องรีเฟรช `<APP_URL>/th` เรื่อยๆ และเปิด:

```powershell
doctl apps logs <APP_ID> web --type run --follow
```

Expected: หน้าร้านตอบตลอด ไม่มี `run_restarted` (`doctl apps logs <APP_ID> web --type run_restarted` ว่าง), Insights → Memory ไม่แตะ 100%, รูปทั้ง 4 ได้ไฟล์ `.card.webp` / `.detail.webp` ครบภายในไม่กี่นาที
- [ ] **Step 8:** Export orders (`/admin/orders/export`) ได้ไฟล์ CSV
- [ ] **Step 9:** เปิด PR `chore/digitalocean-deploy` → `master` ให้ผู้ใช้รีวิว และ merge เมื่อผ่านทุกข้อ

---

### Task 9: ย้าย DNS ของ `remii.cc` และปิด Netlify

ทำหลัง merge PR แล้วเท่านั้น ตอนนี้ `remii.cc` ตอบ 503 อยู่แล้ว จึงไม่มี downtime เพิ่ม

**Interfaces:**
- Consumes: `APP_ID`, `APP_URL`, `master` ที่มีงาน Task 1–5

- [ ] **Step 1: ชี้แอปไป `master` และโดเมนจริง**

```powershell
git checkout master; git pull
$env:DEPLOY_BRANCH='master'; $env:NEXT_PUBLIC_SITE_URL='https://remii.cc'; npm run do:spec
doctl apps update <APP_ID> --spec .do/app.yaml --wait
```

Expected: deployment ใหม่ `ACTIVE`

- [ ] **Step 2 (ผู้ใช้ หรือผ่าน Cloudflare dashboard): แก้ DNS ใน Cloudflare** — โซน `remii.cc` → DNS → Records:
  - ลบ: `A remii.cc → 13.215.239.219`, `A remii.cc → 52.74.6.109`, `AAAA remii.cc → 2406:da18:b3d:e201::258`, `AAAA remii.cc → 2406:da18:b3d:e201::259`, `CNAME www → remi-shop.netlify.app`
  - เพิ่ม: `CNAME @ → <APP_URL ไม่มี https://>` **Proxy status: DNS only (เทา)**, TTL Auto
  - เพิ่ม: `CNAME www → <APP_URL ไม่มี https://>` **DNS only (เทา)**

- [ ] **Step 3: รอ certificate และตรวจ**

```powershell
doctl apps get <APP_ID>
(Invoke-RestMethod -Headers @{accept='application/dns-json'} 'https://cloudflare-dns.com/dns-query?name=remii.cc&type=CNAME').Answer
foreach ($u in 'https://remii.cc/th','https://www.remii.cc/th') { (Invoke-WebRequest -UseBasicParsing $u).StatusCode }
```

Expected: CNAME ชี้ไป `APP_URL`, ทั้ง 2 URL ได้ 200 ผ่าน HTTPS (certificate อาจใช้ 5–30 นาที — ระหว่างนั้น HTTPS จะ error; ดูสถานะโดเมนได้ที่ Dashboard → App → Settings → Domains)

- [ ] **Step 4 (ผู้ใช้): Supabase URL Configuration** — Site URL = `https://remii.cc`; Redirect URLs = `https://remii.cc/**` และ `http://localhost:3000/**` เท่านั้น (ลบ `remi-shop.netlify.app` และ `<APP_URL>`)

- [ ] **Step 5: ลบ origin เก่าออกจาก R2 CORS** — ไฟล์เดียวกับ Task 7 Step 2 แต่ `origins` เหลือ `["http://localhost:3000", "https://remii.cc"]` แล้วรัน `npx wrangler r2 bucket cors set …` ทั้ง 2 bucket และ `cors list` ตรวจ

- [ ] **Step 6: ทดสอบซ้ำบน `https://remii.cc`** — Task 8 Step 1, 2 และ 6 (สมัคร/ยืนยันอีเมลต้องกลับมาที่ `remii.cc`, อัปโหลดรูปใน admin ต้องไม่มี CORS error)

- [ ] **Step 7: ปิด Netlify** — หยุด build อัตโนมัติ (ไม่งั้นทุก push ไป `master` จะ build บน Netlify):

```powershell
npx netlify api updateSite --data '{\"site_id\":\"0a091cc6-e3c5-482b-95eb-1f6ef9971b99\",\"body\":{\"build_settings\":{\"stop_builds\":true}}}'
```

ถ้าคำสั่งไม่ผ่าน ให้ผู้ใช้ปิดที่ Netlify → Site configuration → Build & deploy → Continuous deployment → **Stop builds** ส่วนการลบไซต์ให้ลูกค้าตัดสินใจทีหลัง

- [ ] **Step 8: อัปเดตเอกสาร + commit**
  - `UAT_TEST_GUIDE_TH.md` ใช้ `remii.cc` อยู่แล้ว ไม่ต้องแก้
  - `WORKLOG.md` หัวข้อ `## Hosting move`: เปลี่ยนหัวเป็น `(done, <วันที่>)`, ลบย่อหน้า **Outage**, เพิ่มบรรทัด `Live on DigitalOcean App Platform (app <APP_ID>, sgp) since <วันที่>; Netlify builds stopped.`

```bash
git add WORKLOG.md
git commit -m "docs: record the move to DigitalOcean

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push
```

---

### Task 10: Backup ฐานข้อมูล — **รอลูกค้าเลือกก่อนเริ่ม**

- [ ] **Step 0: ถามลูกค้า** (ผ่านผู้ใช้): ทาง A ฟรี (`pg_dump` รายวันไป R2 ด้วย GitHub Actions) หรือทาง B Supabase Pro $25/เดือน
  - **ทาง B:** ผู้ใช้อัปเกรดที่ Supabase → Organization → Billing แล้วตรวจที่ Project → Database → Backups ว่ามี backup รายวัน จบ task นี้ (ข้าม Step 1–6)
  - **ทาง A:** ทำ Step 1–6

**Files:**
- Create: `.github/workflows/db-backup.yml`

- [ ] **Step 1: สร้าง bucket และ token เฉพาะ backup**

```powershell
npx wrangler r2 bucket create remi-shop-backups --location apac
npx wrangler r2 bucket lifecycle add remi-shop-backups expire-30d --expire-days 30
npx wrangler r2 bucket lifecycle list remi-shop-backups
```

Expected: มี rule `expire-30d` (ถ้า syntax ของ `lifecycle add` ไม่ตรงกับ wrangler รุ่นที่ใช้ ให้ดู `npx wrangler r2 bucket lifecycle add --help`)

(ผู้ใช้) R2 → Manage API tokens → Create → Object Read & Write → **เฉพาะ bucket `remi-shop-backups`** → จด Access Key ID / Secret

- [ ] **Step 2 (ผู้ใช้): ตั้ง GitHub Actions secrets** — repo → Settings → Secrets and variables → Actions: `BACKUP_DATABASE_URL` (= `DIRECT_URL`, พอร์ต 5432), `R2_ACCOUNT_ID`, `R2_BACKUP_ACCESS_KEY_ID`, `R2_BACKUP_SECRET_ACCESS_KEY`

- [ ] **Step 3: เขียน `.github/workflows/db-backup.yml`**

```yaml
# Nightly logical backup of the Supabase database to R2 (bucket remi-shop-backups, 30-day expiry).
name: db-backup
on:
  schedule:
    - cron: "0 20 * * *" # 03:00 Asia/Bangkok
  workflow_dispatch:
permissions:
  contents: read
jobs:
  backup:
    runs-on: ubuntu-24.04
    steps:
      - name: Install pg_dump 17 (matches the server)
        run: |
          sudo install -d /usr/share/postgresql-common/pgdg
          sudo curl -fsSo /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
          echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt noble-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list
          sudo apt-get update -qq
          sudo apt-get install -y -qq postgresql-client-17
      - name: Dump
        env:
          DATABASE_URL: ${{ secrets.BACKUP_DATABASE_URL }}
        run: |
          /usr/lib/postgresql/17/bin/pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges \
            --schema=public --schema=auth --schema=storage --file=remi-shop.dump
          ls -l remi-shop.dump
      - name: Upload to R2
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.R2_BACKUP_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_BACKUP_SECRET_ACCESS_KEY }}
          AWS_DEFAULT_REGION: auto
        run: |
          aws s3 cp remi-shop.dump "s3://remi-shop-backups/$(date -u +%Y/%m/%d)/remi-shop.dump" \
            --endpoint-url "https://${{ secrets.R2_ACCOUNT_ID }}.r2.cloudflarestorage.com"
```

- [ ] **Step 4: Commit + รันครั้งแรก**

```bash
git add .github/workflows/db-backup.yml
git commit -m "chore: nightly database backup to R2

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push
```

(ผู้ใช้) GitHub → Actions → db-backup → **Run workflow** Expected: job เขียว, log ขั้น Dump แสดงไฟล์ขนาดหลาย MB

- [ ] **Step 5: ตรวจว่าไฟล์ถึง R2**

```powershell
$day = (Get-Date).ToUniversalTime().ToString('yyyy/MM/dd')
npx wrangler r2 object get "remi-shop-backups/$day/remi-shop.dump" --file <scratchpad>\remi-shop.dump --remote
```

Expected: ได้ไฟล์ขนาดใกล้ log ใน Step 4

- [ ] **Step 6: ซ้อมกู้คืน (ไม่แตะฐานข้อมูลจริง)** — ใช้ Postgres 17 ในเครื่อง (Docker) แล้ว restore เฉพาะ schema `public`:

```powershell
docker run -d --name pgrestore -e POSTGRES_PASSWORD=x -p 55432:5432 postgres:17
docker cp <scratchpad>\remi-shop.dump pgrestore:/tmp/remi-shop.dump
docker exec pgrestore pg_restore -U postgres -d postgres --no-owner --schema=public /tmp/remi-shop.dump
docker exec pgrestore psql -U postgres -c "select count(*) from public.orders"
docker rm -f pgrestore
```

Expected: จำนวน order ใกล้เคียงของจริง (298 ณ 2026-10-23) — error เรื่อง role/extension ของ Supabase ระหว่าง restore ยอมรับได้ ตราบใดที่ตาราง `public` มีข้อมูล

จากนั้นอัปเดต `WORKLOG.md` บรรทัด **Open: backups.** เป็น `Backups: nightly pg_dump to R2 (remi-shop-backups, 30 days), restore drill passed <วันที่>.` แล้ว commit
