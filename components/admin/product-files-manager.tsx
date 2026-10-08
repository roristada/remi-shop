"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, FilePlus2, FileText, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadToStorage } from "@/components/admin/use-direct-upload";
import { newId, resolveVariantId, useEditorSection, useEditorVariants, type SaveContext } from "@/components/admin/product-editor";
import { createVersion, discardFileUploads, requestFileUpload, saveVersionFiles } from "@/lib/products/version-actions";
import { acceptAttribute, checkFileMeta, DIGITAL_FILE_TYPES, FILE_TYPE_ERROR_TH } from "@/lib/storage/file-types";
import { MAX_PRODUCT_FILE_SIZE } from "@/lib/storage/buckets";
import { cn } from "@/lib/utils";

/** variantId null = every buyer gets the file; set = only buyers of that variant. */
export type ManagedFile = { id: string; fileName: string; fileSize: number; fileType: string; variantId: string | null };

/** A saved file (`savedId`) or one picked in this session (`file`). */
type FileRow = { key: string; savedId: string | null; fileName: string; fileSize: number; variantId: string | null; file: File | null; deleted: boolean };

/** Files live in one hidden version record; a product without one gets it on its first upload. */
const FILE_CONTAINER_VERSION = "1.0";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

const toRows = (files: ManagedFile[]): FileRow[] =>
  files.map((f) => ({ key: f.id, savedId: f.id, fileName: f.fileName, fileSize: f.fileSize, variantId: f.variantId, file: null, deleted: false }));

/**
 * The product's files. Picking and removing files only change this page; the editor's save button
 * uploads and writes everything. Files can change at any time, also while the product is published
 * (buyers are notified).
 */
export function ProductFilesManager({
  versionId,
  files,
  buyerCount,
}: {
  /** The record holding the files; null until the first file is saved. */
  versionId: string | null;
  files: ManagedFile[];
  buyerCount: number;
}) {
  // Server data is read once. Saving refreshes the route (revalidation) while later sections still
  // hold unsaved work, so the list is never reset from props; after a save the page navigates.
  const [rows, setRows] = useState(() => toRows(files));
  const savedVersionId = useRef(versionId);
  const { variants } = useEditorVariants();
  const dirty = rows.some((f) => f.file || f.deleted);

  const { saving } = useEditorSection(
    "versions",
    { order: 40, tab: "versions", label: "ไฟล์", save: (ctx) => saveFiles(ctx, rows, savedVersionId, setRows) },
    dirty,
  );

  const addFiles = (picked: File[], variantId: string | null) => {
    const accepted = picked.filter((file) => {
      const error = checkFileMeta(DIGITAL_FILE_TYPES, file.name, file.size, MAX_PRODUCT_FILE_SIZE);
      if (error) toast.error(`${file.name}: ${FILE_TYPE_ERROR_TH[error]}`);
      return !error;
    });
    setRows((prev) => [
      ...prev,
      ...accepted.map((file) => ({ key: newId(), savedId: null, fileName: file.name, fileSize: file.size, variantId, file, deleted: false })),
    ]);
  };
  const removeFile = (key: string) =>
    setRows((prev) => prev.flatMap((f) => (f.key !== key ? [f] : f.savedId ? [{ ...f, deleted: !f.deleted }] : [])));

  // One group per option, plus the shared group every buyer gets.
  const groups: { variantId: string | null; title: string; hint: string }[] =
    variants.length === 0
      ? [{ variantId: null, title: "", hint: "" }]
      : [
          { variantId: null, title: "ไฟล์สำหรับทุกตัวเลือก", hint: "ผู้ซื้อทุกตัวเลือกได้ไฟล์เหล่านี้" },
          ...variants.map((v) => ({ variantId: v.id, title: `ไฟล์ของตัวเลือก ${v.name}`, hint: `เฉพาะผู้ซื้อตัวเลือก ${v.name}` })),
        ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        ไฟล์ละไม่เกิน 50 MB · ไม่มีไฟล์ก็เผยแพร่ได้ (ร้านส่งไฟล์ทางอีเมลภายใน 7 วันทำการ) · แก้ไฟล์ได้ทุกเวลา
        ลูกค้าที่ซื้อแล้วจะได้รับแจ้งเตือน
      </p>
      <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-soft">
        {groups.map((g) => (
          <FileGroup
            key={g.variantId ?? "shared"}
            title={g.title}
            hint={g.hint}
            rows={rows.filter((f) => f.variantId === g.variantId)}
            disabled={saving}
            buyerCount={buyerCount}
            onAdd={(picked) => addFiles(picked, g.variantId)}
            onRemove={removeFile}
          />
        ))}
      </div>
    </div>
  );
}

/** New files go straight to Storage, then one write records uploads and removals. Stops at the first failure. */
async function saveFiles(
  ctx: SaveContext,
  rows: FileRow[],
  versionIdRef: { current: string | null },
  setRows: (rows: FileRow[]) => void,
): Promise<boolean> {
  const productId = ctx.productId;
  if (!productId) return false;
  const pending = rows.filter((f) => f.file && !f.deleted);
  const deletes = rows.filter((f) => f.deleted && f.savedId).map((f) => f.savedId!);
  if (pending.length === 0 && deletes.length === 0) return true;

  let versionId = versionIdRef.current;
  if (!versionId) {
    const fd = new FormData();
    fd.set("versionNumber", FILE_CONTAINER_VERSION);
    const result = await createVersion(productId, null, fd);
    if (!result.ok) {
      toast.error(Object.values(result.fieldErrors ?? {})[0] ?? result.error);
      return false;
    }
    versionId = versionIdRef.current = result.data.id;
  }
  const id = versionId;

  const uploads: { path: string; fileName: string; variantId: string | null }[] = [];
  for (const f of pending) {
    const stored = await uploadToStorage((input) => requestFileUpload(id, input), f.file!);
    if (!stored.ok) {
      await discardFileUploads(id, uploads.map((u) => u.path)).catch(() => undefined);
      toast.error(`${f.fileName}: ${stored.error}`);
      return false;
    }
    uploads.push({ path: stored.path, fileName: f.fileName, variantId: resolveVariantId(ctx, f.variantId) });
  }
  const result = await saveVersionFiles(id, { uploads, moves: [], deletes });
  if (!result.ok) {
    toast.error(result.error);
    return false;
  }
  if (result.notify && result.message) toast.info(result.message);
  // Saved: drop the done changes so a retry does not repeat them.
  setRows(rows.filter((f) => !f.deleted && !f.file));
  return true;
}

function FileGroup({
  title,
  hint,
  rows,
  disabled,
  buyerCount,
  onAdd,
  onRemove,
}: {
  title: string;
  hint: string;
  rows: FileRow[];
  disabled: boolean;
  buyerCount: number;
  onAdd: (files: File[]) => void;
  onRemove: (key: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <section className={title ? "space-y-3 rounded-xl border bg-muted/30 p-3" : "space-y-3"}>
      {title && (
        <div>
          <h4 className="text-sm font-semibold">{title}</h4>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      )}

      {rows.length > 0 && (
        <ul className="divide-y rounded-xl border bg-background">
          {rows.map((f) => (
            <li key={f.key} className="flex items-center gap-3 p-3 text-sm">
              <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className={cn("min-w-0 flex-1 truncate", f.deleted && "text-muted-foreground line-through")} title={f.fileName}>
                {f.fileName}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(f.fileSize)}</span>
              {f.savedId && !f.deleted && (
                <Button asChild size="icon-sm" variant="ghost">
                  <a
                    href={`/api/admin/files/${f.savedId}/download`}
                    aria-label={`ทดสอบดาวน์โหลด ${f.fileName}`}
                    title="ทดสอบดาวน์โหลด (ไม่นับเป็นยอดดาวน์โหลด)"
                  >
                    <Download />
                  </a>
                </Button>
              )}
              {f.deleted ? (
                <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onRemove(f.key)}>
                  <Undo2 aria-hidden /> เลิกลบ
                </Button>
              ) : (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`ลบไฟล์ ${f.fileName}`}
                  title={f.savedId && buyerCount > 0 ? `ผู้ซื้อ ${buyerCount} คนจะไม่เห็นไฟล์นี้อีกหลังบันทึก` : undefined}
                  disabled={disabled}
                  onClick={() => onRemove(f.key)}
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={acceptAttribute(DIGITAL_FILE_TYPES)}
        multiple
        hidden
        onChange={(e) => {
          const input = e.currentTarget;
          if (input.files?.length) onAdd(Array.from(input.files));
          input.value = "";
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed px-3 py-4 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
      >
        <FilePlus2 className="size-4" aria-hidden /> อัปโหลดไฟล์{title ? title.replace(/^ไฟล์/, "") : ""}
      </button>
    </section>
  );
}
