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
import { deleteCategory, saveCategory } from "@/lib/categories/actions";
import type { ActionResult } from "@/lib/actions/result";

export type ManagedCategory = {
  id: string;
  slug: string;
  nameTH: string;
  nameEN: string;
  descriptionTH: string;
  descriptionEN: string;
  status: "ACTIVE" | "HIDDEN";
  sortOrder: number;
  productCount: number;
};

export function CategoryManager({ categories }: { categories: ManagedCategory[] }) {
  const router = useRouter();

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <CategoryDialog
          title="เพิ่มหมวดหมู่"
          trigger={
            <Button className="h-10 rounded-full px-5">
              <Plus aria-hidden /> เพิ่มหมวดหมู่
            </Button>
          }
        />
      </div>

      {categories.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-12 text-center text-sm text-muted-foreground">
          ยังไม่มีหมวดหมู่
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent [&>th]:h-11 [&>th]:text-xs [&>th]:font-medium [&>th]:text-muted-foreground">
                <TableHead className="w-16 pl-4">ลำดับ</TableHead>
                <TableHead>ชื่อ</TableHead>
                <TableHead className="hidden w-36 sm:table-cell">Slug</TableHead>
                <TableHead className="w-20 pr-6 text-right">สินค้า</TableHead>
                <TableHead className="w-24">สถานะ</TableHead>
                <TableHead className="w-24 pr-4">
                  <span className="sr-only">จัดการ</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((c) => (
                <TableRow key={c.id} className="hover:bg-muted/40">
                  <TableCell className="pl-4 text-muted-foreground tabular-nums">{c.sortOrder}</TableCell>
                  <TableCell className="max-w-0">
                    <p className="font-medium">
                      {c.nameTH} <span className="font-normal text-muted-foreground">· {c.nameEN}</span>
                    </p>
                    {/* The description is shown on the shop's category page; a preview helps spot empty ones. */}
                    <p className="truncate text-xs text-muted-foreground" title={c.descriptionTH || undefined}>
                      {c.descriptionTH || <span className="italic">ยังไม่มีคำอธิบาย</span>}
                    </p>
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">{c.slug}</TableCell>
                  <TableCell className="pr-6 text-right font-medium tabular-nums">{c.productCount}</TableCell>
                  <TableCell>
                    {c.status === "ACTIVE" ? (
                      <Badge className="bg-success/10 text-success">แสดง</Badge>
                    ) : (
                      <Badge className="bg-muted text-muted-foreground">ซ่อน</Badge>
                    )}
                  </TableCell>
                  <TableCell className="pr-4">
                    <div className="flex justify-end gap-0.5">
                      <CategoryDialog
                        title={`แก้ไข ${c.nameTH}`}
                        category={c}
                        trigger={
                          <Button size="icon-sm" variant="ghost" aria-label={`แก้ไข ${c.nameTH}`}>
                            <Pencil />
                          </Button>
                        }
                      />
                      {c.productCount > 0 ? (
                        // Kept visible (disabled) so every row's buttons line up and the reason is discoverable.
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          disabled
                          aria-label={`ลบ ${c.nameTH} ไม่ได้ เพราะมีสินค้า`}
                          title="มีสินค้าในหมวดนี้ ลบไม่ได้ — ใช้ “ซ่อน” แทน"
                        >
                          <Trash2 />
                        </Button>
                      ) : (
                        <ConfirmDialog
                          trigger={
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              aria-label={`ลบ ${c.nameTH}`}
                            >
                              <Trash2 />
                            </Button>
                          }
                          title={`ลบหมวดหมู่ ${c.nameTH}?`}
                          description="ลบถาวร กู้คืนไม่ได้"
                          confirmLabel="ลบ"
                          destructive
                          onConfirm={async () => {
                            const done = await runWithToast(() => deleteCategory(c.id));
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

function CategoryDialog({ title, trigger, category }: { title: string; trigger: ReactNode; category?: ManagedCategory }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const err = (name: string) => (state && !state.ok ? state.fieldErrors?.[name] : undefined);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await saveCategory(category?.id ?? null, state, formData);
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
          <DialogDescription>หมวดหมู่ที่ซ่อนจะไม่แสดงในหน้าร้าน</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {state && !state.ok && !state.fieldErrors && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="ชื่อ (ไทย)" name="nameTH" defaultValue={category?.nameTH} maxLength={80} required error={err("nameTH")} />
            <TextInput label="ชื่อ (English)" name="nameEN" defaultValue={category?.nameEN} maxLength={80} required error={err("nameEN")} />
            <TextInput label="Slug" name="slug" defaultValue={category?.slug} maxLength={100} required error={err("slug")} />
            <TextInput
              label="ลำดับ"
              name="sortOrder"
              type="number"
              min={0}
              max={9999}
              defaultValue={category?.sortOrder ?? 0}
              error={err("sortOrder")}
            />
          </div>
          <TextArea label="คำอธิบาย (ไทย)" name="descriptionTH" rows={2} maxLength={500} defaultValue={category?.descriptionTH} error={err("descriptionTH")} />
          <TextArea label="คำอธิบาย (English)" name="descriptionEN" rows={2} maxLength={500} defaultValue={category?.descriptionEN} error={err("descriptionEN")} />
          <SelectInput
            label="สถานะ"
            name="status"
            defaultValue={category?.status ?? "ACTIVE"}
            options={[
              { value: "ACTIVE", label: "แสดง" },
              { value: "HIDDEN", label: "ซ่อน" },
            ]}
            error={err("status")}
          />
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
