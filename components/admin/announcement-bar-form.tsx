"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormSection, TextInput, useResultToast } from "@/components/admin/form-controls";
import type { ActionResult } from "@/lib/actions/result";
import { updateAnnouncementBar } from "@/lib/banners/actions";
import { ANNOUNCEMENT_BAR_MAX } from "@/lib/validation/banner";

type Values = { enabled: boolean; textTH: string; textEN: string; link: string };

export function AnnouncementBarForm({ values }: { values: Values }) {
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  useResultToast(state);
  const err = (name: string) => (state && !state.ok ? state.fieldErrors?.[name] : undefined);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => setState(await updateAnnouncementBar(state, formData)));
  }

  return (
    <FormSection
      title="แถบประกาศ"
      description="แถบเล็กด้านบนสุดของหน้าแรก เช่น แจ้งปิดปรับปรุงระบบ เหตุขัดข้อง หรือข่าวสำคัญของร้าน ลูกค้ากดปิดได้ และจะเห็นอีกครั้งเมื่อข้อความเปลี่ยน"
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="enabled" defaultChecked={values.enabled} className="size-4 accent-brand-strong" />
          แสดงแถบประกาศบนหน้าแรก
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <TextInput label="ข้อความ (TH)" name="textTH" maxLength={ANNOUNCEMENT_BAR_MAX} defaultValue={values.textTH} error={err("textTH")} />
          <TextInput
            label="ข้อความ (EN)"
            name="textEN"
            maxLength={ANNOUNCEMENT_BAR_MAX}
            defaultValue={values.textEN}
            hint="เว้นว่าง = ใช้ข้อความภาษาไทย"
            error={err("textEN")}
          />
          <TextInput
            label="ลิงก์ (ไม่บังคับ)"
            name="link"
            defaultValue={values.link}
            placeholder="/shop หรือ https://…"
            error={err("link")}
            wrapperClassName="md:col-span-2"
          />
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={pending} aria-busy={pending} className="h-10 rounded-full px-5">
            {pending && <Loader2 className="animate-spin" aria-hidden />} บันทึก
          </Button>
        </div>
      </form>
    </FormSection>
  );
}
