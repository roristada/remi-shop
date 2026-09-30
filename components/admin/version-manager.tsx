"use client";

import { useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bell, BellRing, CheckCircle2, FilePlus2, FileText, Loader2, Pencil, Plus, Save, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
import { SaveBar, useSaveShortcut, useUnsavedWarning } from "@/components/admin/save-bar";
import { runWithToast, TextArea, TextInput } from "@/components/admin/form-controls";
import { uploadToStorage } from "@/components/admin/use-direct-upload";
import { DateTimeInput } from "@/components/admin/date-time-input";
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
import type { ActionResult } from "@/lib/actions/result";

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

/** Variants a file can be limited to (admin names are Thai). */
export type FileVariantOption = { id: string; name: string };

const SELECT_CLASS = "h-8 rounded-lg border bg-background px-2 text-xs";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function BuyerWarning({ buyerCount }: { buyerCount: number }) {
  if (buyerCount === 0) return null;
  return (
    <p className="rounded-xl bg-warning/10 p-3 font-medium text-warning">
      มีผู้ซื้อสินค้านี้แล้ว {buyerCount.toLocaleString("th-TH")} คน — ผู้ซื้อทุกคนจะไม่เห็นไฟล์นี้อีก
    </p>
  );
}

export function VersionManager({
  productId,
  versions,
  buyerCount,
  variants,
}: {
  productId: string;
  versions: ManagedVersion[];
  buyerCount: number;
  variants: FileVariantOption[];
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  // Unsaved file changes per version. Nothing reaches Storage or the database until "บันทึก".
  const [staged, setStaged] = useState<Record<string, StagedFiles>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const pendingByVersion = versions
    .map((v) => ({ version: v, changes: pendingChanges(v, staged[v.id]) }))
    .filter((p) => p.changes.count > 0);
  const totals = pendingByVersion.reduce(
    (t, { changes }) => ({
      added: t.added + changes.added.length,
      moved: t.moved + changes.moves.length,
      deleted: t.deleted + changes.deletes.length,
    }),
    { added: 0, moved: 0, deleted: 0 },
  );
  const dirty = pendingByVersion.length > 0;
  useUnsavedWarning(dirty);

  const stage = (versionId: string, update: (s: StagedFiles) => StagedFiles) =>
    setStaged((prev) => ({ ...prev, [versionId]: update(prev[versionId] ?? EMPTY_STAGED) }));
  const reset = () => setStaged({});

  async function saveVersion(version: ManagedVersion, changes: PendingChanges, label: string): Promise<boolean> {
    const uploads: { path: string; fileName: string; variantId: string | null }[] = [];
    try {
      for (const [i, a] of changes.added.entries()) {
        setSaving(`${label}กำลังอัปโหลด ${i + 1}/${changes.added.length}`);
        const stored = await uploadToStorage((input) => requestFileUpload(version.id, input), a.file);
        if (!stored.ok) {
          toast.error(`${a.file.name}: ${stored.error}`);
          await discardFileUploads(version.id, uploads.map((u) => u.path));
          return false;
        }
        uploads.push({ path: stored.path, fileName: a.file.name, variantId: a.variantId });
      }
      setSaving(`${label}กำลังบันทึก`);
      const result = await saveVersionFiles(version.id, { uploads, moves: changes.moves, deletes: changes.deletes });
      if (!result.ok) {
        toast.error(`v${version.versionNumber}: ${result.error}`);
        return false;
      }
      setStaged((prev) => {
        const next = { ...prev };
        delete next[version.id];
        return next;
      });
      return true;
    } catch {
      toast.error(`v${version.versionNumber}: บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง`);
      await discardFileUploads(version.id, uploads.map((u) => u.path)).catch(() => undefined);
      return false;
    }
  }

  async function saveAll(): Promise<boolean> {
    if (saving || !dirty) return false;
    const many = pendingByVersion.length > 1;
    let saved = 0;
    try {
      for (const { version, changes } of pendingByVersion) {
        if (await saveVersion(version, changes, many ? `v${version.versionNumber}: ` : "")) saved++;
      }
    } finally {
      setSaving(null);
    }
    if (saved > 0) {
      toast.success(saved === pendingByVersion.length ? "บันทึกไฟล์แล้ว" : `บันทึกแล้ว ${saved}/${pendingByVersion.length} เวอร์ชัน`);
      router.refresh();
    }
    return saved === pendingByVersion.length;
  }

  // Deletes are permanent, so they go through a confirm dialog; the shortcut only saves the rest.
  useSaveShortcut(() => void (totals.deleted > 0 ? toast.info("มีไฟล์ที่จะลบ — กดปุ่มบันทึกเพื่อยืนยัน") : saveAll()), dirty, rootRef);

  const summary = [
    totals.added > 0 && `เพิ่ม ${totals.added} ไฟล์`,
    totals.moved > 0 && `ย้าย ${totals.moved} ไฟล์`,
    totals.deleted > 0 && `ลบ ${totals.deleted} ไฟล์`,
  ]
    .filter(Boolean)
    .join(" · ");
  const saveLabel = pendingByVersion.length > 1 ? "บันทึกทั้งหมด" : "บันทึก";

  return (
    <div ref={rootRef} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          ผู้ซื้อได้สิทธิ์ทุกเวอร์ชัน · ไฟล์ละไม่เกิน 50 MB · ต้องมีเวอร์ชันล่าสุดที่มีไฟล์ก่อนเผยแพร่
        </p>
        <VersionDialog
          title="เพิ่มเวอร์ชัน"
          trigger={
            <Button className="rounded-full">
              <Plus aria-hidden /> เพิ่มเวอร์ชัน
            </Button>
          }
          action={(prev, fd) => createVersion(productId, prev, fd)}
          showSetLatest={versions.length > 0}
        />
      </div>

      {versions.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          ยังไม่มีเวอร์ชัน — เพิ่มเวอร์ชันแรก (เช่น 1.0) แล้วอัปโหลดไฟล์
        </div>
      ) : (
        <ul className="space-y-4">
          {versions.map((v) => (
            <VersionCard
              key={v.id}
              version={v}
              buyerCount={buyerCount}
              variants={variants}
              staged={staged[v.id] ?? EMPTY_STAGED}
              onStage={(update) => stage(v.id, update)}
              locked={saving !== null}
            />
          ))}
        </ul>
      )}

      <SaveBar
        dirty={dirty || saving !== null}
        message={
          <>
            {summary || "กำลังบันทึก"}
            {pendingByVersion.length > 1 && ` ใน ${pendingByVersion.length} เวอร์ชัน`} — ยังไม่บันทึก
          </>
        }
      >
        <Button variant="outline" className="h-10 rounded-full px-5" disabled={saving !== null} onClick={reset}>
          ยกเลิก
        </Button>
        {totals.deleted > 0 ? (
          <ConfirmDialog
            trigger={
              <Button className="h-10 rounded-full px-6" disabled={saving !== null}>
                <Save aria-hidden /> {saveLabel}
              </Button>
            }
            title={`บันทึกและลบ ${totals.deleted} ไฟล์?`}
            description={
              <>
                <p>ไฟล์ที่ลบจะถูกลบถาวร</p>
                <BuyerWarning buyerCount={buyerCount} />
              </>
            }
            confirmLabel={saveLabel}
            destructive
            onConfirm={saveAll}
          />
        ) : (
          <Button
            className="h-10 rounded-full px-6"
            disabled={saving !== null}
            aria-busy={saving !== null}
            onClick={() => void saveAll()}
          >
            {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
            {saving ?? saveLabel}
          </Button>
        )}
      </SaveBar>
    </div>
  );
}

type StagedFiles = {
  moves: Record<string, string | null>; // fileId → group (null = every buyer)
  deletes: string[];
  added: { key: string; file: File; variantId: string | null }[];
};

const EMPTY_STAGED: StagedFiles = { moves: {}, deletes: [], added: [] };

type PendingChanges = {
  moves: { fileId: string; variantId: string | null }[];
  deletes: string[];
  added: StagedFiles["added"];
  count: number;
};

/** Staged changes that still apply: skips files that no longer exist and moves back to where a file already is. */
function pendingChanges(version: ManagedVersion, staged: StagedFiles = EMPTY_STAGED): PendingChanges {
  const deletes = staged.deletes.filter((id) => version.files.some((f) => f.id === id));
  const moves = version.files
    .filter((f) => f.id in staged.moves && staged.moves[f.id] !== f.variantId && !deletes.includes(f.id))
    .map((f) => ({ fileId: f.id, variantId: staged.moves[f.id] }));
  return { moves, deletes, added: staged.added, count: moves.length + deletes.length + staged.added.length };
}

function VersionCard({
  version,
  buyerCount,
  variants,
  staged,
  onStage,
  locked,
}: {
  version: ManagedVersion;
  buyerCount: number;
  variants: FileVariantOption[];
  staged: StagedFiles;
  onStage: (update: (s: StagedFiles) => StagedFiles) => void;
  /** True while a save is running. */
  locked: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const busy = pending || locked;
  const { moves, added } = staged;
  const { moves: pendingMoves, deletes: pendingDeletes, count: changeCount } = pendingChanges(version, staged);
  const dirty = changeCount > 0;

  const refreshOn = async (fn: () => Promise<ActionResult>) => {
    const done = await runWithToast(fn);
    if (done) router.refresh();
    return done;
  };

  const rows: FileRow[] = [
    ...version.files.map((f) => ({
      key: f.id,
      fileName: f.fileName,
      fileSize: f.fileSize,
      variantId: f.id in moves ? moves[f.id] : f.variantId,
      state: pendingDeletes.includes(f.id)
        ? ("deleted" as const)
        : pendingMoves.some((m) => m.fileId === f.id)
          ? ("moved" as const)
          : ("saved" as const),
    })),
    ...added.map((a) => ({
      key: a.key,
      fileName: a.file.name,
      fileSize: a.file.size,
      variantId: a.variantId,
      state: "new" as const,
    })),
  ];

  const addFiles = (files: File[], variantId: string | null) => {
    const accepted = files.filter((file) => {
      const error = checkFileMeta(DIGITAL_FILE_TYPES, file.name, file.size, MAX_PRODUCT_FILE_SIZE);
      if (error) toast.error(`${file.name}: ${FILE_TYPE_ERROR_TH[error]}`);
      return !error;
    });
    onStage((s) => ({ ...s, added: [...s.added, ...accepted.map((file) => ({ key: crypto.randomUUID(), file, variantId }))] }));
  };
  const moveRow = (key: string, variantId: string | null) =>
    onStage((s) =>
      s.added.some((a) => a.key === key)
        ? { ...s, added: s.added.map((a) => (a.key === key ? { ...a, variantId } : a)) }
        : { ...s, moves: { ...s.moves, [key]: variantId } },
    );
  const removeRow = (key: string) =>
    onStage((s) =>
      s.added.some((a) => a.key === key)
        ? { ...s, added: s.added.filter((a) => a.key !== key) }
        : { ...s, deletes: s.deletes.includes(key) ? s.deletes.filter((id) => id !== key) : [...s.deletes, key] },
    );

  // One group per option, plus the shared group every buyer gets.
  const groups: { variantId: string | null; title: string; hint: string }[] =
    variants.length === 0
      ? [{ variantId: null, title: "", hint: "" }]
      : [
          { variantId: null, title: "ไฟล์สำหรับทุกตัวเลือก", hint: "ผู้ซื้อทุกตัวเลือกได้ไฟล์เหล่านี้" },
          ...variants.map((v) => ({
            variantId: v.id,
            title: `ไฟล์เฉพาะตัวเลือก ${v.name}`,
            hint: `เฉพาะผู้ซื้อตัวเลือก ${v.name} เท่านั้น`,
          })),
        ];

  return (
    <li className={`space-y-4 rounded-2xl border bg-card p-4 shadow-soft ${dirty ? "border-warning/50" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            v{version.versionNumber}
            {version.isLatest && (
              <Badge className="bg-success/10 text-success">
                <CheckCircle2 aria-hidden /> ล่าสุด
              </Badge>
            )}
            {dirty && <Badge className="bg-warning/10 text-warning">แก้ไข {changeCount} รายการ · ยังไม่บันทึก</Badge>}
          </h3>
          <p className="text-xs text-muted-foreground">วันที่ออก {version.releaseDateLabel}</p>
          {version.notifiedAtLabel && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <BellRing className="size-3.5" aria-hidden /> แจ้งลูกค้าแล้ว {version.notifiedAtLabel}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {version.isLatest && !version.notifiedAtLabel && version.files.length > 0 && (
            <ConfirmDialog
              trigger={
                <Button size="sm" variant="outline" disabled={busy}>
                  <Bell aria-hidden /> แจ้งลูกค้า
                </Button>
              }
              title={`แจ้งลูกค้าเรื่อง v${version.versionNumber}?`}
              description={
                <p>
                  ลูกค้าที่ซื้อสินค้านี้แล้ว{buyerCount > 0 ? ` ${buyerCount.toLocaleString("th-TH")} คน` : ""} จะได้รับการแจ้งเตือนว่ามีเวอร์ชันใหม่
                  แจ้งได้ครั้งเดียวต่อเวอร์ชัน อัปโหลดไฟล์ให้ครบก่อนกด
                </p>
              }
              confirmLabel="แจ้งลูกค้า"
              onConfirm={() => refreshOn(() => notifyVersionBuyers(version.id))}
            />
          )}
          {!version.isLatest && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => startTransition(async () => void (await refreshOn(() => setLatestVersion(version.id))))}
            >
              <CheckCircle2 aria-hidden /> ตั้งเป็นล่าสุด
            </Button>
          )}
          <VersionDialog
            title={`แก้ไข v${version.versionNumber}`}
            trigger={
              <Button size="sm" variant="outline" disabled={busy}>
                <Pencil aria-hidden /> แก้ไข
              </Button>
            }
            action={(prev, fd) => updateVersion(version.id, prev, fd)}
            values={version}
          />
          {!version.isLatest && (
            <ConfirmDialog
              trigger={
                <Button size="sm" variant="destructive" disabled={busy}>
                  <Trash2 aria-hidden /> ลบเวอร์ชัน
                </Button>
              }
              title={`ลบ v${version.versionNumber}?`}
              description={
                <>
                  <p>เวอร์ชันนี้และไฟล์ทั้งหมด ({version.files.length} ไฟล์) จะถูกลบถาวร</p>
                  <BuyerWarning buyerCount={buyerCount} />
                </>
              }
              confirmLabel="ลบเวอร์ชัน"
              destructive
              onConfirm={() => refreshOn(() => deleteVersion(version.id))}
            />
          )}
        </div>
      </div>

      {(version.releaseNotesTH || version.releaseNotesEN) && (
        <div className="grid gap-2 text-sm whitespace-pre-line text-muted-foreground md:grid-cols-2">
          {version.releaseNotesTH && <p>{version.releaseNotesTH}</p>}
          {version.releaseNotesEN && <p>{version.releaseNotesEN}</p>}
        </div>
      )}

      <div className="space-y-3">
        {groups.map((g) => (
          <FileGroup
            key={g.variantId ?? "shared"}
            variantId={g.variantId}
            title={g.title}
            hint={g.hint}
            rows={rows.filter((r) => r.variantId === g.variantId)}
            variants={variants}
            disabled={busy}
            onAdd={(files) => addFiles(files, g.variantId)}
            onMove={moveRow}
            onRemove={removeRow}
          />
        ))}
      </div>
    </li>
  );
}

type FileRow = {
  key: string;
  fileName: string;
  fileSize: number;
  variantId: string | null;
  /** saved = unchanged; new/moved/deleted = waiting for "บันทึก". */
  state: "saved" | "new" | "moved" | "deleted";
};

const ROW_BADGE: Record<Exclude<FileRow["state"], "saved">, string> = {
  new: "ไฟล์ใหม่ · ยังไม่บันทึก",
  moved: "ย้ายมา · ยังไม่บันทึก",
  deleted: "จะลบ · ยังไม่บันทึก",
};

function FileGroup({
  variantId,
  title,
  hint,
  rows,
  variants,
  disabled,
  onAdd,
  onMove,
  onRemove,
}: {
  variantId: string | null;
  title: string;
  hint: string;
  rows: FileRow[];
  variants: FileVariantOption[];
  disabled: boolean;
  onAdd: (files: File[]) => void;
  onMove: (key: string, variantId: string | null) => void;
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

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-background p-4 text-center text-sm text-muted-foreground">
          ยังไม่มีไฟล์
        </p>
      ) : (
        <ul className="divide-y rounded-xl border bg-background">
          {rows.map((f) => {
            const deleted = f.state === "deleted";
            return (
              <li key={f.key} className="flex items-center gap-3 p-3 text-sm">
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span
                  className={`min-w-0 flex-1 truncate ${deleted ? "text-muted-foreground line-through" : ""}`}
                  title={f.fileName}
                >
                  {f.fileName}
                </span>
                {f.state !== "saved" && (
                  <Badge
                    className={`shrink-0 ${deleted ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"}`}
                  >
                    {ROW_BADGE[f.state]}
                  </Badge>
                )}
                <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(f.fileSize)}</span>
                {variants.length > 0 && !deleted && (
                  <select
                    aria-label={`ย้ายไฟล์ ${f.fileName} ไปกลุ่มอื่น`}
                    className={SELECT_CLASS}
                    value=""
                    disabled={disabled}
                    onChange={(e) => {
                      const value = e.currentTarget.value;
                      if (value) onMove(f.key, value === "shared" ? null : value);
                    }}
                  >
                    <option value="">ย้ายไป…</option>
                    {variantId !== null && <option value="shared">ทุกตัวเลือก</option>}
                    {variants
                      .filter((v) => v.id !== variantId)
                      .map((v) => (
                        <option key={v.id} value={v.id}>
                          เฉพาะ {v.name}
                        </option>
                      ))}
                  </select>
                )}
                {deleted ? (
                  <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onRemove(f.key)}>
                    <Undo2 aria-hidden /> เลิกลบ
                  </Button>
                ) : (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={f.state === "new" ? `เอาไฟล์ ${f.fileName} ออก` : `ลบไฟล์ ${f.fileName}`}
                    disabled={disabled}
                    onClick={() => onRemove(f.key)}
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
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
        <Button size="sm" variant="secondary" disabled={disabled} onClick={() => inputRef.current?.click()}>
          <FilePlus2 aria-hidden />
          {title ? `อัปโหลดไฟล์${title.replace(/^ไฟล์/, "")}` : "อัปโหลดไฟล์"}
        </Button>
      </div>
    </section>
  );
}

type VersionAction = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

function VersionDialog({
  title,
  trigger,
  action,
  values,
  showSetLatest = false,
}: {
  title: string;
  trigger: ReactNode;
  action: VersionAction;
  values?: ManagedVersion;
  showSetLatest?: boolean;
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>วันที่เป็นเวลาไทย · เว้นว่างวันที่ออก = ตอนนี้</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {state && !state.ok && !state.fieldErrors && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label="เลขเวอร์ชัน"
              name="versionNumber"
              placeholder="1.0"
              maxLength={30}
              required
              defaultValue={values?.versionNumber}
              error={err("versionNumber")}
            />
            <DateTimeInput label="วันที่ออก" name="releaseDate" defaultValue={values?.releaseDate} error={err("releaseDate")} />
          </div>
          <TextArea label="Release notes (ไทย)" name="releaseNotesTH" rows={3} defaultValue={values?.releaseNotesTH} error={err("releaseNotesTH")} />
          <TextArea label="Release notes (English)" name="releaseNotesEN" rows={3} defaultValue={values?.releaseNotesEN} error={err("releaseNotesEN")} />
          {showSetLatest && (
            <div className="flex items-center gap-2">
              <Checkbox id="setLatest" name="setLatest" defaultChecked />
              <Label htmlFor="setLatest">ตั้งเป็นเวอร์ชันล่าสุด</Label>
            </div>
          )}
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
