"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { runWithToast, SelectInput, TextInput } from "@/components/admin/form-controls";
import { DateTimeInput } from "@/components/admin/date-time-input";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { bulkDeleteProducts, bulkEditProducts } from "@/lib/products/admin-actions";
import type { BulkEditField } from "@/lib/validation/product";

export type BulkEditOptions = {
  categories: { id: string; nameTH: string }[];
  softwareTags: { id: string; name: string; isActive: boolean }[];
};

const FIELDS: { field: BulkEditField; label: string; hint: string }[] = [
  { field: "description", label: "รายละเอียดสินค้า", hint: "ภาษาที่เว้นว่างไว้จะไม่ถูกเปลี่ยน" },
  { field: "stock", label: "สต็อก", hint: "เว้นว่าง = ไม่จำกัด · ข้ามสินค้าที่มีตัวเลือก (ตั้งสต็อกแยกตามตัวเลือก)" },
  { field: "price", label: "ราคา", hint: "ข้ามสินค้าที่มีตัวเลือก (ตั้งราคาแยกตามตัวเลือก)" },
  { field: "discount", label: "ส่วนลด", hint: "เว้นว่างเปอร์เซ็นต์ = ยกเลิกส่วนลด · ข้ามสินค้าที่มีตัวเลือก" },
  { field: "category", label: "หมวดหมู่", hint: "ย้ายสินค้าที่เลือกไปหมวดหมู่นี้" },
  { field: "software", label: "โปรแกรมที่รองรับ", hint: "" },
  { field: "salePeriod", label: "ช่วงเวลาขาย", hint: "เวลาไทย · เว้นว่าง = ไม่กำหนด" },
];

/**
 * "แก้ไข ▾" in the list's bulk bar: pick one field, set it once, save it to every selected product.
 * The server validates like the product form and reports what it skipped.
 */
export function BulkEditMenu({
  selectedIds,
  options,
  disabled,
  onDone,
}: {
  selectedIds: string[];
  options: BulkEditOptions;
  disabled: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const [field, setField] = useState<BulkEditField | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const count = selectedIds.length;
  const current = FIELDS.find((f) => f.field === field);

  const finish = () => {
    onDone();
    router.refresh();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="rounded-full" disabled={disabled}>
            <Pencil aria-hidden /> แก้ไข <ChevronDown aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {FIELDS.map((f) => (
            <DropdownMenuItem key={f.field} onSelect={() => setField(f.field)}>
              {f.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
            <Trash2 aria-hidden /> ลบสินค้า
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {current && (
        <BulkEditDialog
          key={current.field}
          field={current.field}
          title={`แก้ไข${current.label} · ${count} รายการ`}
          hint={current.hint}
          selectedIds={selectedIds}
          options={options}
          onClose={() => setField(null)}
          onSaved={finish}
        />
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        destructive
        title={`ลบสินค้า ${count} รายการ?`}
        description={
          <p>
            ข้อมูล รูปภาพ และไฟล์ทั้งหมดจะถูกลบ และกู้คืนไม่ได้ · สินค้าที่มีคำสั่งซื้อแล้วจะไม่ถูกลบ (ใช้ “ซ่อนสินค้า” แทน)
          </p>
        }
        confirmLabel="ลบสินค้า"
        onConfirm={async () => {
          const done = await runWithToast(() => bulkDeleteProducts(selectedIds));
          if (done) finish();
          return done;
        }}
      />
    </>
  );
}

function BulkEditDialog({
  field,
  title,
  hint,
  selectedIds,
  options,
  onClose,
  onSaved,
}: {
  field: BulkEditField;
  title: string;
  hint: string;
  selectedIds: string[];
  options: BulkEditOptions;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        const result = await bulkEditProducts(selectedIds, field, formData);
        if (!result.ok) {
          setErrors(result.fieldErrors ?? {});
          toast.error(result.error);
          return;
        }
        (result.notify ? toast.info : toast.success)(result.message ?? "บันทึกแล้ว");
        onClose();
        onSaved();
      } catch {
        toast.error("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className={field === "description" ? "sm:max-w-3xl" : "sm:max-w-lg"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {hint && <DialogDescription>{hint}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={onSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto" noValidate>
          <BulkFields field={field} options={options} errors={errors} />
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden />} บันทึก {selectedIds.length} รายการ
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Two choices as radio pills, e.g. replace / append. */
function ModeChoice({ name, choices }: { name: string; choices: { value: string; label: string }[] }) {
  return (
    <fieldset className="flex flex-wrap gap-2">
      <legend className="sr-only">วิธีแก้ไข</legend>
      {choices.map((c, i) => (
        <label
          key={c.value}
          className="flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm has-checked:border-primary has-checked:bg-secondary/60"
        >
          <input type="radio" name={name} value={c.value} defaultChecked={i === 0} className="size-3.5 accent-brand-strong" />
          {c.label}
        </label>
      ))}
    </fieldset>
  );
}

function BulkFields({ field, options, errors }: { field: BulkEditField; options: BulkEditOptions; errors: Partial<Record<string, string>> }): ReactNode {
  switch (field) {
    case "description":
      return (
        <>
          <ModeChoice
            name="mode"
            choices={[
              { value: "append", label: "ต่อท้ายรายละเอียดเดิม" },
              { value: "replace", label: "แทนที่รายละเอียดเดิม" },
            ]}
          />
          <RichTextEditor label="รายละเอียด (ไทย)" name="descriptionTH" defaultValue="" error={errors.descriptionTH} />
          <RichTextEditor label="รายละเอียด (English)" name="descriptionEN" defaultValue="" error={errors.descriptionEN} />
        </>
      );
    case "stock":
      return <TextInput label="จำนวนสต็อก" name="stockLimit" inputMode="numeric" placeholder="ไม่จำกัด" error={errors.stockLimit} />;
    case "price":
      return <TextInput label="ราคา (บาท)" name="price" inputMode="decimal" required error={errors.price} />;
    case "discount":
      return (
        <div className="grid gap-4 sm:grid-cols-3">
          <TextInput label="ส่วนลด (%)" name="discountPercent" inputMode="decimal" placeholder="ไม่มีส่วนลด" error={errors.discountPercent} />
          <DateTimeInput label="เริ่มส่วนลด" name="discountStartAt" error={errors.discountStartAt} />
          <DateTimeInput label="สิ้นสุดส่วนลด" name="discountEndAt" defaultTime="23:59" error={errors.discountEndAt} />
        </div>
      );
    case "category":
      return (
        <SelectInput
          label="หมวดหมู่"
          name="categoryId"
          options={options.categories.map((c) => ({ value: c.id, label: c.nameTH }))}
          error={errors.categoryId}
        />
      );
    case "software":
      return (
        <>
          <ModeChoice
            name="mode"
            choices={[
              { value: "add", label: "เพิ่มโปรแกรมเหล่านี้ (ของเดิมคงไว้)" },
              { value: "replace", label: "ตั้งเป็นโปรแกรมเหล่านี้เท่านั้น" },
            ]}
          />
          <div className="flex flex-wrap gap-2">
            {options.softwareTags.map((tag) => (
              <label
                key={tag.id}
                className="flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm has-checked:border-primary has-checked:bg-secondary/60"
              >
                <input type="checkbox" name="softwareTagIds" value={tag.id} className="size-3.5 accent-brand-strong" />
                {tag.name}
                {!tag.isActive && <span className="text-xs text-muted-foreground">(ปิดใช้งาน)</span>}
              </label>
            ))}
          </div>
          {errors.softwareTagIds && <p className="text-sm text-destructive">{errors.softwareTagIds}</p>}
        </>
      );
    case "salePeriod":
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <DateTimeInput label="เริ่มขาย" name="saleStartAt" error={errors.saleStartAt} />
          <DateTimeInput label="สิ้นสุดการขาย" name="saleEndAt" defaultTime="23:59" error={errors.saleEndAt} />
        </div>
      );
  }
}
