"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Ban, Check, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormSection, TextArea, TextInput, runWithToast, useResultToast } from "@/components/admin/form-controls";
import { DateTimeInput } from "@/components/admin/date-time-input";
import { useDirectUpload } from "@/components/admin/use-direct-upload";
import { BannerCard } from "@/components/shop/banner-card";
import type { ActionResult } from "@/lib/actions/result";
import {
  confirmBannerImageUpload,
  createBanner,
  removeBannerImage,
  requestBannerImageUpload,
  updateBanner,
} from "@/lib/banners/actions";
import { BANNER_THEME_LABEL_TH } from "@/lib/banners/rules";
import { BANNER_CTA_MAX, BANNER_TAG_MAX, BANNER_TITLE_MAX } from "@/lib/validation/banner";
import { acceptAttribute, IMAGE_FILE_TYPES } from "@/lib/storage/file-types";
import type { BannerTheme } from "@/lib/generated/prisma/enums";
import { FADE_DIRECTIONS, FADE_LABEL_TH, HEX_COLOR, THEME_FILL, type FadeDirection } from "@/lib/banners/look";
import { cn } from "@/lib/utils";

export type BannerFormValues = {
  titleTH: string;
  titleEN: string;
  descriptionTH: string;
  descriptionEN: string;
  ctaTH: string;
  ctaEN: string;
  link: string;
  theme: BannerTheme;
  imageFocusX: number;
  imageFocusY: number;
  /** Percent, 100–300. */
  imageZoom: number;
  /** Custom fill "#rrggbb"; "" = the theme colour. */
  bgColor: string;
  fadeDirection: FadeDirection;
  fadeStrength: number;
  tintImage: boolean;
  /** 0–100. */
  textBlur: number;
  fullBlur: boolean;
  /** `datetime-local` strings in Asia/Bangkok. */
  startAt: string;
  endAt: string;
  isActive: boolean;
  imageUrl: string | null;
};

export const EMPTY_BANNER: BannerFormValues = {
  titleTH: "",
  titleEN: "",
  descriptionTH: "",
  descriptionEN: "",
  ctaTH: "",
  ctaEN: "",
  link: "",
  theme: "PINK",
  imageFocusX: 50,
  imageFocusY: 50,
  imageZoom: 100,
  bgColor: "",
  fadeDirection: "LEFT",
  // New banners: a lighter fade with the progressive blur keeps more of the picture visible.
  fadeStrength: 60,
  tintImage: true,
  textBlur: 60,
  fullBlur: false,
  startAt: "",
  endAt: "",
  isActive: true,
  imageUrl: null,
};


/**
 * Create/edit one home-page banner with a live preview of the card. The picture is uploaded on
 * the edit page (it needs the banner's id), so a new banner is saved first, then opens for editing.
 */
export function BannerForm({ bannerId, values }: { bannerId: string | null; values: BannerFormValues }) {
  const router = useRouter();
  const [state, setState] = useState<ActionResult<unknown> | null>(null);
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState(values);
  useResultToast(state);

  const set = <K extends keyof BannerFormValues>(key: K, value: BannerFormValues[K]) => setPreview((p) => ({ ...p, [key]: value }));
  const err = (name: string) => (state && !state.ok ? state.fieldErrors?.[name] : undefined);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      if (bannerId) {
        setState(await updateBanner(bannerId, null, formData));
        router.refresh();
        return;
      }
      const result = await createBanner(null, formData);
      setState(result);
      if (result.ok) router.push(`/admin/banners/${result.data.id}`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <FormSection title="ตัวอย่าง" description="หน้าตาการ์ดตรงกลางบนหน้าแรก (ขนาดตัวอักษรจริงจะปรับตามหน้าจอ)">
        <div className="overflow-hidden rounded-[1.75rem] shadow-soft" style={{ aspectRatio: "920 / 340" }}>
          <BannerCard
            banner={{
              id: bannerId ?? "new",
              title: preview.titleTH || "หัวข้อแบนเนอร์",
              tag: preview.descriptionTH || null,
              cta: preview.ctaTH || null,
              theme: preview.theme,
              imageUrl: preview.imageUrl,
              focusX: preview.imageFocusX,
              focusY: preview.imageFocusY,
              zoom: preview.imageZoom,
              bgColor: HEX_COLOR.test(preview.bgColor) ? preview.bgColor : null,
              fadeDirection: preview.fadeDirection,
              fadeStrength: preview.fadeStrength,
              tintImage: preview.tintImage,
              textBlur: preview.textBlur,
              fullBlur: preview.fullBlur,
            }}
          />
        </div>
        {bannerId ? (
          <BannerImageControls bannerId={bannerId} hasImage={Boolean(values.imageUrl)} />
        ) : (
          <p className="text-sm text-muted-foreground">บันทึกแบนเนอร์ก่อน แล้วจึงเพิ่มรูปได้</p>
        )}
        {preview.imageUrl && (
          <ImageFraming
            imageUrl={preview.imageUrl}
            x={preview.imageFocusX}
            y={preview.imageFocusY}
            zoom={preview.imageZoom}
            onChange={(patch) => setPreview((p) => ({ ...p, ...patch }))}
          />
        )}
        <ColourAndFade
          values={preview}
          hasImage={Boolean(preview.imageUrl)}
          onChange={(patch) => setPreview((p) => ({ ...p, ...patch }))}
          error={err("bgColor")}
        />
      </FormSection>

      <FormSection title="ข้อความบนการ์ด" description="หัวข้อขึ้นบรรทัดใหม่ได้ ถ้าไม่กรอกภาษาอังกฤษจะใช้ภาษาไทย">
        <div className="grid gap-4 md:grid-cols-2">
          <TextArea
            label="หัวข้อ (TH)"
            name="titleTH"
            rows={2}
            maxLength={BANNER_TITLE_MAX}
            defaultValue={values.titleTH}
            onChange={(e) => set("titleTH", e.target.value)}
            error={err("titleTH")}
          />
          <TextArea label="หัวข้อ (EN)" name="titleEN" rows={2} maxLength={BANNER_TITLE_MAX} defaultValue={values.titleEN} error={err("titleEN")} />
          <TextInput
            label="ข้อความเล็กด้านบน (TH)"
            name="descriptionTH"
            maxLength={BANNER_TAG_MAX}
            defaultValue={values.descriptionTH}
            onChange={(e) => set("descriptionTH", e.target.value)}
            hint="เช่น เทมเพลต, โปรโมชัน — เว้นว่างได้"
            error={err("descriptionTH")}
          />
          <TextInput label="ข้อความเล็กด้านบน (EN)" name="descriptionEN" maxLength={BANNER_TAG_MAX} defaultValue={values.descriptionEN} error={err("descriptionEN")} />
          <TextInput
            label="ข้อความปุ่ม (TH)"
            name="ctaTH"
            maxLength={BANNER_CTA_MAX}
            defaultValue={values.ctaTH}
            onChange={(e) => set("ctaTH", e.target.value)}
            hint="เว้นว่าง = ไม่มีปุ่ม (การ์ดยังกดได้ถ้ามีลิงก์)"
            error={err("ctaTH")}
          />
          <TextInput label="ข้อความปุ่ม (EN)" name="ctaEN" maxLength={BANNER_CTA_MAX} defaultValue={values.ctaEN} error={err("ctaEN")} />
          <TextInput
            label="ลิงก์เมื่อกดการ์ด"
            name="link"
            defaultValue={values.link}
            placeholder="/shop หรือ https://…"
            hint="หน้าในเว็บ: ขึ้นต้นด้วย / เช่น /shop?sort=best-selling"
            error={err("link")}
            wrapperClassName="md:col-span-2"
          />
        </div>
      </FormSection>

      <FormSection title="การแสดงผล" description="เว้นว่างวันเวลา = แสดงทันทีและไม่มีกำหนดสิ้นสุด">
        <div className="grid gap-4 md:grid-cols-2">
          <DateTimeInput label="เริ่มแสดง" name="startAt" defaultValue={values.startAt} error={err("startAt")} />
          <DateTimeInput label="สิ้นสุด" name="endAt" defaultValue={values.endAt} defaultTime="23:59" error={err("endAt")} />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" defaultChecked={values.isActive} className="size-4 accent-brand-strong" />
          เปิดใช้งานแบนเนอร์นี้
        </label>
      </FormSection>

      {!preview.imageUrl && (
        <>
          <input type="hidden" name="imageFocusX" value={preview.imageFocusX} />
          <input type="hidden" name="imageFocusY" value={preview.imageFocusY} />
          <input type="hidden" name="imageZoom" value={preview.imageZoom} />
        </>
      )}

      <div className="flex justify-end">
        <Button type="submit" className="h-10 rounded-full px-6" disabled={pending} aria-busy={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />} {bannerId ? "บันทึก" : "สร้างแบนเนอร์"}
        </Button>
      </div>
    </form>
  );
}

/** The card's shape (width ÷ height), same as the carousel and the preview above. */
const CARD_RATIO = 920 / 340;

/**
 * Zoom and position sliders. With object-cover a picture only overflows the card on one axis, so
 * the other position slider does nothing until the picture is zoomed in; that slider says so.
 */
function ImageFraming({
  imageUrl,
  x,
  y,
  zoom,
  onChange,
}: {
  imageUrl: string;
  x: number;
  y: number;
  zoom: number;
  onChange: (patch: Partial<Pick<BannerFormValues, "imageFocusX" | "imageFocusY" | "imageZoom">>) => void;
}) {
  const [ratio, setRatio] = useState<number | null>(null);
  useEffect(() => {
    const img = new window.Image();
    img.onload = () => setRatio(img.naturalWidth / img.naturalHeight);
    img.src = imageUrl;
  }, [imageUrl]);
  // Narrower than the card → fills its width, overflows only vertically (and vice versa).
  const xMoves = zoom > 100 || (ratio !== null && ratio > CARD_RATIO + 0.01);
  const yMoves = zoom > 100 || (ratio !== null && ratio < CARD_RATIO - 0.01);
  const zoomHint = "ซูมเข้าก่อนจึงเลื่อนแนวนี้ได้ (รูปพอดีการ์ดในแนวนี้แล้ว)";

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <RangeField
        label="ซูม"
        name="imageZoom"
        min={100}
        max={300}
        value={zoom}
        onChange={(v) => onChange({ imageZoom: v })}
        hint={zoom > 100 ? undefined : "100% = รูปเต็มการ์ดพอดี"}
      />
      <RangeField
        label="ตำแหน่งรูป แนวนอน"
        name="imageFocusX"
        value={x}
        onChange={(v) => onChange({ imageFocusX: v })}
        hint={ratio !== null && !xMoves ? zoomHint : undefined}
        muted={ratio !== null && !xMoves}
      />
      <RangeField
        label="ตำแหน่งรูป แนวตั้ง"
        name="imageFocusY"
        value={y}
        onChange={(v) => onChange({ imageFocusY: v })}
        hint={ratio !== null && !yMoves ? zoomHint : undefined}
        muted={ratio !== null && !yMoves}
      />
    </div>
  );
}

function RangeField({
  label,
  name,
  value,
  onChange,
  min = 0,
  max = 100,
  hint,
  muted = false,
}: {
  label: string;
  name: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  hint?: string;
  muted?: boolean;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5 text-sm">
      <label htmlFor={id} className="flex justify-between font-medium">
        {label} <span className="text-muted-foreground tabular-nums">{value}%</span>
      </label>
      <input
        id={id}
        type="range"
        name={name}
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={cn("w-full accent-brand-strong", muted && "opacity-50")}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

function BannerImageControls({ bannerId, hasImage }: { bannerId: string; hasImage: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const { upload, uploading } = useDirectUpload(
    (input) => requestBannerImageUpload(bannerId, input),
    (input) => confirmBannerImageUpload(bannerId, input),
  );

  return (
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
        {hasImage ? "เปลี่ยนรูป" : "เพิ่มรูป"}
      </Button>
      {hasImage && (
        <Button
          type="button"
          variant="ghost"
          className={cn("rounded-full text-destructive")}
          onClick={async () => {
            if (await runWithToast(() => removeBannerImage(bannerId))) router.refresh();
          }}
        >
          <Trash2 aria-hidden /> ลบรูป
        </Button>
      )}
      <span className="text-xs text-muted-foreground">JPG, PNG, WEBP ไม่เกิน 5 MB · แนะนำภาพแนวนอนกว้างอย่างน้อย 1600 px</span>
    </div>
  );
}

type LookPatch = Partial<Pick<BannerFormValues, "theme" | "bgColor" | "fadeDirection" | "fadeStrength" | "tintImage" | "textBlur" | "fullBlur">>;

/** The presets as a colour wheel: the "pick any colour" swatch. */
const PRESET_WHEEL = `conic-gradient(${[...Object.values(THEME_FILL), THEME_FILL.PINK].join(", ")})`;

const FADE_ICON = { LEFT: ArrowRight, RIGHT: ArrowLeft, TOP: ArrowDown, BOTTOM: ArrowUp, NONE: Ban } as const;

/** Card colour (a preset or any colour) and the colour fade laid over the picture. */
function ColourAndFade({
  values: v,
  hasImage,
  onChange,
  error,
}: {
  values: BannerFormValues;
  hasImage: boolean;
  onChange: (patch: LookPatch) => void;
  error?: string;
}) {
  const custom = v.bgColor !== "";
  const pickerValue = HEX_COLOR.test(v.bgColor) ? v.bgColor : THEME_FILL[v.theme];
  const swatch = "relative grid size-9 place-items-center rounded-full ring-1 ring-foreground/10 transition-shadow focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/80";

  return (
    <div className="space-y-5 border-t pt-5">
      <input type="hidden" name="theme" value={v.theme} />
      <input type="hidden" name="bgColor" value={v.bgColor} />
      <input type="hidden" name="fadeDirection" value={v.fadeDirection} />

      <div className="space-y-2">
        <p className="text-sm font-medium">สีการ์ด</p>
        <div role="radiogroup" aria-label="สีการ์ด" className="flex flex-wrap items-center gap-2">
          {(Object.keys(THEME_FILL) as BannerTheme[]).map((t) => {
            const on = !custom && v.theme === t;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={BANNER_THEME_LABEL_TH[t]}
                title={BANNER_THEME_LABEL_TH[t]}
                onClick={() => onChange({ theme: t, bgColor: "" })}
                className={cn(swatch, on && "ring-2 ring-foreground")}
                style={{ backgroundColor: THEME_FILL[t] }}
              >
                {on && <Check className="size-4 text-[#2a1f2d]" aria-hidden />}
              </button>
            );
          })}
          <span aria-hidden className="mx-1 h-6 w-px bg-border" />
          <label
            className={cn(swatch, "cursor-pointer overflow-hidden", custom && "ring-2 ring-foreground")}
            title="เลือกสีเอง"
            style={{
              background: custom ? pickerValue : PRESET_WHEEL,
            }}
          >
            <span className="sr-only">เลือกสีเอง</span>
            <input
              type="color"
              value={pickerValue}
              onChange={(e) => onChange({ bgColor: e.target.value })}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            />
          </label>
          <input
            aria-label="รหัสสี"
            value={v.bgColor}
            onChange={(e) => onChange({ bgColor: e.target.value.trim() })}
            placeholder="#rrggbb"
            maxLength={7}
            className={cn(
              "h-9 w-28 rounded-xl border border-input bg-background px-3 font-mono text-sm uppercase",
              error && "border-destructive",
            )}
          />
        </div>
        <p className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")}>
          {error ?? "สีสำเร็จรูปปรับเป็นโทนเข้มให้เองในโหมดมืด สีที่เลือกเองใช้สีเดิมทุกโหมด ตัวอักษรเปลี่ยนขาว/เข้มให้อ่านง่ายอัตโนมัติ"}
        </p>
      </div>

      {hasImage && (
        <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start sm:gap-8">
          <div className="space-y-2">
            <p className="text-sm font-medium">ไล่สีจากด้าน</p>
            <div role="radiogroup" aria-label="ไล่สีจากด้าน" className="flex flex-wrap gap-1 rounded-full bg-muted p-1">
              {FADE_DIRECTIONS.map((d) => {
                const Icon = FADE_ICON[d];
                const on = v.fadeDirection === d;
                return (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => onChange({ fadeDirection: d })}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm transition-colors",
                      on ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="size-3.5" aria-hidden /> {FADE_LABEL_TH[d]}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-3">
            <RangeField
              label="ความเข้มของการไล่สี"
              name="fadeStrength"
              value={v.fadeStrength}
              onChange={(n) => onChange({ fadeStrength: n })}
              muted={v.fadeDirection === "NONE"}
              hint={v.fadeDirection === "NONE" ? "เลือกด้านที่จะไล่สีก่อน" : "ยิ่งเข้ม ข้อความยิ่งอ่านง่ายบนรูป"}
            />
            <RangeField
              label="เบลอฝั่งข้อความ"
              name="textBlur"
              value={v.textBlur}
              onChange={(n) => onChange({ textBlur: n })}
              hint="เบลอรูปเฉพาะด้านซ้ายหลังข้อความ ให้ตัวอักษรเด่นขึ้น · 0 = ไม่เบลอ"
            />
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="fullBlur"
                checked={v.fullBlur}
                onChange={(e) => onChange({ fullBlur: e.target.checked })}
                className="mt-0.5 size-4 accent-brand-strong"
              />
              <span>
                เบลอทั้งใบ ไล่น้ำหนักซ้ายไปขวา
                <span className="block text-xs text-muted-foreground">ซ้ายเบลอตามแถบด้านบน แล้วค่อยๆ อ่อนลงไปทางขวา แต่ขวาสุดยังเบลอบางๆ ไม่คมเต็ม</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="tintImage"
                checked={v.tintImage}
                onChange={(e) => onChange({ tintImage: e.target.checked })}
                className="size-4 accent-brand-strong"
              />
              ย้อมสีการ์ดลงในรูป (ปิดเพื่อให้รูปเป็นสีจริง)
            </label>
          </div>
        </div>
      )}
      {!hasImage && (
        <>
          <input type="hidden" name="fadeStrength" value={v.fadeStrength} />
          <input type="hidden" name="textBlur" value={v.textBlur} />
          {v.fullBlur && <input type="hidden" name="fullBlur" value="on" />}
          {v.tintImage && <input type="hidden" name="tintImage" value="on" />}
        </>
      )}
    </div>
  );
}
