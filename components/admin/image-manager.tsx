"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PreviewImage } from "@/components/shared/preview-image";
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
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditorSection } from "@/components/admin/product-editor";
import { uploadToStorage } from "@/components/admin/use-direct-upload";
import { confirmImageUpload, requestImageUpload, saveImageChanges } from "@/lib/products/image-actions";
import { acceptAttribute, checkFileMeta, FILE_TYPE_ERROR_TH, PRODUCT_IMAGE_FILE_TYPES } from "@/lib/storage/file-types";
import { MAX_PRODUCT_FILE_SIZE } from "@/lib/storage/buckets";
import { cn } from "@/lib/utils";

export type ManagedImage = { id: string; url: string };

const MAX_IMAGES = 20;

/** A saved image (`id`) or one picked in this session (`file`, previewed from memory). */
type Item = { key: string; id: string | null; url: string; file: File | null };

const DND_A11Y = {
  screenReaderInstructions: {
    draggable: "กด Space หรือ Enter เพื่อจับรูป ใช้ลูกศรเพื่อย้าย แล้วกด Space หรือ Enter อีกครั้งเพื่อวาง กด Escape เพื่อยกเลิก",
  },
  announcements: {
    onDragStart: () => "จับรูปแล้ว",
    onDragOver: () => "",
    onDragEnd: ({ over }: { over: unknown }) => (over ? "วางรูปแล้ว" : "ยกเลิกการย้าย"),
    onDragCancel: () => "ยกเลิกการย้าย",
  },
};

const fromSaved = (images: ManagedImage[]): Item[] => images.map((i) => ({ key: i.id, id: i.id, url: i.url, file: null }));

/**
 * Product pictures. Adding, reordering and removing only change this list; everything is saved by
 * the editor's save button (pictures can be added before the product exists). The first picture
 * is the main one shown in the shop.
 */
export function ImageManager({ images }: { images: ManagedImage[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState(() => fromSaved(images));
  const [serverImages, setServerImages] = useState(images);
  // New data from the server (after a save) replaces the local list.
  if (images !== serverImages) {
    setServerImages(images);
    setItems(fromSaved(images));
  }

  // Object URLs of picked files are released when they leave the list.
  const objectUrls = useRef(new Set<string>());
  useEffect(() => {
    const urls = objectUrls.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const savedIds = images.map((i) => i.id);
  const currentIds = items.map((i) => i.id ?? i.key);
  const dirty = items.some((i) => i.file) || savedIds.join() !== currentIds.join();

  const { saving } = useEditorSection(
    "images",
    {
      order: 30,
      tab: "details",
      label: "รูปภาพ",
      save: async (ctx) => {
        const productId = ctx.productId;
        if (!productId) return false;
        const list = [...items];
        // Upload new pictures one by one; each becomes a saved image right away, so a retry skips it.
        for (const [index, item] of list.entries()) {
          if (!item.file) continue;
          const stored = await uploadToStorage((input) => requestImageUpload(productId, input), item.file);
          const confirmed = stored.ok ? await confirmImageUpload(productId, { path: stored.path, fileName: item.file.name }) : null;
          if (!stored.ok || !confirmed?.ok) {
            const error = !stored.ok ? stored.error : confirmed && !confirmed.ok ? confirmed.error : "อัปโหลดไม่สำเร็จ";
            toast.error(`${item.file.name}: ${error}`);
            setItems(list);
            return false;
          }
          list[index] = { ...item, id: confirmed.data.id, file: null };
        }
        setItems(list);
        const orderedIds = list.map((i) => i.id as string);
        const deleteIds = savedIds.filter((id) => !orderedIds.includes(id));
        const result = await saveImageChanges(productId, { orderedIds, deleteIds });
        if (!result.ok) {
          toast.error(`รูปภาพ: ${result.error}`);
          return false;
        }
        return true;
      },
    },
    dirty,
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function addFiles(files: File[]) {
    const room = MAX_IMAGES - items.length;
    if (files.length > room) toast.error(`รูปภาพได้สูงสุด ${MAX_IMAGES} รูป`);
    const accepted = files.slice(0, Math.max(0, room)).filter((file) => {
      const error = checkFileMeta(PRODUCT_IMAGE_FILE_TYPES, file.name, file.size, MAX_PRODUCT_FILE_SIZE);
      if (error) toast.error(`${file.name}: ${FILE_TYPE_ERROR_TH[error]}`);
      return !error;
    });
    const added = accepted.map((file) => {
      const url = URL.createObjectURL(file);
      objectUrls.current.add(url);
      return { key: crypto.randomUUID(), id: null, url, file };
    });
    setItems((prev) => [...prev, ...added]);
  }

  function remove(key: string) {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    setItems((prev) =>
      arrayMove(
        prev,
        prev.findIndex((i) => i.key === active.id),
        prev.findIndex((i) => i.key === over.id),
      ),
    );
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept={acceptAttribute(PRODUCT_IMAGE_FILE_TYPES)}
        multiple
        hidden
        onChange={(e) => {
          const input = e.currentTarget;
          if (input.files?.length) addFiles(Array.from(input.files));
          input.value = "";
        }}
      />
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} accessibility={DND_A11Y}>
        <SortableContext items={items.map((i) => i.key)} strategy={rectSortingStrategy}>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
            {items.map((item, i) => (
              <SortableImage key={item.key} item={item} index={i} disabled={saving} onRemove={() => remove(item.key)} />
            ))}
            {items.length < MAX_IMAGES && (
              <li>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={saving}
                  className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                >
                  <ImagePlus className="size-5" aria-hidden />
                  เพิ่มรูป
                </button>
              </li>
            )}
          </ul>
        </SortableContext>
      </DndContext>
      <p className="text-xs text-muted-foreground">
        รูปแรกคือรูปหลักที่แสดงหน้าร้าน · ลากเพื่อเรียงลำดับ · JPG, PNG, WEBP, GIF ไม่เกิน 50 MB ต่อรูป (สูงสุด {MAX_IMAGES} รูป) ·
        ระบบแปลงเป็น WebP ให้อัตโนมัติ GIF ยังเคลื่อนไหวได้
      </p>
      {items.length === 0 && (
        <Button type="button" variant="secondary" className="rounded-full" onClick={() => inputRef.current?.click()} disabled={saving}>
          <ImagePlus aria-hidden /> เพิ่มรูปภาพ
        </Button>
      )}
    </div>
  );
}

function SortableImage({ item, index, disabled, onRemove }: { item: Item; index: number; disabled: boolean; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.key, disabled });
  const label = index === 0 ? "รูปหลัก" : `รูปที่ ${index + 1}`;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("group relative", isDragging && "z-10 opacity-80")}
    >
      <div
        {...attributes}
        {...listeners}
        aria-label={`${label} — ลากเพื่อย้าย`}
        className={cn(
          "relative aspect-square cursor-grab touch-none overflow-hidden rounded-xl bg-muted ring-1 ring-black/5 outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing",
          index === 0 && "ring-2 ring-brand-strong",
          isDragging && "shadow-lg",
        )}
      >
        {item.url.startsWith("blob:") ? (
          // A local preview of a picked file; next/image cannot load blob: URLs.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.url} alt="" className="pointer-events-none size-full object-cover select-none" draggable={false} />
        ) : (
          <PreviewImage src={item.url} alt="" fill sizes="120px" className="pointer-events-none object-cover select-none" draggable={false} />
        )}
        <span
          className={cn(
            "absolute bottom-1 left-1 rounded-full px-1.5 text-[0.65rem] font-medium",
            index === 0 ? "bg-brand-strong text-white" : "bg-background/90",
          )}
        >
          {index === 0 ? "รูปหลัก" : index + 1}
        </span>
      </div>
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`ลบ${label}`}
        className="absolute -top-1.5 -right-1.5 grid size-6 place-items-center rounded-full bg-foreground text-background shadow-soft transition-opacity hover:bg-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </li>
  );
}
