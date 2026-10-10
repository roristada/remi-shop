"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { runWithToast, SelectInput, TextArea, TextInput } from "@/components/admin/form-controls";
import { deleteFormField, moveFormField, saveFormField } from "@/lib/licenses/form-actions";
import { FIELD_LIMITS, isChoiceType, type FieldOption } from "@/lib/licenses/form-fields";
import type { LicenseFieldType } from "@/lib/generated/prisma/enums";
import type { FieldErrors } from "@/lib/validation/auth";
import { cn } from "@/lib/utils";

export type BuilderField = {
  id: string;
  key: string | null;
  labelTH: string;
  labelEN: string;
  descriptionTH: string;
  descriptionEN: string;
  type: LicenseFieldType;
  isRequired: boolean;
  isActive: boolean;
  options: FieldOption[];
  answerCount: number;
};

export const FIELD_TYPE_LABEL: Record<LicenseFieldType, string> = {
  TEXT: "ข้อความสั้น",
  TEXTAREA: "ข้อความยาว",
  EMAIL: "อีเมล",
  RADIO: "ตัวเลือก (เลือกได้ 1)",
  CHECKBOX: "Checkbox (เลือกได้หลายข้อ)",
  DROPDOWN: "Dropdown (เลือกได้ 1)",
};
const TEXT_TYPES: LicenseFieldType[] = ["TEXT", "TEXTAREA", "EMAIL"];

const EMPTY: BuilderField = {
  id: "",
  key: null,
  labelTH: "",
  labelEN: "",
  descriptionTH: "",
  descriptionEN: "",
  type: "TEXT",
  isRequired: false,
  isActive: true,
  options: [],
  answerCount: 0,
};

const iconButton =
  "grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30";

/** Admin editor for the commercial-license request form: questions, kinds, choices, order. */
export function LicenseFormBuilder({ fields }: { fields: BuilderField[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<BuilderField | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (action: () => ReturnType<typeof moveFormField>) =>
    startTransition(async () => {
      if (await runWithToast(action)) router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button className="h-10 rounded-full px-5" onClick={() => setEditing(EMPTY)}>
          <Plus aria-hidden /> เพิ่มช่องข้อมูล
        </Button>
      </div>

      <ol className="divide-y overflow-hidden rounded-2xl border bg-card shadow-soft">
        {fields.map((f, i) => (
          <li key={f.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-3", !f.isActive && "bg-muted/50")}>
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className={cn("font-medium", !f.isActive && "text-muted-foreground")}>
                {f.labelTH}
                {f.isRequired && <span className="text-destructive"> *</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                {FIELD_TYPE_LABEL[f.type]}
                {isChoiceType(f.type) && ` · ${f.options.length} ตัวเลือก`}
                {f.key && " · ช่องพื้นฐาน"}
                {!f.isActive && " · ปิดใช้งาน"}
                {f.answerCount > 0 && ` · ตอบแล้ว ${f.answerCount} คำขอ`}
              </p>
            </div>
            <div className="flex items-center gap-0.5">
              {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />}
              <button type="button" className={iconButton} disabled={i === 0 || pending} aria-label={`เลื่อน ${f.labelTH} ขึ้น`} onClick={() => run(() => moveFormField(f.id, "up"))}>
                <ArrowUp className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                className={iconButton}
                disabled={i === fields.length - 1 || pending}
                aria-label={`เลื่อน ${f.labelTH} ลง`}
                onClick={() => run(() => moveFormField(f.id, "down"))}
              >
                <ArrowDown className="size-4" aria-hidden />
              </button>
              <button type="button" className={iconButton} aria-label={`แก้ไข ${f.labelTH}`} onClick={() => setEditing(f)}>
                <Pencil className="size-4" aria-hidden />
              </button>
              {!f.key && (
                <ConfirmDialog
                  title="ลบช่องข้อมูลนี้?"
                  description={
                    f.answerCount > 0
                      ? `คำขอเดิม ${f.answerCount} รายการยังเก็บคำตอบของ "${f.labelTH}" ไว้ในประวัติ แต่ฟอร์มจะไม่ถามอีก`
                      : `"${f.labelTH}" จะหายจากฟอร์มขอ License`
                  }
                  confirmLabel="ลบ"
                  destructive
                  onConfirm={async () => {
                    if (await runWithToast(() => deleteFormField(f.id))) router.refresh();
                  }}
                  trigger={
                    <button type="button" className={cn(iconButton, "hover:text-destructive")} aria-label={`ลบ ${f.labelTH}`}>
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  }
                />
              )}
            </div>
          </li>
        ))}
      </ol>

      {editing && <FieldDialog key={editing.id || "new"} field={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function FieldDialog({ field, onClose }: { field: BuilderField; onClose: () => void }) {
  const router = useRouter();
  const [type, setType] = useState<LicenseFieldType>(field.type);
  const [options, setOptions] = useState<FieldOption[]>(field.options.length > 0 ? field.options : []);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, startTransition] = useTransition();
  const isNew = field.id === "";
  const choice = isChoiceType(type);
  const typeOptions = (field.key ? TEXT_TYPES : (Object.keys(FIELD_TYPE_LABEL) as LicenseFieldType[])).map((t) => ({
    value: t,
    label: FIELD_TYPE_LABEL[t],
  }));

  function submit(form: FormData) {
    const text = (n: string) => String(form.get(n) ?? "");
    startTransition(async () => {
      const result = await saveFormField(isNew ? null : field.id, {
        labelTH: text("labelTH"),
        labelEN: text("labelEN"),
        descriptionTH: text("descriptionTH"),
        descriptionEN: text("descriptionEN"),
        type,
        isRequired: form.get("isRequired") === "on",
        isActive: form.get("isActive") === "on",
        options: choice ? options : [],
      });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "บันทึกแล้ว");
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !pending && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isNew ? "เพิ่มช่องข้อมูล" : "แก้ไขช่องข้อมูล"}</DialogTitle>
          <DialogDescription>
            คำขอที่ส่งไปแล้วเก็บคำถามและคำตอบตามที่เห็นตอนส่ง การแก้ที่นี่มีผลกับคำขอใหม่และการแก้ไขครั้งถัดไป
          </DialogDescription>
        </DialogHeader>
        <form
          id="license-field-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit(new FormData(e.currentTarget));
          }}
          noValidate
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="ชื่อช่อง (ไทย)" name="labelTH" defaultValue={field.labelTH} maxLength={FIELD_LIMITS.label} error={errors.labelTH} />
            <TextInput label="ชื่อช่อง (English)" name="labelEN" defaultValue={field.labelEN} maxLength={FIELD_LIMITS.label} hint="เว้นว่าง = ใช้ภาษาไทย" error={errors.labelEN} />
            <TextArea label="คำอธิบาย (ไทย)" name="descriptionTH" rows={2} defaultValue={field.descriptionTH} maxLength={FIELD_LIMITS.description} error={errors.descriptionTH} />
            <TextArea label="คำอธิบาย (English)" name="descriptionEN" rows={2} defaultValue={field.descriptionEN} maxLength={FIELD_LIMITS.description} error={errors.descriptionEN} />
          </div>
          <SelectInput
            label="ประเภทข้อมูล"
            options={typeOptions}
            value={type}
            onValueChange={(v) => setType(v as LicenseFieldType)}
            hint={field.key ? "ช่องพื้นฐานใช้ได้เฉพาะแบบข้อความ" : undefined}
            error={errors.type}
          />

          {choice && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">ตัวเลือก</legend>
              {options.map((o, i) => (
                <div key={o.id || `new-${i}`} className="flex items-start gap-2">
                  <input
                    aria-label={`ตัวเลือกที่ ${i + 1} (ไทย)`}
                    value={o.th}
                    maxLength={FIELD_LIMITS.option}
                    placeholder="ไทย"
                    onChange={(e) => setOptions((os) => os.map((x, j) => (j === i ? { ...x, th: e.target.value } : x)))}
                    className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-2.5 text-sm"
                  />
                  <input
                    aria-label={`ตัวเลือกที่ ${i + 1} (English)`}
                    value={o.en}
                    maxLength={FIELD_LIMITS.option}
                    placeholder="English"
                    onChange={(e) => setOptions((os) => os.map((x, j) => (j === i ? { ...x, en: e.target.value } : x)))}
                    className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-2.5 text-sm"
                  />
                  <button type="button" className={iconButton} aria-label={`ลบตัวเลือกที่ ${i + 1}`} onClick={() => setOptions((os) => os.filter((_, j) => j !== i))}>
                    <X className="size-4" aria-hidden />
                  </button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                disabled={options.length >= FIELD_LIMITS.options}
                onClick={() => setOptions((os) => [...os, { id: "", th: "", en: "" }])}
              >
                <Plus aria-hidden /> เพิ่มตัวเลือก
              </Button>
              {Object.entries(errors)
                .filter(([k]) => k.startsWith("options"))
                .slice(0, 1)
                .map(([k, msg]) => (
                  <p key={k} className="text-xs text-destructive">
                    {msg}
                  </p>
                ))}
            </fieldset>
          )}

          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" name="isRequired" defaultChecked={field.isRequired} className="size-4 accent-brand-strong" />
              บังคับกรอก
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" name="isActive" defaultChecked={field.isActive} className="size-4 accent-brand-strong" />
              แสดงในฟอร์ม
            </label>
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            ยกเลิก
          </Button>
          <Button type="submit" form="license-field-form" disabled={pending} aria-busy={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden />} บันทึก
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
