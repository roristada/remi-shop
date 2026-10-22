> **ถูกแทนที่แล้ว (2026-10-23):** ใช้ `docs/plans/2026-10-23-netlify-to-digitalocean.md` แทน — ลูกค้าเลือก DigitalOcean

# แผนย้าย deploy: Netlify → Railway

**วันที่:** 2026-10-22
**เหตุผล:** เครดิต Netlify หมด และ Personal plan เลือก region ของ function ไม่ได้ ทำให้ server อยู่ไกลจาก Supabase (`ap-southeast-1`, สิงคโปร์)
**เป้าหมาย:** รัน Next.js เป็น server ตัวเดียวบน Railway region สิงคโปร์ ใช้ Supabase และ Cloudflare R2 ตัวเดิม ไม่ย้ายข้อมูล

---

## 1. สิ่งที่ตรวจพบในโค้ด

| เรื่อง | สถานะ | ผลต่อการย้าย |
| --- | --- | --- |
| Next.js 16.3.6, `next build` / `next start` | ไม่มี `netlify.toml`, ไม่มี adapter เฉพาะ host | รันบน Railway ได้ตรงๆ (`next start` อ่าน `PORT` เอง) |
| Node | Prisma 7 ต้องการ `20.19+ / 22.12+ / 24+` | ต้องล็อก Node 24 ให้ Railway |
| `postinstall: prisma generate` | client ถูกสร้างไป `lib/generated/prisma` (gitignored) | Railway รัน `npm ci` → generate อัตโนมัติ |
| Migration | `npm run db:deploy` ใช้ `DIRECT_URL` | **ไม่ต้องรันตอนย้าย** — schema ตอนนี้ up to date (36 migrations) |
| งานตั้งเวลา / cron | ไม่มี — `cancelExpiredOrders()` รันตอนอ่าน/สร้าง order | ไม่มีอะไรต้องย้าย |
| Route ที่ใช้เวลานาน | `app/api/admin/images/optimize/route.ts` ตั้ง `maxDuration = 60` | Railway เป็น server ถาวร ไม่มีเพดานเวลาแบบ serverless (`maxDuration` ไม่มีผล) |
| ย่อรูป (`sharp`) | ใช้ใน `lib/storage/image-optimize.ts` / `webp.ts` | รันใน container ได้เลย — ระวัง RAM (ดูข้อ 6) |
| `next/image` | บน Netlify ใช้ Netlify Image CDN | บน Railway ใช้ optimizer ของ Next เอง (sharp) cache อยู่ใน `.next/cache/images` ซึ่งหายทุก deploy |
| อัปโหลดไฟล์ | browser → Supabase Storage (signed token) หรือ → R2 (presigned PUT) โดยตรง | ไม่ผ่าน server — แต่ **CORS ของ R2 ต้องเพิ่มโดเมนใหม่** |
| Cloudflare Worker (`cloudflare/preview-worker.js`) | เสิร์ฟรูป preview จาก R2 ที่ `NEXT_PUBLIC_PREVIEW_IMAGE_URL` | ไม่ผูกกับ Netlify — ไม่ต้องแก้ |
| Log ความปลอดภัย (`lib/security/log.ts`) | อ่าน `x-nf-client-connection-ip` (Netlify) ก่อน แล้ว fallback `x-forwarded-for` | ใช้ได้บน Railway อยู่แล้ว แต่ `x-country` จะเป็น `null` |
| Supabase Auth redirect | `NEXT_PUBLIC_SITE_URL` + Redirect URLs ใน dashboard ชี้ `remi-shop.netlify.app` | ต้องเปลี่ยนเป็นโดเมนใหม่ |

**สรุป:** ไม่มีโค้ดที่ผูกกับ Netlify จนรันที่อื่นไม่ได้ งานส่วนใหญ่คือ *ตั้งค่า* (Railway, Supabase, Cloudflare) มีแก้โค้ดเล็กน้อยเท่านั้น

---

## 2. การตัดสินใจที่ต้องทำก่อนเริ่ม

> **อัปเดต 2026-10-23 (ตรวจจาก Netlify/Cloudflare CLI):**
> - โดเมน production คือ **`https://remii.cc`** (Netlify custom domain, DNS อยู่ Cloudflare) → ใช้ตัวนี้ต่อบน Railway
> - R2 CORS ของ `remi-shop` และ `remi-shop-files` มี `https://remii.cc` และ `http://localhost:3000` อยู่แล้ว → ข้อ 5.2 ต้องเพิ่มแค่โดเมน `*.up.railway.app` ชั่วคราวตอนทดสอบก่อนย้าย DNS
> - Preview Worker: `https://remi-shop.roristada.workers.dev` (ไม่ผูกกับ host)
> - รหัส DB บน Netlify เป็นรหัส **ก่อน** reset (2026-10-22) — ไซต์ Netlify ต่อ DB ไม่ได้แล้วจนกว่าจะอัปเดตตัวแปร

1. **โดเมน production** — จะใช้
   - (ก) `<ชื่อ>.up.railway.app` ที่ Railway ให้ฟรี หรือ
   - (ข) โดเมนของตัวเอง (ถ้า DNS อยู่ที่ Cloudflare แล้ว ชี้ CNAME ไป Railway ได้เลย)

   ค่านี้กำหนด `NEXT_PUBLIC_SITE_URL`, Supabase Redirect URLs และ R2 CORS ทั้งหมด ถ้ายังไม่แน่ใจ เริ่มด้วย (ก) แล้วเพิ่ม (ข) ทีหลังได้ (ต้อง rebuild เพราะ `NEXT_PUBLIC_*` ฝังตอน build)
2. **Railway plan** — Hobby ($5/เดือน รวม usage $5) พอสำหรับร้านขนาดนี้; Trial มีเครดิตจำกัด ไม่ควรใช้ production
3. **ปล่อย Netlify ไว้ชั่วคราวไหม** — ถ้าไซต์ Netlify ยังเปิดอยู่ ใช้เป็น rollback ได้ ถ้าโดนระงับแล้ว ข้ามข้อ rollback ไป

---

## 3. แก้โค้ดในโปรเจค (ทำบน branch `chore/railway-deploy`)

### 3.1 ล็อก Node 24
`package.json`
```json
"engines": { "node": ">=24 <25" }
```
และเพิ่มไฟล์ `.nvmrc` ที่มี `24` (ให้เครื่อง dev ใช้ตรงกันด้วย)

### 3.2 Config ของ Railway — ไม่ใช้ `railway.json`
Railway ประกาศเลิกใช้ Config as Code (`railway.json`) แล้ว: ไฟล์เดิมใช้ได้ถึง 2026-12-01 สำหรับ service เก่าเท่านั้น จึง **ไม่เพิ่มไฟล์นี้**
- Railpack ตรวจเจอ `build` / `start` จาก `package.json` เอง และ cache `.next/cache` ให้ระหว่าง build
- ตั้งใน dashboard แทน (Settings → Deploy): Healthcheck Path `/th`, timeout 120 วินาที, Restart Policy `On Failure`
- **ไม่ตั้ง** Pre-deploy Command เป็น `prisma migrate deploy` — repo นี้เขียน migration เองตาม README (Database workflow) ควรรันด้วยมือเหมือนเดิม

### 3.3 Log ให้เข้ากับ Railway
`lib/security/log.ts`
- `clientMeta`: ลำดับ `cf-connecting-ip` (ถ้า `remii.cc` เปิด Cloudflare proxy) → `x-real-ip` (Railway edge) → `x-forwarded-for`; ประเทศจาก `cf-ipcountry` (header ของ Netlify ถูกเอาออก)
- แก้คอมเมนต์ `netlify logs -l warn` → `railway logs` (มีใน `lib/security/log.ts` และ `lib/payments/customer-actions.ts`)
- เพิ่มเคสใน `lib/security/log.test.ts` สำหรับ `x-real-ip`; รัน `npm test`

### 3.4 อื่นๆ
- `components/shared/preview-image.tsx`: คอมเมนต์อ้าง Netlify image CDN — GIF ยังข้าม optimizer เหมือนเดิม (ไม่ต้องแก้ logic) แค่แก้ข้อความ
- `UAT_TEST_GUIDE_TH.md`: เปลี่ยน `remi-shop.netlify.app` เป็นโดเมนใหม่ (3 จุด)
- `README.md` / `WORKLOG.md`: หลายจุดพูดถึง Vercel `sin1` และเพดาน 4.5 MB — เพิ่มบันทึกว่าตอนนี้ deploy บน Railway Singapore

### 3.5 ตรวจก่อน push
```
npm run typecheck
npm run lint
npm test
npm run build
npm run start   # เปิด http://localhost:3000/th ลองไล่หน้าหลักๆ
```

---

## 4. ตั้งค่า Railway

1. สร้าง project → **Deploy from GitHub repo** → `roristada/remi-shop` branch `master` (หรือ branch ทดสอบก่อน)
2. Service → **Settings**
   - **Region:** Southeast Asia (Singapore) — ใกล้ Supabase `ap-southeast-1`
   - **Networking:** Generate Domain (ได้ `*.up.railway.app`) และ/หรือเพิ่ม Custom Domain
   - **Serverless / App Sleeping:** ปิด (ไม่งั้น request แรกหลังว่างจะช้า)
3. **Variables** — คัดลอกจาก `.env` (ทั้งหมดต้องมีก่อน build เพราะ `NEXT_PUBLIC_*` ถูกฝังตอน build และ `lib/env.ts` validate ด้วย zod):

| ตัวแปร | หมายเหตุ |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | เหมือนเดิม |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | เหมือนเดิม |
| `SUPABASE_SERVICE_ROLE_KEY` | server only |
| `DATABASE_URL` | pooler port **6543** (transaction) |
| `DIRECT_URL` | pooler port **5432** — ใช้แค่ตอนรัน migration/script แต่ใส่ไว้ด้วยเพราะ `prisma.config.ts` อ่าน |
| `RESEND_API_KEY`, `EMAIL_FROM` | เหมือน Netlify |
| `SLIPOK_BRANCH_ID`, `SLIPOK_API_KEY` | เหมือน Netlify |
| `NEXT_PUBLIC_PREVIEW_IMAGE_URL` | URL ของ preview Worker |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_FILES_BUCKET` | เหมือน Netlify |
| `NEXT_PUBLIC_SITE_URL` | **โดเมนใหม่** เช่น `https://remi-shop.up.railway.app` (ไม่มี `/` ท้าย) |

   > ค่า Resend / SlipOK / R2 ตอนนี้ยังไม่อยู่ใน `.env` เครื่องนี้ — ดึงจาก Netlify (Site configuration → Environment variables หรือ `netlify env:list --plain` ถ้ายังเข้าได้) หรือจาก dashboard ของแต่ละบริการ

4. Deploy แล้วดู build log: ต้องเห็น `prisma generate` สำเร็จ และ `next build` ไม่ error เรื่อง env

---

## 5. ตั้งค่าบริการภายนอก

### 5.1 Supabase (Authentication → URL Configuration)
- **Site URL:** โดเมนใหม่
- **Redirect URLs:** เพิ่ม `https://<โดเมนใหม่>/**` (เก็บของ Netlify ไว้จนย้ายเสร็จ แล้วค่อยลบ)
- Email templates (`supabase/templates/*.html`) ใช้ `{{ .SiteURL }}` / token-hash → ไม่ต้องแก้ ถ้า template ฝังโดเมนตรงๆ ให้แก้ด้วย

### 5.2 Cloudflare R2 — CORS (สำคัญ: ถ้าลืม อัปโหลดรูป/ไฟล์ในหน้า admin จะพัง)
Browser อัปโหลดตรงไป R2 ด้วย presigned PUT (`lib/storage/r2.ts` → `createR2Upload`) จึงต้องอนุญาต origin ใหม่ ทั้ง bucket `R2_BUCKET` และ `R2_FILES_BUCKET`:

R2 → bucket → Settings → CORS Policy
```json
[
  {
    "AllowedOrigins": ["https://<โดเมนใหม่>", "http://localhost:3000"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type", "cache-control"],
    "MaxAgeSeconds": 3600
  }
]
```
(ถ้า policy เดิมมีโดเมน Netlify อยู่ ให้ *เพิ่ม* โดเมนใหม่เข้าไป ไม่ต้องลบของเดิมจนย้ายเสร็จ)

### 5.3 Cloudflare Worker / DNS
- Preview Worker: ไม่ต้องแก้ (ไม่ได้ตรวจ origin)
- ถ้าใช้ custom domain ที่ DNS อยู่ใน Cloudflare: เพิ่ม CNAME ตามที่ Railway บอก ตั้งเป็น **DNS only (เมฆสีเทา)** จนกว่า Railway ออก certificate ให้เสร็จ แล้วค่อยเปิด proxy ได้ (SSL mode ต้องเป็น **Full**)

### 5.4 Resend / SlipOK
- Resend: ส่งจากโดเมน `EMAIL_FROM` เดิม ไม่ผูกกับ host — ไม่ต้องแก้
- SlipOK: เรียกจาก server ออกไป — ถ้าเคยตั้ง IP allowlist ไว้ ต้องเช็ค (Railway ไม่มี static outbound IP ใน Hobby)

---

## 6. ความเสี่ยงและวิธีรับมือ

| ความเสี่ยง | วิธีรับมือ |
| --- | --- |
| RAM ไม่พอตอน `sharp` ย่อ GIF ใหญ่ (50 MB) | ดู Metrics หลังลองอัปโหลด; ตั้ง memory limit ของ service ให้ ≥ 1 GB |
| Image cache หายทุก deploy | ยอมรับได้ (รูป preview ส่วนใหญ่เป็น `.card/.detail.webp` ที่ข้าม optimizer อยู่แล้ว); ถ้าช้า ค่อยเพิ่ม Volume ที่ `/app/.next/cache` |
| ลืม CORS ของ R2 | ทดสอบอัปโหลดใน admin ก่อนประกาศย้าย (ข้อ 7) |
| ลิงก์ยืนยันอีเมลที่ส่งไปก่อนย้ายยังชี้ Netlify | หลังย้าย ลิงก์เก่าจะพังถ้า Netlify ปิด — แจ้งลูกค้าให้ขอลิงก์ใหม่ หรือตั้ง redirect บน Netlify (ถ้ายังใช้ได้) |
| ค่าใช้จ่าย Railway เกิน | ตั้ง Usage Limit ใน Workspace → Usage |

---

## 7. ทดสอบหลัง deploy (ก่อนประกาศย้าย)

ใช้ `UAT_TEST_GUIDE_TH.md` เป็นหลัก อย่างน้อยต้องผ่าน:
- [ ] หน้าแรก `/th` และ `/en` โหลดได้, รูปสินค้าขึ้น (ทั้งจาก R2 Worker และ Supabase)
- [ ] สมัครสมาชิก → ลิงก์ในอีเมลกลับมาที่ **โดเมนใหม่** (AUTH-01, AUTH-02)
- [ ] ลืมรหัสผ่าน (AUTH-05)
- [ ] ใส่ตะกร้า → checkout → อัปโหลดสลิป (Supabase Storage) → SlipOK ตรวจ
- [ ] Admin: อัปโหลดรูปสินค้า (R2 presigned PUT + `/api/admin/images/optimize`) และไฟล์ดิจิทัล
- [ ] ลูกค้าดาวน์โหลดไฟล์ที่ซื้อ (`/api/download/[fileId]`)
- [ ] Export orders (`/admin/orders/export`)
- [ ] `railway logs` เห็น log `[security]` / `[slip]` ตามปกติ
- [ ] เช็ค latency: หน้าที่ query DB ควรเร็วขึ้นชัดเจนเมื่อเทียบกับ Netlify

---

## 8. Cutover และปิดงาน

1. ทดสอบข้อ 7 ผ่านทั้งหมด
2. (ถ้ามี custom domain) ย้าย DNS มาที่ Railway
3. อัปเดต `NEXT_PUBLIC_SITE_URL` เป็นโดเมนจริง → redeploy
4. ลบโดเมน Netlify ออกจาก Supabase Redirect URLs และ R2 CORS
5. ปิด auto-deploy ของ Netlify (หรือลบ site) — ถ้าไม่ปิด ทุก push จะ trigger build ฝั่ง Netlify
6. Merge branch `chore/railway-deploy` และอัปเดต `WORKLOG.md`

## 9. Rollback

ระหว่างทดสอบ ไซต์ Netlify ยังเป็นตัวจริง ไม่มีอะไรต้อง rollback
หลัง cutover ถ้ามีปัญหา: คืน Supabase Site URL + DNS ไป Netlify (ถ้ายังเปิดอยู่) — ข้อมูลอยู่ที่ Supabase/R2 ทั้งคู่ จึงไม่มีข้อมูลต้องย้ายกลับ
