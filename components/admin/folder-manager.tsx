"use client";

import { useId, useMemo, useState, useTransition, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
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
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Archive, FolderPlus, GripVertical, ImageOff, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { runWithToast, SelectInput, TextInput } from "@/components/admin/form-controls";
import { ProductStatusBadge } from "@/components/admin/product-status-badge";
import {
  addProductsToFolder,
  deleteFolder,
  removeProductFromFolder,
  reorderFolderProducts,
  reorderFolders,
  saveFolder,
} from "@/lib/folders/actions";
import type { ActionResult } from "@/lib/actions/result";
import type { ProductStatus } from "@/lib/products/status";
import { cn } from "@/lib/utils";

export type ManagedFolderProduct = {
  id: string;
  name: string;
  price: string;
  status: ProductStatus;
  imageUrl: string | null;
  folderId: string | null;
};

export type ManagedFolder = {
  id: string;
  slug: string;
  nameTH: string;
  nameEN: string;
  status: "ACTIVE" | "ARCHIVED";
  products: ManagedFolderProduct[];
};

type FolderOption = { id: string; nameTH: string };

// Radix Select forbids "" as a value; this one means "no folder".
const NO_FOLDER = "_none";

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

function useSortSensors() {
  return useSensors(
    // Small distance so clicks on buttons/selects inside a card don't start a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
}

/** Local order for instant feedback while dragging; resets whenever the server sends new data. */
function useLocalOrder<T>(serverItems: T[]) {
  const [items, setItems] = useState(serverItems);
  const [seen, setSeen] = useState(serverItems);
  if (serverItems !== seen) {
    setSeen(serverItems);
    setItems(serverItems);
  }
  return [items, setItems] as const;
}

const anchorId = (id: string) => `folder-${id}`;

export function FolderManager({
  folders,
  allProducts,
}: {
  folders: ManagedFolder[];
  allProducts: ManagedFolderProduct[];
}) {
  const router = useRouter();
  const [items, setItems] = useLocalOrder(folders);
  const [pending, startTransition] = useTransition();
  const sensors = useSortSensors();
  const dndId = useId();
  const unfiled = useMemo(() => allProducts.filter((p) => p.folderId === null), [allProducts]);
  const folderOptions: FolderOption[] = items.map((f) => ({
    id: f.id,
    nameTH: f.nameTH,
  }));

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const previous = items;
    const next = arrayMove(
      items,
      items.findIndex((f) => f.id === active.id),
      items.findIndex((f) => f.id === over.id),
    );
    setItems(next);
    startTransition(async () => {
      if (!(await runWithToast(() => reorderFolders(next.map((f) => f.id))))) setItems(previous);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <FolderDialog
          title="เพิ่มโฟลเดอร์"
          trigger={
            <Button className="h-10 rounded-full px-5">
              <FolderPlus aria-hidden /> เพิ่มโฟลเดอร์
            </Button>
          }
        />
        <p className="text-xs text-muted-foreground">
          ลาก <GripVertical className="inline size-3" aria-hidden /> เพื่อเรียงโฟลเดอร์และสินค้า ·
          สินค้าหนึ่งชิ้นอยู่ได้หนึ่งโฟลเดอร์
        </p>
      </div>

      {items.length > 0 && (
        <nav aria-label="ไปที่โฟลเดอร์" className="flex flex-wrap gap-2">
          {items.map((f) => (
            <a
              key={f.id}
              href={`#${anchorId(f.id)}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border bg-card px-3.5 text-sm hover:border-foreground/30"
            >
              {f.status === "ARCHIVED" && <Archive className="size-3.5 text-muted-foreground" aria-label="เก็บถาวร" />}
              {f.nameTH}
            </a>
          ))}
        </nav>
      )}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-12 text-center text-sm text-muted-foreground">
          ยังไม่มีโฟลเดอร์ — หน้าร้านจะแสดงสินค้าทั้งหมดแบบรวม
        </div>
      ) : (
        <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} accessibility={DND_A11Y}>
          <SortableContext items={items.map((f) => f.id)} strategy={verticalListSortingStrategy}>
            <ol className="space-y-5">
              {items.map((f) => (
                <SortableFolder
                  key={f.id}
                  folder={f}
                  folders={folderOptions}
                  allProducts={allProducts}
                  disabled={pending}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      <section aria-labelledby="unfiled-title" className="rounded-3xl border border-dashed bg-card/60 p-4 sm:p-6">
        <div className="mb-4 flex items-baseline gap-3">
          <h2 id="unfiled-title" className="text-lg font-semibold">
            ไม่มีโฟลเดอร์
          </h2>
          <span className="text-sm text-muted-foreground tabular-nums">{unfiled.length} รายการ</span>
        </div>
        {unfiled.length === 0 ? (
          <p className="text-sm text-muted-foreground">ทุกสินค้าอยู่ในโฟลเดอร์แล้ว</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {unfiled.map((p) => (
              <li key={p.id}>
                <ProductTile product={p} folders={folderOptions} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SortableFolder({
  folder,
  folders,
  allProducts,
  disabled,
}: {
  folder: ManagedFolder;
  folders: FolderOption[];
  allProducts: ManagedFolderProduct[];
  disabled: boolean;
}) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: folder.id,
    disabled,
  });
  const archived = folder.status === "ARCHIVED";

  return (
    <li
      ref={setNodeRef}
      id={anchorId(folder.id)}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "scroll-mt-6 rounded-3xl border bg-card p-4 shadow-soft sm:p-6",
        archived && "bg-muted/40",
        isDragging && "relative z-10 opacity-90 shadow-lg ring-2 ring-primary",
      )}
    >
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          ref={setActivatorNodeRef}
          type="button"
          aria-label={`ลากเพื่อย้ายโฟลเดอร์ ${folder.nameTH}`}
          className="grid size-9 cursor-grab touch-none place-items-center rounded-full text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/80 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
            <span className="truncate">{folder.nameTH}</span>
            {archived && (
              <Badge className="bg-muted text-muted-foreground">
                <Archive aria-hidden /> เก็บถาวร (ซ่อนจากหน้าร้าน)
              </Badge>
            )}
          </h2>
          <p className="text-xs text-muted-foreground">
            {folder.nameEN} · <span className="font-mono">{folder.slug}</span> · {folder.products.length} รายการ
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <AddProductsDialog folder={folder} allProducts={allProducts} />
          <FolderDialog
            title={`แก้ไข ${folder.nameTH}`}
            folder={folder}
            trigger={
              <Button size="sm" variant="outline" className="rounded-full">
                <Pencil aria-hidden /> แก้ไข
              </Button>
            }
          />
          <ConfirmDialog
            trigger={
              <Button size="icon-sm" variant="ghost" aria-label={`ลบโฟลเดอร์ ${folder.nameTH}`}>
                <Trash2 />
              </Button>
            }
            title={`ลบโฟลเดอร์ ${folder.nameTH}?`}
            description={
              <>
                <p>ลบถาวร กู้คืนไม่ได้</p>
                {folder.products.length > 0 && (
                  <p>สินค้า {folder.products.length} รายการจะไม่ถูกลบ แต่จะย้ายไป “ไม่มีโฟลเดอร์”</p>
                )}
              </>
            }
            confirmLabel="ลบโฟลเดอร์"
            destructive
            onConfirm={async () => {
              const done = await runWithToast(() => deleteFolder(folder.id));
              if (done) router.refresh();
              return done;
            }}
          />
        </div>
      </div>
      <FolderProducts folderId={folder.id} products={folder.products} folders={folders} />
    </li>
  );
}

function FolderProducts({
  folderId,
  products,
  folders,
}: {
  folderId: string;
  products: ManagedFolderProduct[];
  folders: FolderOption[];
}) {
  const router = useRouter();
  const [items, setItems] = useLocalOrder(products);
  const [pending, startTransition] = useTransition();
  const sensors = useSortSensors();
  const dndId = useId();

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const previous = items;
    const next = arrayMove(
      items,
      items.findIndex((p) => p.id === active.id),
      items.findIndex((p) => p.id === over.id),
    );
    setItems(next);
    startTransition(async () => {
      if (
        !(await runWithToast(() =>
          reorderFolderProducts(
            folderId,
            next.map((p) => p.id),
          ),
        ))
      )
        setItems(previous);
      router.refresh();
    });
  }

  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        ยังไม่มีสินค้าในโฟลเดอร์นี้ — กด “เพิ่มสินค้า”
      </p>
    );
  }

  return (
    <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} accessibility={DND_A11Y}>
      <SortableContext items={items.map((p) => p.id)} strategy={rectSortingStrategy}>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {items.map((p) => (
            <SortableProduct key={p.id} product={p} folders={folders} disabled={pending} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableProduct({
  product,
  folders,
  disabled,
}: {
  product: ManagedFolderProduct;
  folders: FolderOption[];
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: product.id,
    disabled,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "relative z-10 opacity-80")}
    >
      <ProductTile
        product={product}
        folders={folders}
        handle={
          <button
            ref={setActivatorNodeRef}
            type="button"
            aria-label={`ลากเพื่อย้าย ${product.name}`}
            className="absolute top-2 right-2 grid size-9 cursor-grab touch-none place-items-center rounded-full bg-background/90 shadow-soft outline-none focus-visible:ring-3 focus-visible:ring-ring/80 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disabled}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" aria-hidden />
          </button>
        }
      />
    </li>
  );
}

function ProductTile({
  product,
  folders,
  handle,
}: {
  product: ManagedFolderProduct;
  folders: FolderOption[];
  handle?: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function move(target: string) {
    if (target === (product.folderId ?? NO_FOLDER)) return;
    startTransition(async () => {
      const done = await runWithToast(() =>
        target === NO_FOLDER ? removeProductFromFolder(product.id) : addProductsToFolder(target, [product.id]),
      );
      if (done) router.refresh();
    });
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border bg-background">
      <div className="relative aspect-square bg-muted">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt=""
            fill
            sizes="(min-width: 1024px) 200px, (min-width: 640px) 33vw, 50vw"
            className="pointer-events-none object-cover select-none"
            draggable={false}
          />
        ) : (
          <ImageOff className="absolute inset-0 m-auto size-5 text-muted-foreground" aria-hidden />
        )}
        <ProductStatusBadge status={product.status} className="absolute top-2 left-2 bg-background shadow-soft" />
        {handle}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2.5">
        <div className="min-w-0">
          <Link href={`/admin/products/${product.id}`} className="line-clamp-2 text-sm font-medium hover:underline">
            {product.name}
          </Link>
          <p className="text-xs text-muted-foreground tabular-nums">{product.price}</p>
        </div>
        <div className="mt-auto flex items-center gap-1">
          <SelectInput
            label={`ย้าย ${product.name} ไปโฟลเดอร์`}
            hideLabel
            value={product.folderId ?? NO_FOLDER}
            onValueChange={move}
            options={[
              { value: NO_FOLDER, label: "ไม่มีโฟลเดอร์" },
              ...folders.map((f) => ({ value: f.id, label: f.nameTH })),
            ]}
            wrapperClassName="min-w-0 flex-1 space-y-0"
            className="h-9! text-xs"
          />
          {pending && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-label="กำลังย้าย" />}
        </div>
      </div>
    </div>
  );
}

function AddProductsDialog({ folder, allProducts }: { folder: ManagedFolder; allProducts: ManagedFolderProduct[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allProducts.filter((p) => p.folderId !== folder.id && (!q || p.name.toLowerCase().includes(q)));
  }, [allProducts, folder.id, query]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onSubmit() {
    startTransition(async () => {
      const done = await runWithToast(() => addProductsToFolder(folder.id, [...selected]));
      if (!done) return;
      setOpen(false);
      setSelected(new Set());
      setQuery("");
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (pending) return;
        setOpen(v);
        if (!v) setSelected(new Set());
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="rounded-full">
          <Plus aria-hidden /> เพิ่มสินค้า
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>เพิ่มสินค้าเข้า {folder.nameTH}</DialogTitle>
          <DialogDescription>สินค้าที่อยู่ในโฟลเดอร์อื่นจะถูกย้ายมาที่นี่ และต่อท้ายลำดับเดิม</DialogDescription>
        </DialogHeader>
        <label className="relative block">
          <span className="sr-only">ค้นหาสินค้า</span>
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาชื่อสินค้า"
            className="h-10 rounded-xl pl-9"
          />
        </label>
        {candidates.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">ไม่พบสินค้าที่เพิ่มได้</p>
        ) : (
          <ul className="-mx-2 max-h-80 space-y-1 overflow-y-auto px-2">
            {candidates.map((p) => (
              <li key={p.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl p-2 hover:bg-muted has-[:checked]:bg-secondary/60">
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggle(p.id)}
                    className="size-4 accent-brand-strong"
                  />
                  <span className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {p.imageUrl && <Image src={p.imageUrl} alt="" fill sizes="40px" className="object-cover" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {p.folderId ? "อยู่ในโฟลเดอร์อื่น — จะถูกย้าย" : "ไม่มีโฟลเดอร์"}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button onClick={onSubmit} disabled={pending || selected.size === 0} aria-busy={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            เพิ่ม {selected.size > 0 ? `${selected.size} รายการ` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FolderDialog({ title, trigger, folder }: { title: string; trigger: ReactNode; folder?: ManagedFolder }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const err = (name: string) => (state && !state.ok ? state.fieldErrors?.[name] : undefined);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await saveFolder(folder?.id ?? null, state, formData);
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
          <DialogDescription>
            โฟลเดอร์ที่เก็บถาวรจะไม่แสดงในหน้าร้าน แต่หน้าสินค้ายังเปิดได้ตามสถานะของสินค้า
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {state && !state.ok && !state.fieldErrors && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label="ชื่อ (ไทย)"
              name="nameTH"
              defaultValue={folder?.nameTH}
              maxLength={80}
              required
              error={err("nameTH")}
            />
            <TextInput
              label="ชื่อ (English)"
              name="nameEN"
              defaultValue={folder?.nameEN}
              maxLength={80}
              required
              error={err("nameEN")}
            />
          </div>
          <TextInput
            label="Slug"
            name="slug"
            defaultValue={folder?.slug}
            maxLength={100}
            required
            error={err("slug")}
            hint="ใช้ใน URL เช่น /shop?folder=hot-brand (a-z, 0-9 และ -)"
          />
          <SelectInput
            label="สถานะ"
            name="status"
            defaultValue={folder?.status ?? "ACTIVE"}
            options={[
              { value: "ACTIVE", label: "แสดงในหน้าร้าน" },
              { value: "ARCHIVED", label: "เก็บถาวร (ซ่อน)" },
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
