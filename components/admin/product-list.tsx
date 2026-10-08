"use client";

import { useState, useTransition, type MouseEvent } from "react";
import { PreviewImage } from "@/components/shared/preview-image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Eye, EyeOff, FilePen, FolderInput, FolderOpen, ImageOff, Link2, Loader2, MoreHorizontal, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { BulkEditMenu, type BulkEditOptions } from "@/components/admin/bulk-edit";
import { runWithToast, SelectInput } from "@/components/admin/form-controls";
import { ProductStatusBadge } from "@/components/admin/product-status-badge";
import { bulkSetPublishStatus, deleteProduct, duplicateProduct, setPublishStatus } from "@/lib/products/admin-actions";
import { setProductsFolder } from "@/lib/folders/actions";
import type { ProductStatus } from "@/lib/products/status";
import type { PublishStatus } from "@/lib/generated/prisma/enums";
import { cn } from "@/lib/utils";

export type AdminProductRow = {
  id: string;
  slug: string;
  nameTH: string;
  nameEN: string;
  /** e.g. "3 ไฟล์" or "ยังไม่มีไฟล์ · ส่งทางอีเมล". */
  fileLabel: string;
  /** Customers still waiting for "now on sale". */
  waitlistCount: number;
  categoryName: string;
  folderId: string | null;
  folderName: string | null;
  imageUrl: string | null;
  price: string;
  /** Pre-discount price, only while a discount is active. */
  originalPrice: string | null;
  status: ProductStatus;
  publishStatus: PublishStatus;
  updatedAt: string;
  hasOrders: boolean;
  /** e.g. "1/1" (left/limit), "∞" or "3 ตัวเลือก". */
  stockLabel: string;
  stockTitle: string;
};

export type ProductListView = "list" | "grid";

export type FolderOption = { id: string; name: string };

const PUBLISH_OPTIONS: { value: PublishStatus; label: string; icon: typeof Eye }[] = [
  { value: "PUBLISHED", label: "เผยแพร่", icon: Eye },
  { value: "DRAFT", label: "ฉบับร่าง", icon: FilePen },
  { value: "DISABLED", label: "ซ่อนสินค้า", icon: EyeOff },
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

export function ProductList({
  rows,
  view,
  folders,
  editOptions,
}: {
  rows: AdminProductRow[];
  view: ProductListView;
  folders: FolderOption[];
  editOptions: BulkEditOptions;
}) {
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
      {/* The list header already has a select-all box, so there the bar only appears once something is picked. */}
      {(view === "grid" || visibleSelected.length > 0) && (
        <BulkBar
          selectedIds={visibleSelected}
          allSelected={allSelected}
          onToggleAll={toggleAll}
          onClear={() => setSelected(new Set())}
          folders={folders}
          editOptions={editOptions}
        />
      )}
      {view === "grid" ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {rows.map((r) => (
            <li key={r.id}>
              <ProductCard row={r} folders={folders} checked={selected.has(r.id)} onCheckedChange={(on) => toggle(r.id, on)} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent [&>th]:h-11 [&>th]:text-xs [&>th]:font-medium [&>th]:text-muted-foreground">
                <TableHead className="w-12 pl-4">
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
                <TableHead className="hidden w-36 md:table-cell">หมวดหมู่</TableHead>
                <TableHead className="w-28 pr-6 text-right">ราคา</TableHead>
                <TableHead className="w-32">สถานะ</TableHead>
                <TableHead className="hidden w-24 md:table-cell">สต็อก</TableHead>
                <TableHead className="hidden w-40 lg:table-cell">แก้ไขล่าสุด</TableHead>
                <TableHead className="w-40 pr-4">
                  <span className="sr-only">จัดการ</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <ProductRow
                  key={r.id}
                  row={r}
                  folders={folders}
                  checked={selected.has(r.id)}
                  onCheckedChange={(on) => toggle(r.id, on)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

type ItemProps = { row: AdminProductRow; folders: FolderOption[]; checked: boolean; onCheckedChange: (on: boolean) => void };

function ProductRow({ row, folders, checked, onCheckedChange }: ItemProps) {
  const onClick = useOpenOnClick(row.id);
  return (
    <TableRow onClick={onClick} data-state={checked ? "selected" : undefined} className="cursor-pointer hover:bg-muted/40">
      <TableCell className="pl-4">
        <Checkbox checked={checked} onCheckedChange={(v) => onCheckedChange(v === true)} aria-label={`เลือก ${row.nameTH}`} />
      </TableCell>
      <TableCell>
        <div className="relative size-12 overflow-hidden rounded-xl bg-muted ring-1 ring-black/5">
          {row.imageUrl ? (
            <PreviewImage src={row.imageUrl} alt="" fill sizes="48px" className="object-cover" />
          ) : (
            <ImageOff className="absolute inset-0 m-auto size-4 text-muted-foreground" aria-hidden />
          )}
        </div>
      </TableCell>
      <TableCell className="max-w-80">
        <Link href={editHref(row.id)} className="line-clamp-1 font-medium hover:underline">
          {row.nameTH}
        </Link>
        <p className="truncate text-xs text-muted-foreground">
          {/* English name only when it adds something; the file count is always shown. */}
          {row.nameEN && row.nameEN !== row.nameTH && `${row.nameEN} · `}
          {row.fileLabel}
          {row.waitlistCount > 0 && ` · รอแจ้งเตือน ${row.waitlistCount.toLocaleString("th-TH")} คน`}
        </p>
        {row.folderName && (
          <p className="mt-0.5 inline-flex max-w-full items-center gap-1 text-xs text-muted-foreground">
            <FolderOpen className="size-3 shrink-0" aria-hidden /> <span className="truncate">{row.folderName}</span>
          </p>
        )}
      </TableCell>
      <TableCell className="hidden text-muted-foreground md:table-cell">{row.categoryName}</TableCell>
      <TableCell className="pr-6 text-right font-medium whitespace-nowrap tabular-nums">
        <Price row={row} />
      </TableCell>
      <TableCell>
        <ProductStatusBadge status={row.status} />
      </TableCell>
      <TableCell className="hidden text-sm tabular-nums md:table-cell" title={row.stockTitle}>
        {row.stockLabel}
      </TableCell>
      <TableCell className="hidden text-xs whitespace-nowrap text-muted-foreground lg:table-cell">{row.updatedAt}</TableCell>
      <TableCell className="pr-4">
        <div className="flex items-center justify-end gap-0.5">
          <QuickActions row={row} />
          <RowActions row={row} folders={folders} />
        </div>
      </TableCell>
    </TableRow>
  );
}

function ProductCard({ row, folders, checked, onCheckedChange }: ItemProps) {
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
          <PreviewImage
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
          <RowActions row={row} folders={folders} />
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
            {` · ${row.fileLabel}`}
            {row.waitlistCount > 0 && ` · รอแจ้งเตือน ${row.waitlistCount.toLocaleString("th-TH")} คน`}
            {row.folderName && ` · ${row.folderName}`}
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
      <div className="flex items-stretch border-t">
        <div className="flex flex-1 items-center gap-0.5 px-1.5 py-1">
          <QuickActions row={row} />
        </div>
        <span
          className="flex items-center border-l px-3 text-xs text-muted-foreground tabular-nums"
          title={row.stockTitle}
        >
          {row.stockLabel}
        </span>
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

/** Always-visible shortcuts: copy the shop link, duplicate, delete. */
function QuickActions({ row }: { row: AdminProductRow }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [duplicating, startDuplicate] = useTransition();

  async function copyLink() {
    const url = `${window.location.origin}/th/product/${row.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("คัดลอกลิงก์สินค้าแล้ว");
    } catch {
      toast.error("คัดลอกไม่สำเร็จ");
    }
  }

  return (
    <>
      <Button size="icon-sm" variant="ghost" aria-label={`คัดลอกลิงก์ ${row.nameTH}`} title="คัดลอกลิงก์หน้าร้าน" onClick={copyLink}>
        <Link2 aria-hidden />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`ทำซ้ำ ${row.nameTH}`}
        title="ทำซ้ำ (สร้างเป็นฉบับร่าง)"
        disabled={duplicating}
        onClick={() => startDuplicate(async () => void (await runWithToast(() => duplicateProduct(row.id))))}
      >
        {duplicating ? <Loader2 className="animate-spin" aria-hidden /> : <Copy aria-hidden />}
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        aria-label={`ลบ ${row.nameTH}`}
        title={row.hasOrders ? "มีคำสั่งซื้อแล้ว ลบไม่ได้ — ใช้ “ซ่อนสินค้า” แทน" : "ลบ"}
        disabled={row.hasOrders}
        onClick={() => setConfirmDelete(true)}
      >
        <Trash2 aria-hidden />
      </Button>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`ลบ ${row.nameTH} ถาวร?`}
        description="ข้อมูล รูปภาพ และไฟล์ทั้งหมดจะถูกลบ และกู้คืนไม่ได้"
        confirmLabel="ลบถาวร"
        destructive
        onConfirm={() => runWithToast(() => deleteProduct(row.id))}
      />
    </>
  );
}

function useFolderMove(productIds: string[], onDone?: () => void) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (folderId: string | null) =>
    startTransition(async () => {
      if (!(await runWithToast(() => setProductsFolder(productIds, folderId)))) return;
      onDone?.();
      router.refresh();
    });
  return { run, pending };
}

/** Menu for the rest: edit, status and folder. */
function RowActions({ row, folders }: { row: AdminProductRow; folders: FolderOption[] }) {
  const changeStatus = useStatusChange(row.id);
  const moveFolder = useFolderMove([row.id]);
  const busy = changeStatus.pending || moveFolder.pending;

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
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">เปลี่ยนสถานะ</DropdownMenuLabel>
          {PUBLISH_OPTIONS.filter((o) => o.value !== row.publishStatus).map(({ value, label, icon: Icon }) => (
            <DropdownMenuItem key={value} onSelect={() => changeStatus.run(value)}>
              <Icon aria-hidden /> {label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FolderInput aria-hidden /> ย้ายไปโฟลเดอร์
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-72 w-52 overflow-y-auto">
              <FolderMenuItems folders={folders} currentId={row.folderId} onPick={moveFolder.run} />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

function FolderMenuItems({
  folders,
  currentId,
  onPick,
}: {
  folders: FolderOption[];
  /** undefined = several products, nothing to disable. */
  currentId?: string | null;
  onPick: (folderId: string | null) => void;
}) {
  return (
    <>
      {folders.map((f) => (
        <DropdownMenuItem key={f.id} disabled={f.id === currentId} onSelect={() => onPick(f.id)}>
          <FolderOpen aria-hidden /> <span className="truncate">{f.name}</span>
        </DropdownMenuItem>
      ))}
      {folders.length > 0 && <DropdownMenuSeparator />}
      <DropdownMenuItem disabled={currentId === null} onSelect={() => onPick(null)}>
        <X aria-hidden /> ไม่มีโฟลเดอร์
      </DropdownMenuItem>
    </>
  );
}

function BulkBar({
  selectedIds,
  allSelected,
  onToggleAll,
  onClear,
  folders,
  editOptions,
}: {
  selectedIds: string[];
  allSelected: boolean;
  onToggleAll: (on: boolean) => void;
  onClear: () => void;
  folders: FolderOption[];
  editOptions: BulkEditOptions;
}) {
  const router = useRouter();
  const [statusPending, startTransition] = useTransition();
  const moveFolder = useFolderMove(selectedIds, onClear);
  const pending = statusPending || moveFolder.pending;
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
        <span aria-live="polite">{count > 0 ? `เลือกแล้ว ${count} รายการ` : "เลือกหลายรายการเพื่อแก้ไข เปลี่ยนสถานะ หรือย้ายโฟลเดอร์พร้อมกัน"}</span>
      </label>
      {count > 0 && (
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="กำลังบันทึก" />}
          <BulkEditMenu selectedIds={selectedIds} options={editOptions} disabled={pending} onDone={onClear} />
          {PUBLISH_OPTIONS.map(({ value, label, icon: Icon }) => (
            <Button key={value} size="sm" variant="outline" className="rounded-full" disabled={pending} onClick={() => apply(value)}>
              <Icon aria-hidden /> {label}
            </Button>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="rounded-full" disabled={pending}>
                <FolderInput aria-hidden /> ย้ายไปโฟลเดอร์
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 w-52 overflow-y-auto">
              <FolderMenuItems folders={folders} onPick={moveFolder.run} />
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" variant="ghost" className="rounded-full" disabled={pending} onClick={onClear}>
            <X aria-hidden /> ล้าง
          </Button>
        </div>
      )}
    </div>
  );
}
