"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormSection, SelectInput, TextArea, TextInput, runWithToast, useResultToast } from "@/components/admin/form-controls";
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
  startAt: "",
  endAt: "",
  isActive: true,
  imageUrl: null,
};

const THEMES = Object.entries(BANNER_THEME_LABEL_TH).map(([value, label]) => ({ value, label }));

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
            }}
          />
        </div>
        {bannerId ? (
          <BannerImageControls bannerId={bannerId} hasImage={Boolean(values.imageUrl)} />
        ) : (
          <p className="text-sm text-muted-foreground">บันทึกแบนเนอร์ก่อน แล้วจึงเพิ่มรูปได้</p>
        )}
        {preview.imageUrl && (
          <div className="grid gap-4 sm:grid-cols-2">
            <RangeField label="ตำแหน่งรูป แนวนอน" name="imageFocusX" value={preview.imageFocusX} onChange={(v) => set("imageFocusX", v)} />
            <RangeField label="ตำแหน่งรูป แนวตั้ง" name="imageFocusY" value={preview.imageFocusY} onChange={(v) => set("imageFocusY", v)} />
          </div>
        )}
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
          <SelectInput
            label="สีการ์ด"
            name="theme"
            options={THEMES}
            value={preview.theme}
            onValueChange={(v) => set("theme", v as BannerTheme)}
            error={err("theme")}
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

function RangeField({ label, name, value, onChange }: { label: string; name: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="space-y-1.5 text-sm">
      <span className="flex justify-between font-medium">
        {label} <span className="text-muted-foreground tabular-nums">{value}%</span>
      </span>
      <input
        type="range"
        name={name}
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-brand-strong"
      />
    </label>
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
