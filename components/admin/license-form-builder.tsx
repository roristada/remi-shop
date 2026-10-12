"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { runWithToast, SelectInput, TextArea, TextInput } from "@/components/admin/form-controls";
import { createFormField, deleteFormField, reorderFormFields, updateFormField } from "@/lib/licenses/form-actions";
import { FIELD_LIMITS, isChoiceType, type AnswerValue, type FieldOption } from "@/lib/licenses/form-fields";
import { AnswerField } from "@/components/shop/license-request-form";
import shopTH from "@/locales/th/shop.json";
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
  URL: "ลิงก์ (URL)",
  FILE: "แนบไฟล์ (รูป / PDF ไม่เกิน 5 MB)",
};

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

const DND_A11Y = {
  screenReaderInstructions: {
    draggable:
      "กด Space หรือ Enter เพื่อจับ ใช้ลูกศรเพื่อย้าย แล้วกด Space หรือ Enter อีกครั้งเพื่อวาง กด Escape เพื่อยกเลิก",
  },
  announcements: {
    onDragStart: () => "จับแล้ว",
    onDragOver: () => "",
    onDragEnd: ({ over }: { over: unknown }) => (over ? "วางแล้ว" : "ยกเลิกการย้าย"),
    onDragCancel: () => "ยกเลิกการย้าย",
  },
};

// The customer's own Thai wording, so each question looks as it does in the shop.
const PREVIEW_LABELS = {
  optional: shopTH.license.optional,
  flagged: shopTH.license.flagged,
  fileHint: shopTH.license.fileHint,
  fileChoose: shopTH.license.fileChoose,
  fileChange: shopTH.license.fileChange,
  fileRemove: shopTH.license.fileRemove,
};

/**
 * Admin editor for one usage type's commercial-license request form. The form is shown as the
 * customer sees it (one column, Thai); each question is dragged by its handle and edited or
 * deleted from the bar under it. Switched-off questions stay in place, faded.
 */
export function LicenseFormBuilder({ usageTypeId, fields }: { usageTypeId: string; fields: BuilderField[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<BuilderField | null>(null);
  const [pending, startTransition] = useTransition();
  // Try-out answers typed into the form; never sent anywhere.
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  // Dragging only changes this local order; nothing is saved until "บันทึกลำดับ".
  const [ordered, setOrdered] = useState(fields);
  const [seen, setSeen] = useState(fields);
  if (fields !== seen) {
    setSeen(fields);
    setOrdered(keepOrder(ordered, fields));
  }
  const dirty = ordered.some((f, i) => f.id !== fields[i]?.id);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const sensors = useSensors(
    // Small distance so clicks on the handle's neighbours don't start a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const dndId = useId();

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    setOrdered(
      arrayMove(
        ordered,
        ordered.findIndex((f) => f.id === active.id),
        ordered.findIndex((f) => f.id === over.id),
      ),
    );
  }

  function saveOrder() {
    startTransition(async () => {
      if (await runWithToast(() => reorderFormFields(usageTypeId, ordered.map((f) => f.id)))) router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <p className="mr-auto text-xs text-muted-foreground">
          หน้าตาเหมือนที่ลูกค้าเห็น ลองกรอกได้ ไม่มีการบันทึก
          {ordered.length > 1 && (
            <>
              {" · "}ลาก <GripVertical className="inline size-3" aria-hidden /> เพื่อเรียงลำดับ แล้วกดบันทึก
            </>
          )}
        </p>
        <Button className="h-10 rounded-full px-5" onClick={() => setEditing(EMPTY)} disabled={ordered.length >= FIELD_LIMITS.fields}>
          <Plus aria-hidden /> เพิ่มช่องข้อมูล
        </Button>
      </div>

      {ordered.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-12 text-center text-sm text-muted-foreground">ฟอร์มนี้ยังไม่มีคำถาม</div>
      ) : (
        <div className="rounded-3xl border bg-card p-3 shadow-soft sm:p-5">
          <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} accessibility={DND_A11Y}>
            <SortableContext items={ordered.map((f) => f.id)} strategy={verticalListSortingStrategy}>
              <ol className="space-y-3">
                {ordered.map((f) => (
                  <SortableQuestion
                    key={f.id}
                    field={f}
                    disabled={pending}
                    value={answers[f.id]}
                    onChange={(v) => setAnswers((a) => ({ ...a, [f.id]: v }))}
                    onEdit={() => setEditing(f)}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {dirty && (
        <div
          role="status"
          className="sticky bottom-4 z-20 flex flex-wrap items-center justify-end gap-2 rounded-2xl border bg-card/95 px-4 py-3 shadow-lg backdrop-blur"
        >
          <p className="mr-auto text-sm text-muted-foreground">ลำดับเปลี่ยนแล้ว ยังไม่ได้บันทึก</p>
          <Button variant="outline" className="rounded-full" disabled={pending} onClick={() => setOrdered(fields)}>
            ยกเลิก
          </Button>
          <Button className="rounded-full" disabled={pending} aria-busy={pending} onClick={saveOrder}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            บันทึกลำดับ
          </Button>
        </div>
      )}

      {editing && <FieldDialog key={editing.id || "new"} usageTypeId={usageTypeId} field={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/**
 * Fresh server data (after an edit, add or delete) in the admin's unsaved order: known questions
 * keep their place, new ones go where the server put them at the end, deleted ones drop out.
 */
function keepOrder(local: BuilderField[], server: BuilderField[]): BuilderField[] {
  const byId = new Map(server.map((f) => [f.id, f]));
  const kept = local.flatMap((f) => byId.get(f.id) ?? []);
  const keptIds = new Set(kept.map((f) => f.id));
  return [...kept, ...server.filter((f) => !keptIds.has(f.id))];
}

function SortableQuestion({
  field: f,
  disabled,
  value,
  onChange,
  onEdit,
}: {
  field: BuilderField;
  disabled: boolean;
  value: AnswerValue | undefined;
  onChange: (v: string | string[]) => void;
  onEdit: () => void;
}) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: f.id,
    disabled,
  });

  return (
    <li
      ref={setNodeRef}
      // Translate only: questions differ in height, and scaling would squash the inputs mid-drag.
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "flex flex-col rounded-2xl border bg-background p-3",
        !f.isActive && "border-dashed bg-muted/40",
        isDragging && "relative z-10 shadow-lg ring-2 ring-primary",
      )}
    >
      <div className="flex flex-1 items-start gap-1">
        <button
          ref={setActivatorNodeRef}
          type="button"
          aria-label={`ลากเพื่อย้าย ${f.labelTH}`}
          className="-ml-1 grid size-7 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/80 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
        <div className={cn("min-w-0 flex-1", !f.isActive && "opacity-60")}>
          <AnswerField
            field={{ ...f, usageTypeId: "", descriptionTH: f.descriptionTH || null, descriptionEN: f.descriptionEN || null }}
            locale="th"
            value={value}
            pendingFile={null}
            onChange={onChange}
            onFile={() => undefined}
            flagged={false}
            labels={PREVIEW_LABELS}
          />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1 border-t pt-2">
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {!f.isActive && <span className="mr-1 rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">ปิดใช้งาน</span>}
          {FIELD_TYPE_LABEL[f.type]}
          {f.isRequired && " · บังคับตอบ"}
          {f.answerCount > 0 && ` · ตอบแล้ว ${f.answerCount} คำขอ`}
        </p>
        <button type="button" className={iconButton} aria-label={`แก้ไข ${f.labelTH}`} title="แก้ไข" onClick={onEdit}>
          <Pencil className="size-4" aria-hidden />
        </button>
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
            <button type="button" className={cn(iconButton, "hover:text-destructive")} aria-label={`ลบ ${f.labelTH}`} title="ลบ">
              <Trash2 className="size-4" aria-hidden />
            </button>
          }
        />
      </div>
    </li>
  );
}


function FieldDialog({ usageTypeId, field, onClose }: { usageTypeId: string; field: BuilderField; onClose: () => void }) {
  const router = useRouter();
  const [type, setType] = useState<LicenseFieldType>(field.type);
  const [options, setOptions] = useState<FieldOption[]>(field.options.length > 0 ? field.options : []);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, startTransition] = useTransition();
  const isNew = field.id === "";
  const choice = isChoiceType(type);
  const typeOptions = (Object.keys(FIELD_TYPE_LABEL) as LicenseFieldType[]).map((t) => ({
    value: t,
    label: FIELD_TYPE_LABEL[t],
  }));

  function submit(form: FormData) {
    const text = (n: string) => String(form.get(n) ?? "");
    startTransition(async () => {
      const input = {
        labelTH: text("labelTH"),
        labelEN: text("labelEN"),
        descriptionTH: text("descriptionTH"),
        descriptionEN: text("descriptionEN"),
        type,
        isRequired: form.get("isRequired") === "on",
        isActive: form.get("isActive") === "on",
        options: choice ? options : [],
      };
      const result = isNew ? await createFormField(usageTypeId, input) : await updateFormField(field.id, input);
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
