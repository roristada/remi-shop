"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormSection, SelectInput, TextInput } from "@/components/admin/form-controls";
import type { FieldErrors } from "@/lib/validation/auth";
import { saveContactChannels } from "@/lib/contacts/actions";
import {
  CONTACT_CHANNEL_TYPES,
  CONTACT_CHANNELS_MAX,
  CONTACT_LABEL_MAX,
  CONTACT_TYPE_ADMIN,
  CONTACT_VALUE_MAX,
  type ContactChannelInput,
} from "@/lib/contacts/rules";

type Row = ContactChannelInput & { key: string };

const TYPE_OPTIONS = CONTACT_CHANNEL_TYPES.map((t) => ({ value: t, label: CONTACT_TYPE_ADMIN[t].name }));

let nextKey = 0;
const newKey = () => `row-${nextKey++}`;

/** Edit the store's contact channels as one list: add, edit, reorder, remove, then save all. */
export function ContactChannelsForm({ channels }: { channels: ContactChannelInput[] }) {
  const [rows, setRows] = useState<Row[]>(() => channels.map((c) => ({ ...c, key: newKey() })));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, startTransition] = useTransition();

  function update(index: number, patch: Partial<ContactChannelInput>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    setErrors({});
  }

  function move(index: number, by: -1 | 1) {
    setRows((prev) => {
      const next = [...prev];
      const [row] = next.splice(index, 1);
      next.splice(index + by, 0, row);
      return next;
    });
    setErrors({});
  }

  function remove(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
    setErrors({});
  }

  function add() {
    setRows((prev) => [...prev, { type: "LINE", label: "", value: "", key: newKey() }]);
  }

  function save() {
    startTransition(async () => {
      const result = await saveContactChannels(rows.map(({ type, label, value }) => ({ type, label, value })));
      if (result.ok) {
        setErrors({});
        toast.success(result.message ?? "บันทึกแล้ว");
      } else {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
      }
    });
  }

  return (
    <FormSection
      title="ช่องทางติดต่อ"
      description="แสดงที่ท้ายเว็บทุกหน้าและหน้า “ติดต่อเรา” เรียงตามลำดับในรายการนี้ กดบันทึกเมื่อแก้เสร็จ"
    >
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          ยังไม่มีช่องทางติดต่อ
        </p>
      ) : (
        <ol className="space-y-3">
          {rows.map((row, i) => (
            <li key={row.key} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[10rem_minmax(0,12rem)_minmax(0,1fr)_auto] sm:items-start">
              <SelectInput
                label="ประเภท"
                options={TYPE_OPTIONS}
                value={row.type}
                onValueChange={(v) => update(i, { type: v as Row["type"] })}
                error={errors[`${i}.type`]}
              />
              <TextInput
                label="ชื่อที่แสดง"
                value={row.label}
                maxLength={CONTACT_LABEL_MAX}
                placeholder="@remii.shop"
                onChange={(e) => update(i, { label: e.target.value })}
                error={errors[`${i}.label`]}
              />
              <TextInput
                label={row.type === "EMAIL" ? "อีเมล" : row.type === "PHONE" ? "เบอร์โทร" : "ลิงก์"}
                value={row.value}
                maxLength={CONTACT_VALUE_MAX}
                placeholder={CONTACT_TYPE_ADMIN[row.type].placeholder}
                inputMode={row.type === "PHONE" ? "tel" : row.type === "EMAIL" ? "email" : "url"}
                onChange={(e) => update(i, { value: e.target.value })}
                error={errors[`${i}.value`]}
              />
              <div className="flex gap-1 sm:pt-6">
                <Button type="button" variant="ghost" size="icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label="เลื่อนขึ้น">
                  <ArrowUp aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={i === rows.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label="เลื่อนลง"
                >
                  <ArrowDown aria-hidden />
                </Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)} aria-label="ลบ">
                  <Trash2 aria-hidden className="text-destructive" />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
      {errors.form && <p className="text-sm text-destructive">{errors.form}</p>}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-10 rounded-full px-4"
          onClick={add}
          disabled={rows.length >= CONTACT_CHANNELS_MAX}
        >
          <Plus aria-hidden /> เพิ่มช่องทาง
        </Button>
        <Button type="button" className="h-10 rounded-full px-5" onClick={save} disabled={pending} aria-busy={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />} บันทึก
        </Button>
      </div>
    </FormSection>
  );
}
