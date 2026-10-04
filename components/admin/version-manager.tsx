"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bell, BellRing, CheckCircle2, Download, FilePlus2, FileText, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
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
import { runWithToast, TextArea, TextInput } from "@/components/admin/form-controls";
import { uploadToStorage } from "@/components/admin/use-direct-upload";
import { DateTimeInput } from "@/components/admin/date-time-input";
import {
  newId,
  resolveVariantId,
  useEditorSection,
  useEditorVariants,
  type SaveContext,
} from "@/components/admin/product-editor";
import {
  createVersion,
  deleteVersion,
  discardFileUploads,
  notifyVersionBuyers,
  requestFileUpload,
  saveVersionFiles,
  setLatestVersion,
  updateVersion,
} from "@/lib/products/version-actions";
import { acceptAttribute, checkFileMeta, DIGITAL_FILE_TYPES, FILE_TYPE_ERROR_TH } from "@/lib/storage/file-types";
import { MAX_PRODUCT_FILE_SIZE } from "@/lib/storage/buckets";
import { cn } from "@/lib/utils";

export type ManagedVersion = {
  id: string;
  versionNumber: string;
  releaseDate: string; // datetime-local (Bangkok)
  releaseDateLabel: string;
  releaseNotesTH: string;
  releaseNotesEN: string;
  isLatest: boolean;
  /** When buyers were notified about this version; null = not yet. */
  notifiedAtLabel: string | null;
  /** variantId null = every buyer gets the file; set = only buyers of that variant. */
  files: { id: string; fileName: string; fileSize: number; fileType: string; variantId: string | null }[];
};

type Meta = { versionNumber: string; releaseDate: string; releaseNotesTH: string; releaseNotesEN: string };

/** A saved file (`savedId`) or one picked in this session (`file`). */
type FileRow = { key: string; savedId: string | null; fileName: string; fileSize: number; variantId: string | null; file: File | null; deleted: boolean };

type VersionRow = {
  key: string;
  saved: ManagedVersion | null;
  meta: Meta;
  deleted: boolean;
  files: FileRow[];
  /** The "1.0" offered to a new product; skipped on save when left empty. */
  placeholder?: boolean;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

const metaOf = (v: ManagedVersion): Meta => ({
  versionNumber: v.versionNumber,
  releaseDate: v.releaseDate,
  releaseNotesTH: v.releaseNotesTH,
  releaseNotesEN: v.releaseNotesEN,
});

function toRows(versions: ManagedVersion[]): VersionRow[] {
  if (versions.length === 0) {
    return [{ key: newId(), saved: null, meta: { versionNumber: "1.0", releaseDate: "", releaseNotesTH: "", releaseNotesEN: "" }, deleted: false, files: [], placeholder: true }];
  }
  return versions.map((v) => ({
    key: v.id,
    saved: v,
    meta: metaOf(v),
    deleted: false,
    files: v.files.map((f) => ({ key: f.id, savedId: f.id, fileName: f.fileName, fileSize: f.fileSize, variantId: f.variantId, file: null, deleted: false })),
  }));
}

const metaChanged = (row: VersionRow) =>
  row.saved ? JSON.stringify(row.meta) !== JSON.stringify(metaOf(row.saved)) : !row.placeholder;
const filesChanged = (row: VersionRow) => row.files.some((f) => f.file || f.deleted);

function versionForm(meta: Meta) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(meta)) fd.set(k, v);
  return fd;
}

/**
 * Versions and their files. Adding versions, picking files and removing them only change this
 * page; the editor's save button uploads and writes everything, then the shop updates. Files can
 * change at any time, also while the product is published (buyers are notified).
 */
export function VersionManager({ versions, buyerCount }: { versions: ManagedVersion[]; buyerCount: number }) {
  const [rows, setRows] = useState(() => toRows(versions));
  const [latestKey, setLatestKey] = useState(() => versions.find((v) => v.isLatest)?.id ?? rows[0]?.key ?? null);
  // Server data is read once. Saving refreshes the route (revalidation) while later sections still
  // hold unsaved work, so the list is never reset from props; after a save the page navigates.
  const { variants } = useEditorVariants();

  const savedLatest = versions.find((v) => v.isLatest)?.id ?? null;
  const dirty =
    rows.some((r) => r.deleted || metaChanged(r) || filesChanged(r)) || (savedLatest !== null && latestKey !== savedLatest);

  const { saving } = useEditorSection(
    "versions",
    { order: 40, tab: "versions", label: "ไฟล์", save: (ctx) => saveVersions(ctx, rows, latestKey, savedLatest, setRows) },
    dirty,
  );

  const update = (key: string, fn: (r: VersionRow) => VersionRow) => setRows((prev) => prev.map((r) => (r.key === key ? fn(r) : r)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          ผู้ซื้อได้สิทธิ์ทุกเวอร์ชัน · ไฟล์ละไม่เกิน 50 MB · ไม่มีไฟล์ก็เผยแพร่ได้ (ร้านส่งไฟล์ทางอีเมลภายใน 7 วัน) · แก้ไฟล์ได้ทุกเวลา
          ลูกค้าที่ซื้อแล้วจะได้รับแจ้งเตือน
        </p>
        <VersionDialog
          title="เพิ่มเวอร์ชัน"
          trigger={
            <Button className="rounded-full" disabled={saving}>
              <Plus aria-hidden /> เพิ่มเวอร์ชัน
            </Button>
          }
          values={{ versionNumber: "", releaseDate: "", releaseNotesTH: "", releaseNotesEN: "" }}
          onApply={(meta) => {
            const key = newId();
            setRows((prev) => [{ key, saved: null, meta, deleted: false, files: [] }, ...prev]);
            setLatestKey(key);
          }}
        />
      </div>

      <ul className="space-y-4">
        {rows.map((r) => (
          <VersionCard
            key={r.key}
            row={r}
            isLatest={r.key === latestKey}
            canDelete={r.key !== latestKey}
            buyerCount={buyerCount}
            variants={variants}
            disabled={saving}
            onChange={(fn) => update(r.key, fn)}
            onMakeLatest={() => setLatestKey(r.key)}
            onDiscard={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
          />
        ))}
      </ul>
    </div>
  );
}

/**
 * Writes versions in order: details, new files (uploaded straight to Storage) and removed files,
 * then the latest version, then removed versions. Stops at the first failure.
 */
async function saveVersions(
  ctx: SaveContext,
  rows: VersionRow[],
  latestKey: string | null,
  savedLatest: string | null,
  setRows: (rows: VersionRow[]) => void,
): Promise<boolean> {
  const productId = ctx.productId;
  if (!productId) return false;
  const next = rows.map((r) => ({ ...r, files: [...r.files] }));
  const ids = new Map<string, string>();
  const fail = (label: string, error: string) => {
    toast.error(`${label}: ${error}`);
    setRows(next.filter((r) => !(r.deleted && !r.saved)));
    return false;
  };

  for (const [index, row] of next.entries()) {
    if (row.deleted) continue;
    const label = `v${row.meta.versionNumber}`;
    const pendingFiles = row.files.filter((f) => f.file && !f.deleted);
    // An untouched placeholder (new product, no files) is not created.
    if (row.placeholder && !row.saved && pendingFiles.length === 0) continue;

    let versionId = row.saved?.id ?? null;
    if (!versionId) {
      const result = await createVersion(productId, null, versionForm(row.meta));
      if (!result.ok) return fail(label, Object.values(result.fieldErrors ?? {})[0] ?? result.error);
      versionId = result.data.id;
    } else if (metaChanged(row)) {
      const result = await updateVersion(versionId, null, versionForm(row.meta));
      if (!result.ok) return fail(label, Object.values(result.fieldErrors ?? {})[0] ?? result.error);
    }
    ids.set(row.key, versionId);
    const id = versionId;

    const uploads: { path: string; fileName: string; variantId: string | null }[] = [];
    for (const f of pendingFiles) {
      const stored = await uploadToStorage((input) => requestFileUpload(id, input), f.file!);
      if (!stored.ok) {
        await discardFileUploads(id, uploads.map((u) => u.path)).catch(() => undefined);
        return fail(f.fileName, stored.error);
      }
      uploads.push({ path: stored.path, fileName: f.fileName, variantId: resolveVariantId(ctx, f.variantId) });
    }
    const deletes = row.files.filter((f) => f.deleted && f.savedId).map((f) => f.savedId!);
    if (uploads.length > 0 || deletes.length > 0) {
      const result = await saveVersionFiles(id, { uploads, moves: [], deletes });
      if (!result.ok) return fail(label, result.error);
      if (result.notify && result.message) toast.info(result.message);
    }
    // Saved: drop the done changes so a retry does not repeat them.
    next[index] = {
      ...row,
      placeholder: false,
      saved: { ...(row.saved ?? { releaseDateLabel: "", isLatest: false, notifiedAtLabel: null, files: [] }), ...row.meta, id },
      files: row.files.filter((f) => !f.deleted && !f.file),
    };
  }

  const latestId = latestKey ? (ids.get(latestKey) ?? null) : null;
  if (latestId && latestId !== savedLatest) {
    const result = await setLatestVersion(latestId);
    if (!result.ok) return fail("เวอร์ชันล่าสุด", result.error);
  }

  for (const [index, row] of next.entries()) {
    if (!row.deleted || !row.saved) continue;
    const result = await deleteVersion(row.saved.id);
    if (!result.ok) return fail(`v${row.meta.versionNumber}`, result.error);
    next[index] = { ...row, saved: null };
  }
  setRows(next.filter((r) => !(r.deleted && !r.saved)));
  return true;
}

function VersionCard({
  row,
  isLatest,
  canDelete,
  buyerCount,
  variants,
  disabled,
  onChange,
  onMakeLatest,
  onDiscard,
}: {
  row: VersionRow;
  isLatest: boolean;
  canDelete: boolean;
  buyerCount: number;
  variants: { id: string; name: string }[];
  disabled: boolean;
  onChange: (fn: (r: VersionRow) => VersionRow) => void;
  onMakeLatest: () => void;
  onDiscard: () => void;
}) {
  const router = useRouter();
  const saved = row.saved;
  const visibleFiles = row.files;

  const addFiles = (files: File[], variantId: string | null) => {
    const accepted = files.filter((file) => {
      const error = checkFileMeta(DIGITAL_FILE_TYPES, file.name, file.size, MAX_PRODUCT_FILE_SIZE);
      if (error) toast.error(`${file.name}: ${FILE_TYPE_ERROR_TH[error]}`);
      return !error;
    });
    onChange((r) => ({
      ...r,
      files: [
        ...r.files,
        ...accepted.map((file) => ({ key: crypto.randomUUID(), savedId: null, fileName: file.name, fileSize: file.size, variantId, file, deleted: false })),
      ],
    }));
  };
  const removeFile = (key: string) =>
    onChange((r) => ({
      ...r,
      files: r.files.flatMap((f) => (f.key !== key ? [f] : f.savedId ? [{ ...f, deleted: !f.deleted }] : [])),
    }));

  // One group per option, plus the shared group every buyer gets.
  const groups: { variantId: string | null; title: string; hint: string }[] =
    variants.length === 0
      ? [{ variantId: null, title: "", hint: "" }]
      : [
          { variantId: null, title: "ไฟล์สำหรับทุกตัวเลือก", hint: "ผู้ซื้อทุกตัวเลือกได้ไฟล์เหล่านี้" },
          ...variants.map((v) => ({ variantId: v.id, title: `ไฟล์ของตัวเลือก ${v.name}`, hint: `เฉพาะผู้ซื้อตัวเลือก ${v.name}` })),
        ];
  const fileCount = visibleFiles.filter((f) => !f.deleted).length;

  return (
    <li className={cn("space-y-4 rounded-2xl border bg-card p-4 shadow-soft", row.deleted && "opacity-60")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex flex-wrap items-center gap-2 font-semibold">
            <span className={cn(row.deleted && "line-through")}>v{row.meta.versionNumber}</span>
            {isLatest && (
              <Badge className="bg-success/10 text-success">
                <CheckCircle2 aria-hidden /> ล่าสุด
              </Badge>
            )}
            {row.deleted && <Badge className="bg-destructive/10 text-destructive">จะลบเมื่อบันทึก</Badge>}
          </h3>
          <p className="text-xs text-muted-foreground">
            {saved?.releaseDateLabel ? `วันที่ออก ${saved.releaseDateLabel}` : "วันที่ออก: ตอนบันทึก"} · {fileCount} ไฟล์
          </p>
          {saved?.notifiedAtLabel && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <BellRing className="size-3.5" aria-hidden /> แจ้งลูกค้าแล้ว {saved.notifiedAtLabel}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {row.deleted ? (
            <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onChange((r) => ({ ...r, deleted: false }))}>
              <Undo2 aria-hidden /> เลิกลบ
            </Button>
          ) : (
            <>
              {saved?.isLatest && isLatest && !saved.notifiedAtLabel && saved.files.length > 0 && (
                <ConfirmDialog
                  trigger={
                    <Button size="sm" variant="outline" disabled={disabled}>
                      <Bell aria-hidden /> แจ้งลูกค้า
                    </Button>
                  }
                  title={`แจ้งลูกค้าเรื่อง v${saved.versionNumber}?`}
                  description={
                    <p>
                      ลูกค้าที่ซื้อสินค้านี้แล้ว{buyerCount > 0 ? ` ${buyerCount.toLocaleString("th-TH")} คน` : ""} จะได้รับการแจ้งเตือนว่ามีเวอร์ชันใหม่
                      แจ้งได้ครั้งเดียวต่อเวอร์ชัน
                    </p>
                  }
                  confirmLabel="แจ้งลูกค้า"
                  onConfirm={async () => {
                    const done = await runWithToast(() => notifyVersionBuyers(saved.id));
                    if (done) router.refresh();
                    return done;
                  }}
                />
              )}
              {!isLatest && (
                <Button size="sm" variant="outline" disabled={disabled} onClick={onMakeLatest}>
                  <CheckCircle2 aria-hidden /> ตั้งเป็นล่าสุด
                </Button>
              )}
              <VersionDialog
                title={`แก้ไข v${row.meta.versionNumber}`}
                trigger={
                  <Button size="sm" variant="outline" disabled={disabled}>
                    <Pencil aria-hidden /> แก้ไข
                  </Button>
                }
                values={row.meta}
                onApply={(meta) => onChange((r) => ({ ...r, meta, placeholder: false }))}
              />
              {canDelete && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={disabled}
                  onClick={() => (saved ? onChange((r) => ({ ...r, deleted: true })) : onDiscard())}
                >
                  <Trash2 aria-hidden /> ลบเวอร์ชัน
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {(row.meta.releaseNotesTH || row.meta.releaseNotesEN) && (
        <div className="grid gap-2 text-sm whitespace-pre-line text-muted-foreground md:grid-cols-2">
          {row.meta.releaseNotesTH && <p>{row.meta.releaseNotesTH}</p>}
          {row.meta.releaseNotesEN && <p>{row.meta.releaseNotesEN}</p>}
        </div>
      )}

      {!row.deleted && (
        <div className="space-y-3">
          {groups.map((g) => (
            <FileGroup
              key={g.variantId ?? "shared"}
              title={g.title}
              hint={g.hint}
              rows={visibleFiles.filter((f) => f.variantId === g.variantId)}
              disabled={disabled}
              buyerCount={buyerCount}
              onAdd={(files) => addFiles(files, g.variantId)}
              onRemove={removeFile}
            />
          ))}
        </div>
      )}
    </li>
  );
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

/** Edits a version's details in this page only; saved with everything else. */
function VersionDialog({
  title,
  trigger,
  values,
  onApply,
}: {
  title: string;
  trigger: ReactNode;
  values: Meta;
  onApply: (meta: Meta) => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    const fd = new FormData(e.currentTarget);
    const meta: Meta = {
      versionNumber: String(fd.get("versionNumber") ?? "").trim(),
      releaseDate: String(fd.get("releaseDate") ?? ""),
      releaseNotesTH: String(fd.get("releaseNotesTH") ?? ""),
      releaseNotesEN: String(fd.get("releaseNotesEN") ?? ""),
    };
    if (!meta.versionNumber) return setError("กรุณากรอกเลขเวอร์ชัน");
    setError(undefined);
    onApply(meta);
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setError(undefined);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>วันที่เป็นเวลาไทย · เว้นว่างวันที่ออก = ตอนบันทึก</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="เลขเวอร์ชัน" name="versionNumber" placeholder="1.0" maxLength={30} required defaultValue={values.versionNumber} error={error} />
            <DateTimeInput label="วันที่ออก" name="releaseDate" defaultValue={values.releaseDate} />
          </div>
          <TextArea label="Release notes (ไทย)" name="releaseNotesTH" rows={3} defaultValue={values.releaseNotesTH} />
          <TextArea label="Release notes (English)" name="releaseNotesEN" rows={3} defaultValue={values.releaseNotesEN} />
          <DialogFooter>
            <Button type="submit">ตกลง</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
