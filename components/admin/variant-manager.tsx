"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
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
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { runWithToast, TextInput } from "@/components/admin/form-controls";
import { DateTimeInput } from "@/components/admin/date-time-input";
import { createVariant, deleteVariant, setVariantActive, updateVariant } from "@/lib/products/variant-actions";
import type { ActionResult } from "@/lib/actions/result";

/** Form-ready values (strings, Bangkok datetime-local) plus display-only counts. */
export type ManagedVariant = {
  id: string;
  nameTH: string;
  nameEN: string;
  price: string;
  discountPercent: string;
  discountStartAt: string;
  discountEndAt: string;
  stockLimit: string;
  sortOrder: string;
  isActive: boolean;
  priceLabel: string;
  discountLabel: string | null;
  /** Units in open or completed orders. */
  taken: number;
  fileCount: number;
};

type VariantAction = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

export function VariantManager({ productId, variants }: { productId: string; variants: ManagedVariant[] }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          ถ้ามีตัวเลือก ลูกค้าต้องเลือกแบบก่อนซื้อ แต่ละแบบมีราคา ส่วนลด และสต็อกของตัวเอง ช่วงเวลาขายและ License ใช้ของสินค้า
          · กำหนดว่าไฟล์ไหนให้แบบไหนได้ที่แท็บเวอร์ชันและไฟล์
        </p>
        <VariantDialog
          title="เพิ่มตัวเลือก"
          trigger={
            <Button className="rounded-full">
              <Plus aria-hidden /> เพิ่มตัวเลือก
            </Button>
          }
          action={(prev, fd) => createVariant(productId, prev, fd)}
          nextSortOrder={variants.length}
        />
      </div>

      {variants.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          ยังไม่มีตัวเลือก — สินค้านี้ขายเป็นชิ้นเดียวตามราคาในแท็บรายละเอียด
        </div>
      ) : (
        <ul className="divide-y rounded-2xl border bg-card shadow-soft">
          {variants.map((v) => (
            <VariantRow key={v.id} variant={v} />
          ))}
        </ul>
      )}
    </div>
  );
}

function VariantRow({ variant: v }: { variant: ManagedVariant }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const refreshOn = async (fn: () => Promise<ActionResult>) => {
    const done = await runWithToast(fn);
    if (done) router.refresh();
    return done;
  };
  const stock = v.stockLimit === "" ? "ไม่จำกัด" : `${Math.max(0, Number(v.stockLimit) - v.taken)}/${v.stockLimit} เหลือ`;

  return (
    <li className="flex flex-wrap items-center gap-3 p-4">
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          {v.nameTH}
          <span className="font-normal text-muted-foreground">/ {v.nameEN}</span>
          {!v.isActive && <Badge className="bg-muted text-muted-foreground">ปิดขาย</Badge>}
        </p>
        <p className="text-sm tabular-nums">
          {v.priceLabel}
          {v.discountLabel && <span className="text-muted-foreground"> · {v.discountLabel}</span>}
        </p>
        <p className="text-xs text-muted-foreground">
          สต็อก {stock} · ขาย/จองแล้ว {v.taken} · ไฟล์เฉพาะแบบนี้ {v.fileCount}
        </p>
      </div>
      <div className="flex flex-wrap gap-1">
        <VariantDialog
          title={`แก้ไข ${v.nameTH}`}
          trigger={
            <Button size="sm" variant="outline" disabled={pending}>
              <Pencil aria-hidden /> แก้ไข
            </Button>
          }
          action={(prev, fd) => updateVariant(v.id, prev, fd)}
          values={v}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => startTransition(async () => void (await refreshOn(() => setVariantActive(v.id, !v.isActive))))}
        >
          {v.isActive ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
          {v.isActive ? "ปิดขาย" : "เปิดขาย"}
        </Button>
        <ConfirmDialog
          trigger={
            <Button size="sm" variant="destructive" disabled={pending}>
              <Trash2 aria-hidden /> ลบ
            </Button>
          }
          title={`ลบตัวเลือก ${v.nameTH}?`}
          description={
            <p>ลบได้เฉพาะตัวเลือกที่ยังไม่มีคำสั่งซื้อและไม่มีไฟล์ ถ้ามีคนซื้อแล้ว ให้กดปิดขายแทน ผู้ซื้อจะยังดาวน์โหลดไฟล์ได้</p>
          }
          confirmLabel="ลบตัวเลือก"
          destructive
          onConfirm={() => refreshOn(() => deleteVariant(v.id))}
        />
      </div>
    </li>
  );
}

function VariantDialog({
  title,
  trigger,
  action,
  values,
  nextSortOrder = 0,
}: {
  title: string;
  trigger: ReactNode;
  action: VariantAction;
  values?: ManagedVariant;
  nextSortOrder?: number;
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
      const result = await action(state, formData);
      setState(result);
      if (result.ok) {
        setOpen(false);
        setState(null);
        await runWithToast(async () => result);
        router.refresh();
      }
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>วันที่เป็นเวลาไทย · ส่วนลดต้องระบุทั้งวันเริ่มและวันสิ้นสุด · สต็อกเว้นว่าง = ไม่จำกัด</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {state && !state.ok && !state.fieldErrors && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="ชื่อ (ไทย)" name="nameTH" maxLength={80} defaultValue={values?.nameTH} error={err("nameTH")} />
            <TextInput label="ชื่อ (English)" name="nameEN" maxLength={80} defaultValue={values?.nameEN} error={err("nameEN")} />
            <TextInput label="ราคา (บาท)" name="price" inputMode="decimal" defaultValue={values?.price} error={err("price")} />
            <TextInput
              label="สต็อก"
              name="stockLimit"
              type="number"
              min={0}
              max={100000}
              placeholder="ไม่จำกัด"
              defaultValue={values?.stockLimit}
              error={err("stockLimit")}
            />
            <TextInput
              label="ส่วนลด (%)"
              name="discountPercent"
              inputMode="decimal"
              placeholder="ไม่มีส่วนลด"
              defaultValue={values?.discountPercent}
              error={err("discountPercent")}
            />
            <TextInput
              label="ลำดับการแสดง"
              name="sortOrder"
              type="number"
              min={0}
              max={10000}
              defaultValue={values?.sortOrder ?? String(nextSortOrder)}
              error={err("sortOrder")}
            />
            <DateTimeInput label="เริ่มส่วนลด" name="discountStartAt" defaultValue={values?.discountStartAt} error={err("discountStartAt")} />
            <DateTimeInput
              label="สิ้นสุดส่วนลด"
              name="discountEndAt"
              defaultTime="23:59"
              defaultValue={values?.discountEndAt}
              error={err("discountEndAt")}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending} aria-busy={pending}>
              บันทึก
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
