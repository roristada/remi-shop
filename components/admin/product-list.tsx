"use client";

import { useState, useTransition, type MouseEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Copy, Eye, FilePen, ImageOff, Loader2, MoreHorizontal, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { runWithToast, SelectInput } from "@/components/admin/form-controls";
import { ProductStatusBadge } from "@/components/admin/product-status-badge";
import { bulkSetPublishStatus, deleteProduct, duplicateProduct, setPublishStatus } from "@/lib/products/admin-actions";
import type { ProductStatus } from "@/lib/products/status";
import type { PublishStatus } from "@/lib/generated/prisma/enums";
import { cn } from "@/lib/utils";

export type AdminProductRow = {
  id: string;
  nameTH: string;
  nameEN: string;
  versionNumber: string | null;
  categoryName: string;
  imageUrl: string | null;
  price: string;
  /** Pre-discount price, only while a discount is active. */
  originalPrice: string | null;
  status: ProductStatus;
  publishStatus: PublishStatus;
  updatedAt: string;
  hasOrders: boolean;
};

export type ProductListView = "list" | "grid";

const PUBLISH_OPTIONS: { value: PublishStatus; label: string; icon: typeof Eye }[] = [
  { value: "PUBLISHED", label: "เผยแพร่", icon: Eye },
  { value: "DRAFT", label: "ฉบับร่าง", icon: FilePen },
  { value: "DISABLED", label: "ปิดการขาย", icon: Ban },
];

const editHref = (id: string) => `/admin/products/${id}`;

/**
 * Whole row/card opens the product, except clicks on its own controls. Portalled menus and
 * dialogs bubble React events here too, so only clicks inside the element's DOM count.
 */
function useOpenOnClick(id: string) {
  const router = useRouter();
  return (e: MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    if (!e.currentTarget.contains(target)) return;
    if (target.closest("a, button, input, label, [role='checkbox'], [role='combobox'], [role='menuitem']")) return;
    if (e.metaKey || e.ctrlKey) window.open(editHref(id), "_blank");
    else router.push(editHref(id));
  };
}

export function ProductList({ rows, view }: { rows: AdminProductRow[]; view: ProductListView }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Drop ids that left the page (filter/pagination/delete) without an effect.
  const visibleSelected = rows.filter((r) => selected.has(r.id)).map((r) => r.id);
  const allSelected = rows.length > 0 && visibleSelected.length === rows.length;

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  const toggleAll = (on: boolean) => setSelected(on ? new Set(rows.map((r) => r.id)) : new Set());

  return (
    <div className="space-y-3">
      <BulkBar
        selectedIds={visibleSelected}
        allSelected={allSelected}
        onToggleAll={toggleAll}
        onClear={() => setSelected(new Set())}
      />
      {view === "grid" ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {rows.map((r) => (
            <li key={r.id}>
              <ProductCard row={r} checked={selected.has(r.id)} onCheckedChange={(on) => toggle(r.id, on)} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected ? true : visibleSelected.length > 0 ? "indeterminate" : false}
                    onCheckedChange={(v) => toggleAll(v === true)}
                    aria-label="เลือกทั้งหมดในหน้านี้"
                  />
                </TableHead>
                <TableHead className="w-16">
                  <span className="sr-only">รูป</span>
                </TableHead>
                <TableHead>สินค้า</TableHead>
                <TableHead className="hidden md:table-cell">หมวดหมู่</TableHead>
                <TableHead className="text-right">ราคา</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead className="hidden lg:table-cell">แก้ไขล่าสุด</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">จัดการ</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <ProductRow key={r.id} row={r} checked={selected.has(r.id)} onCheckedChange={(on) => toggle(r.id, on)} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

type ItemProps = { row: AdminProductRow; checked: boolean; onCheckedChange: (on: boolean) => void };

function ProductRow({ row, checked, onCheckedChange }: ItemProps) {
  const onClick = useOpenOnClick(row.id);
  return (
    <TableRow onClick={onClick} data-state={checked ? "selected" : undefined} className="cursor-pointer">
      <TableCell>
        <Checkbox checked={checked} onCheckedChange={(v) => onCheckedChange(v === true)} aria-label={`เลือก ${row.nameTH}`} />
      </TableCell>
      <TableCell>
        <div className="relative size-12 overflow-hidden rounded-lg bg-muted">
          {row.imageUrl ? (
            <Image src={row.imageUrl} alt="" fill sizes="48px" className="object-cover" />
          ) : (
            <ImageOff className="absolute inset-0 m-auto size-4 text-muted-foreground" aria-hidden />
          )}
        </div>
      </TableCell>
      <TableCell className="max-w-72">
        <Link href={editHref(row.id)} className="font-medium hover:underline">
          {row.nameTH}
        </Link>
        <p className="truncate text-xs text-muted-foreground">
          {row.nameEN}
          {row.versionNumber ? ` · v${row.versionNumber}` : " · ยังไม่มีเวอร์ชัน"}
        </p>
      </TableCell>
      <TableCell className="hidden md:table-cell">{row.categoryName}</TableCell>
      <TableCell className="text-right whitespace-nowrap">
        <Price row={row} />
      </TableCell>
      <TableCell>
        <ProductStatusBadge status={row.status} />
      </TableCell>
      <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">{row.updatedAt}</TableCell>
      <TableCell>
        <RowActions row={row} />
      </TableCell>
    </TableRow>
  );
}

function ProductCard({ row, checked, onCheckedChange }: ItemProps) {
  const onClick = useOpenOnClick(row.id);
  const changeStatus = useStatusChange(row.id);

  return (
    <div
      onClick={onClick}
      className={cn(
        "flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border bg-card shadow-soft transition-shadow hover:shadow-md",
        checked && "ring-2 ring-primary",
      )}
    >
      <div className="relative aspect-square bg-muted">
        {row.imageUrl ? (
          <Image
            src={row.imageUrl}
            alt=""
            fill
            sizes="(min-width: 1024px) 260px, (min-width: 640px) 33vw, 50vw"
            className="object-cover"
          />
        ) : (
          <ImageOff className="absolute inset-0 m-auto size-5 text-muted-foreground" aria-hidden />
        )}
        <span className="absolute top-2 left-2 grid size-8 place-items-center rounded-full bg-background/90 shadow-soft">
          <Checkbox checked={checked} onCheckedChange={(v) => onCheckedChange(v === true)} aria-label={`เลือก ${row.nameTH}`} />
        </span>
        <span className="absolute top-2 right-2 rounded-full bg-background/90 shadow-soft">
          <RowActions row={row} />
        </span>
        <ProductStatusBadge status={row.status} className="absolute bottom-2 left-2 bg-background shadow-soft" />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="min-w-0">
          <Link href={editHref(row.id)} className="line-clamp-2 text-sm font-medium hover:underline">
            {row.nameTH}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            {row.categoryName}
            {row.versionNumber ? ` · v${row.versionNumber}` : " · ยังไม่มีเวอร์ชัน"}
          </p>
          <p className="mt-1 text-sm tabular-nums">
            <Price row={row} />
          </p>
        </div>
        <div className="mt-auto flex items-center gap-1">
          <SelectInput
            label={`สถานะของ ${row.nameTH}`}
            hideLabel
            value={row.publishStatus}
            onValueChange={(v) => changeStatus.run(v as PublishStatus)}
            options={PUBLISH_OPTIONS.map(({ value, label }) => ({ value, label }))}
            wrapperClassName="min-w-0 flex-1 space-y-0"
            className="h-9! text-xs"
          />
          {changeStatus.pending && (
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-label="กำลังบันทึก" />
          )}
        </div>
      </div>
    </div>
  );
}

function Price({ row }: { row: AdminProductRow }) {
  return (
    <>
      {row.originalPrice && <span className="mr-1 text-xs text-muted-foreground line-through">{row.originalPrice}</span>}
      {row.price}
    </>
  );
}

function useStatusChange(productId: string) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (target: PublishStatus) =>
    startTransition(async () => {
      if (await runWithToast(() => setPublishStatus(productId, target))) router.refresh();
    });
  return { run, pending };
}

function RowActions({ row }: { row: AdminProductRow }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [duplicating, startDuplicate] = useTransition();
  const changeStatus = useStatusChange(row.id);
  const busy = duplicating || changeStatus.pending;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label={`จัดการ ${row.nameTH}`} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <MoreHorizontal aria-hidden />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem asChild>
            <Link href={editHref(row.id)}>
              <Pencil aria-hidden /> แก้ไข
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => startDuplicate(async () => void (await runWithToast(() => duplicateProduct(row.id))))}>
            <Copy aria-hidden /> ทำซ้ำ
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">เปลี่ยนสถานะ</DropdownMenuLabel>
          {PUBLISH_OPTIONS.filter((o) => o.value !== row.publishStatus).map(({ value, label, icon: Icon }) => (
            <DropdownMenuItem key={value} onSelect={() => changeStatus.run(value)}>
              <Icon aria-hidden /> {label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={row.hasOrders}
            onSelect={() => setConfirmDelete(true)}
            title={row.hasOrders ? "มีคำสั่งซื้อแล้ว ลบไม่ได้ — ใช้ “ปิดการขาย” แทน" : undefined}
          >
            <Trash2 aria-hidden /> {row.hasOrders ? "ลบไม่ได้ (มีคำสั่งซื้อ)" : "ลบ"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`ลบ ${row.nameTH} ถาวร?`}
        description="ข้อมูล รูปภาพ เวอร์ชัน และไฟล์ทั้งหมดจะถูกลบ และกู้คืนไม่ได้"
        confirmLabel="ลบถาวร"
        destructive
        onConfirm={() => runWithToast(() => deleteProduct(row.id))}
      />
    </>
  );
}

function BulkBar({
  selectedIds,
  allSelected,
  onToggleAll,
  onClear,
}: {
  selectedIds: string[];
  allSelected: boolean;
  onToggleAll: (on: boolean) => void;
  onClear: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const count = selectedIds.length;

  const apply = (target: PublishStatus) =>
    startTransition(async () => {
      if (!(await runWithToast(() => bulkSetPublishStatus(selectedIds, target)))) return;
      onClear();
      router.refresh();
    });

  return (
    <div
      className={cn(
        "flex min-h-12 flex-wrap items-center gap-2 rounded-2xl border px-3 py-2 text-sm",
        count > 0 ? "border-primary/40 bg-secondary/40" : "border-dashed bg-card/60",
      )}
    >
      <label className="flex items-center gap-2">
        <Checkbox
          checked={allSelected ? true : count > 0 ? "indeterminate" : false}
          onCheckedChange={(v) => onToggleAll(v === true)}
        />
        <span aria-live="polite">{count > 0 ? `เลือกแล้ว ${count} รายการ` : "เลือกหลายรายการเพื่อเปลี่ยนสถานะพร้อมกัน"}</span>
      </label>
      {count > 0 && (
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="กำลังบันทึก" />}
          {PUBLISH_OPTIONS.map(({ value, label, icon: Icon }) => (
            <Button key={value} size="sm" variant="outline" className="rounded-full" disabled={pending} onClick={() => apply(value)}>
              <Icon aria-hidden /> {label}
            </Button>
          ))}
          <Button size="sm" variant="ghost" className="rounded-full" disabled={pending} onClick={onClear}>
            <X aria-hidden /> ล้าง
          </Button>
        </div>
      )}
    </div>
  );
}
