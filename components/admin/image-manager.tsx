"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { runWithToast, TextInput } from "@/components/admin/form-controls";
import { useDirectUpload } from "@/components/admin/use-direct-upload";
import {
  confirmImageUpload,
  deleteImage,
  moveImage,
  requestImageUpload,
  setPrimaryImage,
  updateImageAlt,
} from "@/lib/products/image-actions";
import { acceptAttribute, IMAGE_FILE_TYPES } from "@/lib/storage/file-types";

export type ManagedImage = {
  id: string;
  url: string;
  altTextTH: string;
  altTextEN: string;
  isPrimary: boolean;
};

export function ImageManager({ productId, images }: { productId: string; images: ManagedImage[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const { upload, uploading } = useDirectUpload(
    (input) => requestImageUpload(productId, input),
    (input) => confirmImageUpload(productId, input),
  );

  const run = (fn: () => ReturnType<typeof setPrimaryImage>) =>
    startTransition(async () => {
      if (await runWithToast(fn)) router.refresh();
    });

  const busy = pending || uploading !== null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept={acceptAttribute(IMAGE_FILE_TYPES)}
          multiple
          hidden
          onChange={async (e) => {
            const files = e.currentTarget.files;
            if (!files?.length) return;
            const input = e.currentTarget;
            if ((await upload(files)) > 0) router.refresh();
            input.value = "";
          }}
        />
        <Button onClick={() => inputRef.current?.click()} disabled={busy} className="rounded-full">
          {uploading ? <Loader2 className="animate-spin" aria-hidden /> : <ImagePlus aria-hidden />}
          {uploading ? `กำลังอัปโหลด ${uploading}` : "เพิ่มรูปภาพ"}
        </Button>
        <p className="text-xs text-muted-foreground">JPG, PNG, WEBP ไม่เกิน 5 MB ต่อรูป · รูปแรกเป็นรูปหลักอัตโนมัติ</p>
      </div>

      {images.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          ยังไม่มีรูปภาพ
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {images.map((img, i) => (
            <li key={img.id} className="overflow-hidden rounded-2xl border bg-card shadow-soft">
              <div className="relative aspect-[4/3] bg-muted">
                <Image
                  src={img.url}
                  alt={img.altTextTH || `รูปที่ ${i + 1}`}
                  fill
                  sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
                  className="object-cover"
                />
                {img.isPrimary && (
                  <Badge className="absolute top-2 left-2">
                    <Star aria-hidden /> รูปหลัก
                  </Badge>
                )}
              </div>
              <div className="space-y-3 p-3">
                <AltTextForm image={img} disabled={busy} onSaved={() => router.refresh()} />
                <div className="flex flex-wrap gap-1">
                  <Button
                    size="icon-sm"
                    variant="outline"
                    aria-label="เลื่อนขึ้น"
                    disabled={busy || i === 0}
                    onClick={() => run(() => moveImage(img.id, "up"))}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="outline"
                    aria-label="เลื่อนลง"
                    disabled={busy || i === images.length - 1}
                    onClick={() => run(() => moveImage(img.id, "down"))}
                  >
                    <ArrowDown />
                  </Button>
                  {!img.isPrimary && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => setPrimaryImage(img.id))}>
                      <Star aria-hidden /> ตั้งเป็นรูปหลัก
                    </Button>
                  )}
                  <ConfirmDialog
                    trigger={
                      <Button size="sm" variant="destructive" disabled={busy} className="ml-auto">
                        <Trash2 aria-hidden /> ลบ
                      </Button>
                    }
                    title="ลบรูปนี้?"
                    description="รูปจะถูกลบออกจากสินค้าและ storage"
                    confirmLabel="ลบรูป"
                    destructive
                    onConfirm={async () => {
                      const done = await runWithToast(() => deleteImage(img.id));
                      if (done) router.refresh();
                      return done;
                    }}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AltTextForm({ image, disabled, onSaved }: { image: ManagedImage; disabled: boolean; onSaved: () => void }) {
  const [th, setTh] = useState(image.altTextTH);
  const [en, setEn] = useState(image.altTextEN);
  const [pending, startTransition] = useTransition();
  const dirty = th !== image.altTextTH || en !== image.altTextEN;

  return (
    <div className="space-y-2">
      <TextInput label="Alt text (ไทย)" value={th} maxLength={200} onChange={(e) => setTh(e.target.value)} className="h-9" />
      <TextInput label="Alt text (English)" value={en} maxLength={200} onChange={(e) => setEn(e.target.value)} className="h-9" />
      {dirty && (
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled || pending}
          onClick={() =>
            startTransition(async () => {
              if (await runWithToast(() => updateImageAlt(image.id, { altTextTH: th, altTextEN: en }))) onSaved();
            })
          }
        >
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          บันทึก alt text
        </Button>
      )}
    </div>
  );
}
