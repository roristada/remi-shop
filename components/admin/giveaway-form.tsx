"use client";

import { useMemo, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ExternalLink, ImageOff, ImagePlus, Loader2, Lock, Plus, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormSection, TextArea, TextInput, runWithToast, useResultToast } from "@/components/admin/form-controls";
import { DateTimeInput } from "@/components/admin/date-time-input";
import { useDirectUpload } from "@/components/admin/use-direct-upload";
import { PreviewImage } from "@/components/shared/preview-image";
import type { ActionResult } from "@/lib/actions/result";
import {
  confirmGiveawayImageUpload,
  createGiveaway,
  removeGiveawayImage,
  requestGiveawayImageUpload,
  updateGiveaway,
} from "@/lib/giveaways/admin-actions";
import type { PrizeCandidate } from "@/lib/giveaways/admin-queries";
import { GIVEAWAY_DESCRIPTION_MAX, GIVEAWAY_PRIZES_MAX, GIVEAWAY_TITLE_MAX, GIVEAWAY_WINNERS_MAX } from "@/lib/validation/giveaway";
import { acceptAttribute, IMAGE_FILE_TYPES } from "@/lib/storage/file-types";
import { formatTHB } from "@/lib/pricing/calculate";
import { cn } from "@/lib/utils";

export type GiveawayFormValues = {
  slug: string;
  titleTH: string;
  titleEN: string;
  descriptionTH: string;
  descriptionEN: string;
  /** `datetime-local` strings in Asia/Bangkok. */
  startsAt: string;
  endsAt: string;
  isPublished: boolean;
  imageUrl: string | null;
  prizes: PrizeLine[];
};

type PrizeLine = { productId: string; variantId: string | null; winnerCount: number };

export const EMPTY_GIVEAWAY: GiveawayFormValues = {
  slug: "",
  titleTH: "",
  titleEN: "",
  descriptionTH: "",
  descriptionEN: "",
  startsAt: "",
  endsAt: "",
  isPublished: false,
  imageUrl: null,
  prizes: [],
};

const keyOf = (p: { productId: string; variantId: string | null }) => `${p.productId}:${p.variantId ?? ""}`;

/**
 * Create/edit a giveaway: texts, registration window, publish switch and prizes. The picture is
 * added on the edit page (it needs the giveaway's id). After the first draw the prizes and dates are locked.
 */
export function GiveawayForm({
  giveawayId,
  values,
  candidates,
  locked,
}: {
  giveawayId: string | null;
  values: GiveawayFormValues;
  candidates: PrizeCandidate[];
  /** Drawn: only texts and slug can change. */
  locked: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<ActionResult<unknown> | null>(null);
  const [pending, startTransition] = useTransition();
  const [prizes, setPrizes] = useState<PrizeLine[]>(values.prizes);
  useResultToast(state);
  const err = (name: string) => (state && !state.ok ? state.fieldErrors?.[name] : undefined);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      if (giveawayId) {
        setState(await updateGiveaway(giveawayId, null, formData));
        router.refresh();
        return;
      }
      const result = await createGiveaway(null, formData);
      setState(result);
      if (result.ok) router.push(`/admin/giveaways/${result.data.id}`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <FormSection title="รายละเอียดกิจกรรม" description="ข้อความที่ลูกค้าเห็นในหน้ากิจกรรม">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="ชื่อกิจกรรม (ไทย)" name="titleTH" defaultValue={values.titleTH} maxLength={GIVEAWAY_TITLE_MAX} error={err("titleTH")} />
          <TextInput label="ชื่อกิจกรรม (English)" name="titleEN" defaultValue={values.titleEN} maxLength={GIVEAWAY_TITLE_MAX} error={err("titleEN")} />
        </div>
        <TextInput
          label="Slug (ลิงก์ของหน้า)"
          name="slug"
          defaultValue={values.slug}
          placeholder="เช่น halloween-2026"
          hint="ใช้ a-z, 0-9 และ - เท่านั้น · ลิงก์จะเป็น /giveaways/slug"
          error={err("slug")}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextArea
            label="รายละเอียด / กติกา (ไทย)"
            name="descriptionTH"
            defaultValue={values.descriptionTH}
            maxLength={GIVEAWAY_DESCRIPTION_MAX}
            className="min-h-36"
            error={err("descriptionTH")}
          />
          <TextArea
            label="รายละเอียด / กติกา (English)"
            name="descriptionEN"
            defaultValue={values.descriptionEN}
            maxLength={GIVEAWAY_DESCRIPTION_MAX}
            className="min-h-36"
            error={err("descriptionEN")}
          />
        </div>
      </FormSection>

      <FormSection title="รูปกิจกรรม" description="แสดงบนการ์ดและหัวหน้ากิจกรรม">
        {giveawayId ? (
          <GiveawayImageControls giveawayId={giveawayId} imageUrl={values.imageUrl} />
        ) : (
          <p className="text-sm text-muted-foreground">บันทึกกิจกรรมก่อน แล้วจึงเพิ่มรูปได้</p>
        )}
      </FormSection>

      <FormSection
        title="ช่วงเวลาลงทะเบียน"
        description="ลูกค้าลงทะเบียนได้ระหว่างเวลาเปิดถึงเวลาปิด หลังปิดแล้วกดสุ่มผู้โชคดีได้ที่หน้านี้"
      >
        {locked ? (
          <LockedNote>สุ่มผู้โชคดีแล้ว เปลี่ยนช่วงเวลาและสถานะการเผยแพร่ไม่ได้</LockedNote>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <DateTimeInput label="เปิดลงทะเบียน" name="startsAt" defaultValue={values.startsAt} error={err("startsAt")} />
              <DateTimeInput label="ปิดลงทะเบียน" name="endsAt" defaultValue={values.endsAt} defaultTime="23:59" error={err("endsAt")} />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" name="isPublished" defaultChecked={values.isPublished} className="size-4 accent-brand-strong" />
              เผยแพร่ (ลูกค้าเห็นกิจกรรมนี้)
            </label>
          </>
        )}
        {/* Locked: the server keeps the stored window; these only satisfy the form schema. */}
        {locked && (
          <>
            <input type="hidden" name="startsAt" value={values.startsAt} />
            <input type="hidden" name="endsAt" value={values.endsAt} />
            {values.isPublished && <input type="hidden" name="isPublished" value="on" />}
          </>
        )}
      </FormSection>

      <FormSection
        title="รางวัล"
        description="เลือกจากสินค้าที่มีอยู่ ของแจกเฉพาะกิจกรรมให้สร้างเป็นสินค้าแล้วตั้งเป็น &quot;ฉบับร่าง&quot; ไว้ (ไม่แสดงในร้าน) ลูกค้า 1 คนได้รางวัลเดียว"
      >
        <input type="hidden" name="prizes" value={JSON.stringify(prizes)} />
        <PrizeEditor prizes={prizes} onChange={setPrizes} candidates={candidates} locked={locked} error={err("prizes")} />
      </FormSection>

      <div className="flex justify-end">
        <Button type="submit" className="h-10 rounded-full px-6" disabled={pending} aria-busy={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />} {giveawayId ? "บันทึก" : "สร้างกิจกรรม"}
        </Button>
      </div>
    </form>
  );
}

function LockedNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
      <Lock className="size-4 shrink-0" aria-hidden /> {children}
    </p>
  );
}

function GiveawayImageControls({ giveawayId, imageUrl }: { giveawayId: string; imageUrl: string | null }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const { upload, uploading } = useDirectUpload(
    (input) => requestGiveawayImageUpload(giveawayId, input),
    (input) => confirmGiveawayImageUpload(giveawayId, input),
  );

  return (
    <div className="flex flex-wrap items-center gap-4">
      <span className="relative grid aspect-[4/3] w-48 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted">
        {imageUrl ? (
          <PreviewImage src={imageUrl} alt="" fill sizes="192px" className="object-cover" />
        ) : (
          <ImageOff className="size-6 text-muted-foreground" aria-hidden />
        )}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept={acceptAttribute(IMAGE_FILE_TYPES)}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={async (e) => {
            const files = e.target.files;
            if (files?.length && (await upload([files[0]]))) router.refresh();
            e.target.value = "";
          }}
        />
        <Button type="button" variant="outline" className="rounded-full" disabled={Boolean(uploading)} onClick={() => fileRef.current?.click()}>
          {uploading ? <Loader2 className="animate-spin" aria-hidden /> : <ImagePlus aria-hidden />}
          {imageUrl ? "เปลี่ยนรูป" : "เพิ่มรูป"}
        </Button>
        {imageUrl && (
          <Button
            type="button"
            variant="ghost"
            className="rounded-full text-destructive"
            onClick={async () => {
              if (await runWithToast(() => removeGiveawayImage(giveawayId))) router.refresh();
            }}
          >
            <Trash2 aria-hidden /> ลบรูป
          </Button>
        )}
        <span className="w-full text-xs text-muted-foreground">JPG, PNG, WEBP ไม่เกิน 5 MB · แนะนำภาพแนวนอน 4:3</span>
      </div>
    </div>
  );
}

const iconButton =
  "grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30";

function PrizeEditor({
  prizes,
  onChange,
  candidates,
  locked,
  error,
}: {
  prizes: PrizeLine[];
  onChange: (next: PrizeLine[]) => void;
  candidates: PrizeCandidate[];
  locked: boolean;
  error?: string;
}) {
  const byKey = useMemo(() => new Map(candidates.map((c) => [c.key, c])), [candidates]);
  const [picking, setPicking] = useState(false);
  const total = prizes.reduce((n, p) => n + p.winnerCount, 0);

  const update = (i: number, patch: Partial<PrizeLine>) => onChange(prizes.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const move = (i: number, to: number) => {
    const next = [...prizes];
    [next[i], next[to]] = [next[to], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {locked && <LockedNote>สุ่มผู้โชคดีแล้ว แก้ไขรางวัลไม่ได้</LockedNote>}
      {prizes.length === 0 ? (
        <p className="rounded-xl bg-muted px-4 py-6 text-center text-sm text-muted-foreground">ยังไม่มีรางวัล</p>
      ) : (
        <ol className="divide-y rounded-xl border">
          {prizes.map((p, i) => {
            const c = byKey.get(keyOf(p));
            return (
              <li key={keyOf(p)} className="flex flex-wrap items-center gap-3 px-3 py-2.5 sm:flex-nowrap">
                <span className="w-5 text-center text-sm text-muted-foreground tabular-nums">{i + 1}</span>
                <Thumb url={c?.imageUrl ?? null} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {c ? c.name : "(สินค้าถูกลบ)"}
                    {c?.variantName && <span className="text-muted-foreground"> · {c.variantName}</span>}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    มูลค่า {c ? formatTHB(c.price) : "-"}
                    {c && c.status !== "ACTIVE" && " · ไม่ได้เปิดขาย (แจกได้)"}
                  </span>
                </span>
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">ผู้ชนะ</span>
                  <Input
                    type="number"
                    min={1}
                    max={GIVEAWAY_WINNERS_MAX}
                    value={p.winnerCount}
                    disabled={locked}
                    onChange={(e) => update(i, { winnerCount: Math.max(1, Math.min(GIVEAWAY_WINNERS_MAX, Number(e.target.value) || 1)) })}
                    className="h-9 w-20 rounded-lg"
                    aria-label={`จำนวนผู้ชนะของ ${c?.name ?? "รางวัลนี้"}`}
                  />
                  <span className="text-muted-foreground">คน</span>
                </label>
                {!locked && (
                  <div className="flex items-center">
                    <button type="button" className={iconButton} disabled={i === 0} aria-label="เลื่อนขึ้น" onClick={() => move(i, i - 1)}>
                      <ArrowUp className="size-4" aria-hidden />
                    </button>
                    <button type="button" className={iconButton} disabled={i === prizes.length - 1} aria-label="เลื่อนลง" onClick={() => move(i, i + 1)}>
                      <ArrowDown className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={cn(iconButton, "hover:text-destructive")}
                      aria-label={`เอา ${c?.name ?? "รางวัลนี้"} ออก`}
                      onClick={() => onChange(prizes.filter((_, j) => j !== i))}
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {prizes.length > 0 && <p className="text-xs text-muted-foreground">ผู้ชนะทั้งหมด {total} คน · สุ่มตามลำดับรางวัลจากบนลงล่าง</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}

      {!locked &&
        (picking ? (
          <PrizePicker
            candidates={candidates}
            chosen={new Set(prizes.map(keyOf))}
            full={prizes.length >= GIVEAWAY_PRIZES_MAX}
            onPick={(c) => onChange([...prizes, { productId: c.productId, variantId: c.variantId, winnerCount: 1 }])}
            onClose={() => setPicking(false)}
          />
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setPicking(true)} disabled={prizes.length >= GIVEAWAY_PRIZES_MAX}>
              <Plus aria-hidden /> เพิ่มรางวัล
            </Button>
            <Button asChild variant="ghost" className="rounded-full">
              <a href="/admin/products/new" target="_blank" rel="noopener">
                <ExternalLink aria-hidden /> สร้างสินค้าใหม่ (แท็บใหม่)
              </a>
            </Button>
          </div>
        ))}
    </div>
  );
}

function PrizePicker({
  candidates,
  chosen,
  full,
  onPick,
  onClose,
}: {
  candidates: PrizeCandidate[];
  chosen: ReadonlySet<string>;
  full: boolean;
  onPick: (c: PrizeCandidate) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visible = candidates.filter((c) => !q || `${c.name} ${c.variantName ?? ""}`.toLowerCase().includes(q)).slice(0, 100);

  return (
    <div className="space-y-2 rounded-xl border p-2">
      <div className="flex items-center gap-2">
        <label className="relative block flex-1">
          <span className="sr-only">ค้นหาสินค้า</span>
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาชื่อสินค้า"
            className="h-9 rounded-xl pl-9"
          />
        </label>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          ปิด
        </Button>
      </div>
      {visible.length === 0 ? (
        <p className="px-2 py-6 text-center text-sm text-muted-foreground">ไม่พบสินค้า (สินค้าที่เพิ่งสร้างในแท็บอื่น ให้รีเฟรชหน้านี้)</p>
      ) : (
        <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border">
          {visible.map((c) => {
            const added = chosen.has(c.key);
            return (
              <li key={c.key} className="flex items-center gap-3 px-3 py-2">
                <Thumb url={c.imageUrl} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">
                    {c.name}
                    {c.variantName && <span className="text-muted-foreground"> · {c.variantName}</span>}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {formatTHB(c.price)}
                    {c.status !== "ACTIVE" && " · ไม่ได้เปิดขาย"}
                  </span>
                </span>
                <Button type="button" size="sm" variant={added ? "ghost" : "outline"} className="rounded-full" disabled={added || full} onClick={() => onPick(c)}>
                  {added ? "เพิ่มแล้ว" : "เพิ่ม"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Thumb({ url }: { url: string | null }) {
  return (
    <span className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">
      {url ? <PreviewImage src={url} alt="" fill sizes="36px" className="object-cover" /> : <ImageOff className="size-4 text-muted-foreground" aria-hidden />}
    </span>
  );
}
