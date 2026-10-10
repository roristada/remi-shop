"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Loader2, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectInput, useResultToast } from "@/components/admin/form-controls";
import type { ActionResult } from "@/lib/actions/result";
import { updateRandomBannerSettings } from "@/lib/banners/actions";
import { RANDOM_BANNER_MAX } from "@/lib/banners/random";

type Props = {
  values: { enabled: boolean; count: number; folderId: string | null; fade: boolean; fullBlur: boolean };
  folders: { id: string; name: string }[];
};

/** Random product cards after the admin's own banners; a new pick on every home-page visit. */
export function RandomBannerForm({ values, folders }: Props) {
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(values.enabled);
  useResultToast(state);
  const err = (name: string) => (state && !state.ok ? state.fieldErrors?.[name] : undefined);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => setState(await updateRandomBannerSettings(state, formData)));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl bg-muted/50 p-4" noValidate>
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          name="enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="mt-1 size-4 accent-brand-strong"
        />
        <span>
          <span className="flex items-center gap-1.5 font-medium">
            <Shuffle className="size-4" aria-hidden /> สุ่มสินค้ามาแสดงด้วย
          </span>
          <span className="block text-sm text-muted-foreground">
            ต่อท้ายแบนเนอร์ที่สร้างเอง สุ่มใหม่ทุกครั้งที่เปิดหน้า จากสินค้าที่เปิดขายและมีรูป แสดงชื่อ ราคาจริง และปุ่มไปหน้าสินค้า
          </span>
        </span>
      </label>
      <div className="flex flex-wrap items-end gap-3 pl-7">
        <SelectInput
          label="จำนวน"
          name="count"
          defaultValue={String(values.count)}
          options={Array.from({ length: RANDOM_BANNER_MAX }, (_, i) => ({ value: String(i + 1), label: `${i + 1} ใบ` }))}
          wrapperClassName="w-28"
          error={err("count")}
        />
        <SelectInput
          label="สุ่มจาก"
          name="folderId"
          defaultValue={values.folderId ?? "all"}
          options={[{ value: "all", label: "สินค้าทั้งร้าน" }, ...folders.map((f) => ({ value: f.id, label: f.name }))]}
          wrapperClassName="min-w-56"
        />
        <label className="flex h-10 cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" name="fade" defaultChecked={values.fade} className="size-4 accent-brand-strong" />
          ไล่สีทับรูป
          <span className="text-xs text-muted-foreground">(ปิด = เห็นรูปเต็ม แต่ข้อความอาจอ่านยากบนรูปที่สีเข้ม)</span>
        </label>
        <label className="flex h-10 cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" name="fullBlur" defaultChecked={values.fullBlur} className="size-4 accent-brand-strong" />
          เบลอทั้งใบ ไล่น้ำหนัก
          <span className="text-xs text-muted-foreground">(ซ้ายเบลอมาก ค่อยๆ อ่อนไปทางขวา ขวาสุดยังเบลอบางๆ)</span>
        </label>
        <Button type="submit" variant="outline" disabled={pending} aria-busy={pending} className="h-10 rounded-full px-5">
          {pending && <Loader2 className="animate-spin" aria-hidden />} บันทึก
        </Button>
      </div>
    </form>
  );
}
