"use client";

import { useId, useMemo, useState, useTransition, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
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
function useLocalOrder<T>(serverItems: T) {
  const [items, setItems] = useState(serverItems);
  const [seen, setSeen] = useState(serverItems);
  if (serverItems !== seen) {
    setSeen(serverItems);
    setItems(serverItems);
  }
  return [items, setItems] as const;
}

const anchorId = (id: string) => `folder-${id}`;

type DragData =
  | { type: "folder" }
  | { type: "product"; container: string | null }
  | { type: "zone"; container: string | null };

const zoneId = (folderId: string | null) => `zone:${folderId ?? "none"}`;
const dragData = (d: { data: { current?: unknown } } | null | undefined) => (d?.data.current ?? null) as DragData | null;

/**
 * Folders only collide with folders. Products prefer the tile under the pointer, then the
 * folder area under it (drop into another folder), then the closest target (keyboard).
 */
const collisionDetection: CollisionDetection = (args) => {
  const draggingFolder = dragData(args.active)?.type === "folder";
  const scoped = {
    ...args,
    droppableContainers: args.droppableContainers.filter((c) => (dragData(c)?.type === "folder") === draggingFolder),
  };
  if (draggingFolder) return closestCenter(scoped);
  const hits = pointerWithin(scoped);
  const productHits = hits.filter((h) => dragData(h.data?.droppableContainer)?.type === "product");
  if (productHits.length > 0) return productHits;
  if (hits.length > 0) return hits;
  return closestCenter(scoped);
};

type Board = { folders: ManagedFolder[]; unfiled: ManagedFolderProduct[] };

function productsIn(board: Board, container: string | null) {
  return container === null ? board.unfiled : (board.folders.find((f) => f.id === container)?.products ?? []);
}

function withProducts(board: Board, container: string | null, products: ManagedFolderProduct[]): Board {
  return container === null
    ? { ...board, unfiled: products }
    : { ...board, folders: board.folders.map((f) => (f.id === container ? { ...f, products } : f)) };
}

export function FolderManager({
  folders,
  allProducts,
}: {
  folders: ManagedFolder[];
  allProducts: ManagedFolderProduct[];
}) {
  const router = useRouter();
  const serverBoard = useMemo<Board>(
    () => ({ folders, unfiled: allProducts.filter((p) => p.folderId === null) }),
    [folders, allProducts],
  );
  const [board, setBoard] = useLocalOrder(serverBoard);
  const [pending, startTransition] = useTransition();
  const [activeProduct, setActiveProduct] = useState<ManagedFolderProduct | null>(null);
  // undefined = not over any product area; null = over "no folder".
  const [overContainer, setOverContainer] = useState<string | null | undefined>(undefined);
  const sensors = useSortSensors();
  const dndId = useId();
  const folderOptions: FolderOption[] = board.folders.map((f) => ({ id: f.id, nameTH: f.nameTH }));

  function save(previous: Board, action: () => Promise<boolean>) {
    startTransition(async () => {
      if (!(await action())) setBoard(previous);
      router.refresh();
    });
  }

  function resetDrag() {
    setActiveProduct(null);
    setOverContainer(undefined);
  }

  function onDragStart({ active }: DragStartEvent) {
    const data = dragData(active);
    if (data?.type !== "product") return;
    setActiveProduct(productsIn(board, data.container).find((p) => p.id === active.id) ?? null);
  }

  function onDragOver({ over }: DragOverEvent) {
    const data = dragData(over);
    setOverContainer(data && data.type !== "folder" ? data.container : undefined);
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    resetDrag();
    const from = dragData(active);
    const to = dragData(over);
    if (!over || !from || !to) return;
    const previous = board;

    if (from.type === "folder") {
      if (active.id === over.id) return;
      const next = arrayMove(
        board.folders,
        board.folders.findIndex((f) => f.id === active.id),
        board.folders.findIndex((f) => f.id === over.id),
      );
      setBoard({ ...board, folders: next });
      save(previous, () => runWithToast(() => reorderFolders(next.map((f) => f.id))));
      return;
    }
    if (from.type !== "product" || to.type === "folder") return;

    const productId = String(active.id);
    const source = productsIn(board, from.container);
    const target = productsIn(board, to.container);

    if (from.container === to.container) {
      // Unfiled products have no order of their own.
      if (to.container === null || to.type !== "product" || active.id === over.id) return;
      const folderId = to.container;
      const next = arrayMove(
        source,
        source.findIndex((p) => p.id === active.id),
        source.findIndex((p) => p.id === over.id),
      );
      setBoard(withProducts(board, folderId, next));
      save(previous, () =>
        runWithToast(() =>
          reorderFolderProducts(
            folderId,
            next.map((p) => p.id),
          ),
        ),
      );
      return;
    }

    // Moving to another folder (or out of all folders): lands where the tile under the pointer is.
    const moved = source.find((p) => p.id === productId);
    if (!moved) return;
    const overIndex = to.type === "product" ? target.findIndex((p) => p.id === over.id) : -1;
    const index = overIndex < 0 ? target.length : overIndex;
    const nextTarget = [...target.slice(0, index), { ...moved, folderId: to.container }, ...target.slice(index)];
    setBoard(
      withProducts(
        withProducts(
          board,
          from.container,
          source.filter((p) => p.id !== productId),
        ),
        to.container,
        nextTarget,
      ),
    );

    const destination = to.container;
    save(previous, async () => {
      if (destination === null) return runWithToast(() => removeProductFromFolder(productId));
      if (!(await runWithToast(() => addProductsToFolder(destination, [productId])))) return false;
      // The server appends to the end; reorder only when dropped before it.
      if (index === target.length) return true;
      return runWithToast(() =>
        reorderFolderProducts(
          destination,
          nextTarget.map((p) => p.id),
        ),
      );
    });
  }

  const isDropTarget = (container: string | null) =>
    activeProduct !== null && overContainer === container && activeProduct.folderId !== container;

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
          ลาก <GripVertical className="inline size-3" aria-hidden /> เพื่อเรียงลำดับ หรือลากสินค้าไปวางในโฟลเดอร์อื่น ·
          สินค้าหนึ่งชิ้นอยู่ได้หนึ่งโฟลเดอร์
        </p>
      </div>

      {board.folders.length > 0 && (
        <nav aria-label="ไปที่โฟลเดอร์" className="flex flex-wrap gap-2">
          {board.folders.map((f) => (
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

      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={resetDrag}
        accessibility={DND_A11Y}
      >
        {board.folders.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-card p-12 text-center text-sm text-muted-foreground">
            ยังไม่มีโฟลเดอร์ — หน้าร้านจะแสดงสินค้าทั้งหมดแบบรวม
          </div>
        ) : (
          <SortableContext items={board.folders.map((f) => f.id)} strategy={verticalListSortingStrategy}>
            <ol className="space-y-5">
              {board.folders.map((f) => (
                <SortableFolder
                  key={f.id}
                  folder={f}
                  folders={folderOptions}
                  allProducts={allProducts}
                  disabled={pending}
                  isDropTarget={isDropTarget(f.id)}
                />
              ))}
            </ol>
          </SortableContext>
        )}

        <section aria-labelledby="unfiled-title" className="rounded-3xl border border-dashed bg-card/60 p-4 sm:p-6">
          <div className="mb-4 flex items-baseline gap-3">
            <h2 id="unfiled-title" className="text-lg font-semibold">
              ไม่มีโฟลเดอร์
            </h2>
            <span className="text-sm text-muted-foreground tabular-nums">{board.unfiled.length} รายการ</span>
          </div>
          <ProductZone
            container={null}
            products={board.unfiled}
            folders={folderOptions}
            disabled={pending}
            isDropTarget={isDropTarget(null)}
            emptyText="ทุกสินค้าอยู่ในโฟลเดอร์แล้ว — ลากสินค้ามาวางที่นี่เพื่อนำออกจากโฟลเดอร์"
          />
        </section>

        <DragOverlay>
          {activeProduct && (
            <div className="w-44 rotate-2 rounded-2xl shadow-lg">
              <ProductTile product={activeProduct} folders={folderOptions} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function SortableFolder({
  folder,
  folders,
  allProducts,
  disabled,
  isDropTarget,
}: {
  folder: ManagedFolder;
  folders: FolderOption[];
  allProducts: ManagedFolderProduct[];
  disabled: boolean;
  isDropTarget: boolean;
}) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: folder.id,
    disabled,
    data: { type: "folder" } satisfies DragData,
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
      <ProductZone
        container={folder.id}
        products={folder.products}
        folders={folders}
        disabled={disabled}
        isDropTarget={isDropTarget}
        emptyText="ยังไม่มีสินค้าในโฟลเดอร์นี้ — ลากสินค้ามาวาง หรือกด “เพิ่มสินค้า”"
      />
    </li>
  );
}

/** A folder's (or the unfiled) product grid: sortable tiles plus a drop area for products from elsewhere. */
function ProductZone({
  container,
  products,
  folders,
  disabled,
  isDropTarget,
  emptyText,
}: {
  container: string | null;
  products: ManagedFolderProduct[];
  folders: FolderOption[];
  disabled: boolean;
  isDropTarget: boolean;
  emptyText: string;
}) {
  const { setNodeRef } = useDroppable({ id: zoneId(container), data: { type: "zone", container } satisfies DragData });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-2xl transition-[box-shadow,background-color]",
        isDropTarget && "bg-secondary/40 ring-2 ring-primary ring-offset-4 ring-offset-card",
      )}
    >
      {products.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <SortableContext items={products.map((p) => p.id)} strategy={rectSortingStrategy}>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {products.map((p) => (
              <SortableProduct key={p.id} product={p} container={container} folders={folders} disabled={disabled} />
            ))}
          </ul>
        </SortableContext>
      )}
    </div>
  );
}

function SortableProduct({
  product,
  container,
  folders,
  disabled,
}: {
  product: ManagedFolderProduct;
  container: string | null;
  folders: FolderOption[];
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: product.id,
    disabled,
    data: { type: "product", container } satisfies DragData,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "opacity-40")}
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
