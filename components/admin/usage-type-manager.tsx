"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ListChecks, Loader2, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { runWithToast, SelectInput, TextArea, TextInput } from "@/components/admin/form-controls";
import { deleteUsageType, saveUsageType } from "@/lib/licenses/admin-actions";
import { saveUsageTypeFormFields } from "@/lib/licenses/form-actions";
import { appliesToUsageType } from "@/lib/licenses/form-fields";
import { FIELD_TYPE_LABEL } from "@/components/admin/license-form-builder";
import type { LicenseFieldType } from "@/lib/generated/prisma/enums";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/actions/result";

export type ManagedUsageType = {
  id: string;
  nameTH: string;
  nameEN: string;
  descriptionTH: string;
  descriptionEN: string;
  conditionsTH: string;
  conditionsEN: string;
  isActive: boolean;
  sortOrder: number;
  productCount: number;
  requestCount: number;
};

/** A question from the shared form pool, as the per-type form popup shows it. */
export type UsageFormField = {
  id: string;
  key: string | null;
  labelTH: string;
  type: LicenseFieldType;
  isRequired: boolean;
  isActive: boolean;
  /** null = every usage type. */
  usageTypeIds: string[] | null;
};

export function UsageTypeManager({ types, formFields }: { types: ManagedUsageType[]; formFields: UsageFormField[] }) {
  const router = useRouter();
  const activeFields = formFields.filter((f) => f.isActive);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <UsageTypeDialog
          title="เพิ่มประเภทการใช้งาน"
          trigger={
            <Button className="h-10 rounded-full px-5">
              <Plus aria-hidden /> เพิ่มประเภท
            </Button>
          }
        />
      </div>

      {types.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-12 text-center text-sm text-muted-foreground">
          ยังไม่มีประเภทการใช้งาน เพิ่มอย่างน้อยหนึ่งประเภท (เช่น สินค้าที่ระลึก, ปกหนังสือ) แล้วตั้งราคาในหน้าสินค้า
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">ลำดับ</TableHead>
                <TableHead>ชื่อ</TableHead>
                <TableHead className="text-right">สินค้าที่เปิด</TableHead>
                <TableHead className="text-right">ช่องในฟอร์ม</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead>
                  <span className="sr-only">จัดการ</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {types.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{t.sortOrder}</TableCell>
                  <TableCell className="whitespace-normal">
                    <p className="font-medium">{t.nameTH}</p>
                    <p className="text-xs text-muted-foreground">{t.nameEN}</p>
                  </TableCell>
                  <TableCell className="text-right">{t.productCount}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {activeFields.filter((f) => appliesToUsageType(f, t.id)).length}/{activeFields.length}
                  </TableCell>
                  <TableCell>
                    {t.isActive ? (
                      <Badge className="bg-success/10 text-success">เปิดใช้งาน</Badge>
                    ) : (
                      <Badge className="bg-muted text-muted-foreground">ปิดใช้งาน</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <UsageFormDialog usageType={t} fields={formFields} />
                      <UsageTypeDialog
                        title={`แก้ไข ${t.nameTH}`}
                        usageType={t}
                        trigger={
                          <Button size="icon-sm" variant="ghost" aria-label={`แก้ไข ${t.nameTH}`}>
                            <Pencil />
                          </Button>
                        }
                      />
                      {t.requestCount === 0 && (
                        <ConfirmDialog
                          trigger={
                            <Button size="icon-sm" variant="ghost" aria-label={`ลบ ${t.nameTH}`}>
                              <Trash2 />
                            </Button>
                          }
                          title={`ลบประเภท ${t.nameTH}?`}
                          description={
                            t.productCount > 0
                              ? `ราคาของประเภทนี้ใน ${t.productCount} สินค้าจะถูกลบด้วย ลบถาวร กู้คืนไม่ได้`
                              : "ลบถาวร กู้คืนไม่ได้"
                          }
                          confirmLabel="ลบ"
                          destructive
                          onConfirm={async () => {
                            const done = await runWithToast(() => deleteUsageType(t.id));
                            if (done) router.refresh();
                            return done;
                          }}
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function UsageTypeDialog({
  title,
  trigger,
  usageType,
}: {
  title: string;
  trigger: ReactNode;
  usageType?: ManagedUsageType;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const err = (name: string) => (state && !state.ok ? state.fieldErrors?.[name] : undefined);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await saveUsageType(usageType?.id ?? null, state, formData);
      if (!result.ok) {
        setState(result);
        return;
      }
      setOpen(false);
      setState(null);
      await runWithToast(async () => result);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (pending) return;
        setOpen(v);
        if (!v) setState(null);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>ประเภทที่ปิดใช้งานจะไม่แสดงให้ลูกค้าเลือก แต่ราคาที่ตั้งไว้ในสินค้ายังเก็บไว้</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {state && !state.ok && !state.fieldErrors && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="ชื่อ (ไทย)" name="nameTH" defaultValue={usageType?.nameTH} maxLength={80} required error={err("nameTH")} />
            <TextInput label="ชื่อ (English)" name="nameEN" defaultValue={usageType?.nameEN} maxLength={80} required error={err("nameEN")} />
          </div>
          <TextArea
            label="คำอธิบาย (ไทย)"
            name="descriptionTH"
            rows={2}
            maxLength={300}
            defaultValue={usageType?.descriptionTH}
            hint="แสดงใต้ชื่อในฟอร์มขอ License เช่น ขอบเขตหรือจำนวนการผลิต"
            error={err("descriptionTH")}
          />
          <TextArea
            label="คำอธิบาย (English)"
            name="descriptionEN"
            rows={2}
            maxLength={300}
            defaultValue={usageType?.descriptionEN}
            error={err("descriptionEN")}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextArea
              label="เงื่อนไขเพิ่มเติม (ไทย)"
              name="conditionsTH"
              rows={3}
              maxLength={1000}
              defaultValue={usageType?.conditionsTH}
              hint="ลูกค้าเห็นก่อนเลือกประเภทนี้ เช่น จำนวนผลิตสูงสุด ห้ามขายต่อไฟล์"
              error={err("conditionsTH")}
            />
            <TextArea
              label="เงื่อนไขเพิ่มเติม (English)"
              name="conditionsEN"
              rows={3}
              maxLength={1000}
              defaultValue={usageType?.conditionsEN}
              error={err("conditionsEN")}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label="ลำดับ"
              name="sortOrder"
              type="number"
              min={0}
              max={9999}
              defaultValue={usageType?.sortOrder ?? 0}
              error={err("sortOrder")}
            />
            <SelectInput
              label="สถานะ"
              name="isActive"
              defaultValue={usageType?.isActive === false ? "false" : "true"}
              options={[
                { value: "true", label: "เปิดใช้งาน" },
                { value: "false", label: "ปิดใช้งาน" },
              ]}
              error={err("isActive")}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending} aria-busy={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              บันทึก
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Which questions this usage type's request form asks: one switch per question in the shared
 * pool. Built-in questions are always asked. Saved in one go when the admin presses save.
 */
function UsageFormDialog({ usageType, fields }: { usageType: ManagedUsageType; fields: UsageFormField[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState<ReadonlySet<string>>(new Set());
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    if (pending) return;
    // Start from what is saved each time the popup opens.
    if (next) setEnabled(new Set(fields.filter((f) => appliesToUsageType(f, usageType.id)).map((f) => f.id)));
    setOpen(next);
  }

  function toggle(id: string, on: boolean) {
    setEnabled((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function save() {
    startTransition(async () => {
      const enabledFieldIds = fields.filter((f) => !f.key && enabled.has(f.id)).map((f) => f.id);
      const done = await runWithToast(() => saveUsageTypeFormFields(usageType.id, { enabledFieldIds }));
      if (!done) return;
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label={`ตั้งค่าฟอร์มของ ${usageType.nameTH}`} title="ตั้งค่าฟอร์ม">
          <ListChecks />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>ฟอร์มของ {usageType.nameTH}</DialogTitle>
          <DialogDescription>
            เปิดคำถามที่ลูกค้าต้องตอบเมื่อขอประเภทนี้ ช่องพื้นฐานถามทุกประเภทเสมอ เพิ่มหรือแก้คำถามได้ที่หน้าแบบฟอร์มคำขอ
          </DialogDescription>
        </DialogHeader>
        {fields.length === 0 ? (
          <p className="rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">ยังไม่มีคำถามในแบบฟอร์ม</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {fields.map((f) => {
              const locked = f.key !== null;
              return (
                <li key={f.id} className={cn("flex items-center gap-3 px-3 py-2.5", !f.isActive && "bg-muted/50")}>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm font-medium", !f.isActive && "text-muted-foreground")}>
                      {f.labelTH}
                      {f.isRequired && <span className="text-destructive"> *</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {FIELD_TYPE_LABEL[f.type]}
                      {locked && " · ช่องพื้นฐาน"}
                      {!f.isActive && " · ปิดอยู่ทั้งระบบ (ลูกค้าไม่เห็น)"}
                    </p>
                  </div>
                  {locked ? (
                    <Lock className="size-4 shrink-0 text-muted-foreground" aria-label="เปิดเสมอ" />
                  ) : (
                    <ToggleSwitch
                      checked={enabled.has(f.id)}
                      disabled={pending}
                      label={`ถาม ${f.labelTH} ในประเภทนี้`}
                      onChange={(v) => toggle(f.id, v)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            ยกเลิก
          </Button>
          <Button onClick={save} disabled={pending} aria-busy={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden />} บันทึก
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToggleSwitch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50",
        checked ? "bg-brand-strong" : "bg-foreground/20",
      )}
    >
      <span
        className={cn("inline-block size-5 rounded-full bg-background shadow transition-transform", checked ? "translate-x-5.5" : "translate-x-0.5")}
      />
    </button>
  );
}
