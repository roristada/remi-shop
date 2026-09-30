"use client";

import { useRef, useState, useTransition } from "react";
import { PreviewImage } from "@/components/shared/preview-image";
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
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ImagePlus, Loader2, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { runWithToast } from "@/components/admin/form-controls";
import { useDirectUpload } from "@/components/admin/use-direct-upload";
import {
  confirmImageUpload,
  deleteImage,
  reorderImages,
  requestImageUpload,
  setPrimaryImage,
} from "@/lib/products/image-actions";
import { acceptAttribute, PRODUCT_IMAGE_FILE_TYPES } from "@/lib/storage/file-types";
import { cn } from "@/lib/utils";

export type ManagedImage = {
  id: string;
  url: string;
  isPrimary: boolean;
};

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

export function ImageManager({ productId, images }: { productId: string; images: ManagedImage[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const { upload, uploading } = useDirectUpload(
    (input) => requestImageUpload(productId, input),
    (input) => confirmImageUpload(productId, input),
  );

  // Local order for instant feedback while dragging; reset whenever the server sends new data.
  const [items, setItems] = useState(images);
  const [serverImages, setServerImages] = useState(images);
  if (images !== serverImages) {
    setServerImages(images);
    setItems(images);
  }

  const sensors = useSensors(
    // Small distance so clicks on buttons/inputs inside a card don't start a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const busy = pending || uploading !== null;

  const run = (fn: () => ReturnType<typeof setPrimaryImage>) =>
    startTransition(async () => {
      if (await runWithToast(fn)) router.refresh();
    });

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const previous = items;
    const next = arrayMove(
      items,
      items.findIndex((i) => i.id === active.id),
      items.findIndex((i) => i.id === over.id),
    );
    setItems(next);
    startTransition(async () => {
      const saved = await runWithToast(() => reorderImages(productId, next.map((i) => i.id)));
      if (!saved) setItems(previous);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept={acceptAttribute(PRODUCT_IMAGE_FILE_TYPES)}
          multiple
          hidden
          onChange={async (e) => {
            const input = e.currentTarget;
            if (!input.files?.length) return;
            if ((await upload(input.files)) > 0) router.refresh();
            input.value = "";
          }}
        />
        <Button onClick={() => inputRef.current?.click()} disabled={busy} className="rounded-full">
          {uploading ? <Loader2 className="animate-spin" aria-hidden /> : <ImagePlus aria-hidden />}
          {uploading ? `กำลังอัปโหลด ${uploading}` : "เพิ่มรูปภาพ"}
        </Button>
        <p className="text-xs text-muted-foreground">
          JPG, PNG, WEBP, GIF ไม่เกิน 50 MB ต่อรูป · ลาก <GripVertical className="inline size-3" aria-hidden /> เพื่อเรียงลำดับ ·
          รูปแรกที่อัปโหลดเป็นรูปหลักอัตโนมัติ
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">ยังไม่มีรูปภาพ</div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} accessibility={DND_A11Y}>
          <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((img, i) => (
                <SortableImageCard
                  key={img.id}
                  image={img}
                  index={i}
                  disabled={busy}
                  onSetPrimary={() => run(() => setPrimaryImage(img.id))}
                  onDelete={async () => {
                    const done = await runWithToast(() => deleteImage(img.id));
                    if (done) router.refresh();
                    return done;
                  }}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function SortableImageCard({
  image,
  index,
  disabled,
  onSetPrimary,
  onDelete,
}: {
  image: ManagedImage;
  index: number;
  disabled: boolean;
  onSetPrimary: () => void;
  onDelete: () => Promise<boolean>;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: image.id,
    disabled,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "overflow-hidden rounded-2xl border bg-card shadow-soft",
        isDragging && "relative z-10 opacity-80 shadow-lg ring-2 ring-primary",
      )}
    >
      <div className="relative aspect-[4/3] bg-muted">
        <PreviewImage
          src={image.url}
          alt={`รูปที่ ${index + 1}`}
          fill
          sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="pointer-events-none object-cover select-none"
          draggable={false}
        />
        {image.isPrimary && (
          <Badge className="absolute top-2 left-2">
            <Star aria-hidden /> รูปหลัก
          </Badge>
        )}
        <button
          ref={setActivatorNodeRef}
          type="button"
          aria-label={`ลากเพื่อย้ายรูปที่ ${index + 1}`}
          className="absolute top-2 right-2 grid size-9 cursor-grab touch-none place-items-center rounded-full bg-background/90 shadow-soft outline-none focus-visible:ring-3 focus-visible:ring-ring/80 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
        <span className="absolute bottom-2 left-2 rounded-full bg-background/90 px-2 text-xs font-medium">
          {index + 1}
        </span>
      </div>
      <div className="space-y-3 p-3">
        <div className="flex flex-wrap gap-1">
          {!image.isPrimary && (
            <Button size="sm" variant="outline" disabled={disabled} onClick={onSetPrimary}>
              <Star aria-hidden /> ตั้งเป็นรูปหลัก
            </Button>
          )}
          <ConfirmDialog
            trigger={
              <Button size="sm" variant="destructive" disabled={disabled} className="ml-auto">
                <Trash2 aria-hidden /> ลบ
              </Button>
            }
            title="ลบรูปนี้?"
            description="รูปจะถูกลบออกจากสินค้าและ storage"
            confirmLabel="ลบรูป"
            destructive
            onConfirm={onDelete}
          />
        </div>
      </div>
    </li>
  );
}
