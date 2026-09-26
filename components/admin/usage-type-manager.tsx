"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
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
import type { ActionResult } from "@/lib/actions/result";

export type ManagedUsageType = {
  id: string;
  nameTH: string;
  nameEN: string;
  descriptionTH: string;
  descriptionEN: string;
  isActive: boolean;
  sortOrder: number;
  productCount: number;
  requestCount: number;
};

export function UsageTypeManager({ types }: { types: ManagedUsageType[] }) {
  const router = useRouter();

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
                  <TableCell>
                    {t.isActive ? (
                      <Badge className="bg-success/10 text-success">เปิดใช้งาน</Badge>
                    ) : (
                      <Badge className="bg-muted text-muted-foreground">ปิดใช้งาน</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
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
