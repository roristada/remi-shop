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
import { runWithToast, SelectInput, TextInput } from "@/components/admin/form-controls";
import { deleteSoftwareTag, saveSoftwareTag } from "@/lib/software-tags/admin-actions";
import type { ActionResult } from "@/lib/actions/result";

export type ManagedSoftwareTag = {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  productCount: number;
};

export function SoftwareTagManager({ tags }: { tags: ManagedSoftwareTag[] }) {
  const router = useRouter();

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <SoftwareTagDialog
          title="เพิ่มโปรแกรม"
          trigger={
            <Button className="h-10 rounded-full px-5">
              <Plus aria-hidden /> เพิ่มโปรแกรม
            </Button>
          }
        />
      </div>

      {tags.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-12 text-center text-sm text-muted-foreground">
          ยังไม่มีโปรแกรม เพิ่มอย่างน้อยหนึ่งรายการ (เช่น Procreate, Clip Studio Paint) แล้วเลือกในหน้าแก้ไขสินค้า
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">ลำดับ</TableHead>
                <TableHead>ชื่อ</TableHead>
                <TableHead className="text-right">สินค้าที่ใช้</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead>
                  <span className="sr-only">จัดการ</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tags.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{t.sortOrder}</TableCell>
                  <TableCell className="font-medium">{t.name}</TableCell>
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
                      <SoftwareTagDialog
                        title={`แก้ไข ${t.name}`}
                        tag={t}
                        trigger={
                          <Button size="icon-sm" variant="ghost" aria-label={`แก้ไข ${t.name}`}>
                            <Pencil />
                          </Button>
                        }
                      />
                      {t.productCount === 0 && (
                        <ConfirmDialog
                          trigger={
                            <Button size="icon-sm" variant="ghost" aria-label={`ลบ ${t.name}`}>
                              <Trash2 />
                            </Button>
                          }
                          title={`ลบโปรแกรม ${t.name}?`}
                          description="ลบถาวร กู้คืนไม่ได้"
                          confirmLabel="ลบ"
                          destructive
                          onConfirm={async () => {
                            const done = await runWithToast(() => deleteSoftwareTag(t.id));
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

function SoftwareTagDialog({ title, trigger, tag }: { title: string; trigger: ReactNode; tag?: ManagedSoftwareTag }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const err = (name: string) => (state && !state.ok ? state.fieldErrors?.[name] : undefined);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await saveSoftwareTag(tag?.id ?? null, state, formData);
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>โปรแกรมที่ปิดใช้งานจะไม่แสดงเป็นตัวกรองหน้าร้าน แต่สินค้าที่เลือกไว้ยังเก็บไว้</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {state && !state.ok && !state.fieldErrors && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}
          <TextInput label="ชื่อโปรแกรม" name="name" defaultValue={tag?.name} maxLength={80} required error={err("name")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label="ลำดับ"
              name="sortOrder"
              type="number"
              min={0}
              max={9999}
              defaultValue={tag?.sortOrder ?? 0}
              error={err("sortOrder")}
            />
            <SelectInput
              label="สถานะ"
              name="isActive"
              defaultValue={tag?.isActive === false ? "false" : "true"}
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
