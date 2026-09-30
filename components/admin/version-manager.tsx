"use client";

import { useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellRing, CheckCircle2, FilePlus2, FileText, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
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
import { runWithToast, TextArea, TextInput } from "@/components/admin/form-controls";
import { useDirectUpload } from "@/components/admin/use-direct-upload";
import { DateTimeInput } from "@/components/admin/date-time-input";
import {
  confirmFileUpload,
  createVersion,
  deleteFile,
  deleteVersion,
  notifyVersionBuyers,
  requestFileUpload,
  setFileVariant,
  setLatestVersion,
  updateVersion,
} from "@/lib/products/version-actions";
import { acceptAttribute, DIGITAL_FILE_TYPES } from "@/lib/storage/file-types";
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
  return (
    <div className="space-y-4">
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
            <VersionCard key={v.id} version={v} buyerCount={buyerCount} variants={variants} />
          ))}
        </ul>
      )}
    </div>
  );
}

function VersionCard({
  version,
  buyerCount,
  variants,
}: {
  version: ManagedVersion;
  buyerCount: number;
  variants: FileVariantOption[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  // "" = shared file (every buyer). Applies to the next upload batch.
  const [uploadVariant, setUploadVariant] = useState("");
  const { upload, uploading } = useDirectUpload(
    (input) => requestFileUpload(version.id, input),
    (input) => confirmFileUpload(version.id, { ...input, variantId: uploadVariant || null }),
  );
  const busy = pending || uploading !== null;

  const refreshOn = async (fn: () => Promise<ActionResult>) => {
    const done = await runWithToast(fn);
    if (done) router.refresh();
    return done;
  };

  return (
    <li className="space-y-4 rounded-2xl border bg-card p-4 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            v{version.versionNumber}
            {version.isLatest && (
              <Badge className="bg-success/10 text-success">
                <CheckCircle2 aria-hidden /> ล่าสุด
              </Badge>
            )}
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

      {version.files.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">ยังไม่มีไฟล์</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {version.files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 p-3 text-sm">
              <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate" title={f.fileName}>
                {f.fileName}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(f.fileSize)}</span>
              {variants.length > 0 && (
                <select
                  aria-label={`ผู้ที่ได้ไฟล์ ${f.fileName}`}
                  className={SELECT_CLASS}
                  value={f.variantId ?? ""}
                  disabled={busy}
                  onChange={(e) => {
                    const value = e.currentTarget.value;
                    startTransition(async () => void (await refreshOn(() => setFileVariant(f.id, value || null))));
                  }}
                >
                  <option value="">ทุกตัวเลือก</option>
                  {variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      เฉพาะ {v.name}
                    </option>
                  ))}
                </select>
              )}
              <ConfirmDialog
                trigger={
                  <Button size="icon-sm" variant="ghost" aria-label={`ลบไฟล์ ${f.fileName}`} disabled={busy}>
                    <Trash2 />
                  </Button>
                }
                title="ลบไฟล์นี้?"
                description={
                  <>
                    <p className="break-all">{f.fileName}</p>
                    <BuyerWarning buyerCount={buyerCount} />
                  </>
                }
                confirmLabel="ลบไฟล์"
                destructive
                onConfirm={() => refreshOn(() => deleteFile(f.id))}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {variants.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            ไฟล์ที่อัปโหลดให้
            <select
              className={SELECT_CLASS}
              value={uploadVariant}
              disabled={busy}
              onChange={(e) => setUploadVariant(e.currentTarget.value)}
            >
              <option value="">ผู้ซื้อทุกตัวเลือก</option>
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  เฉพาะผู้ซื้อ {v.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={acceptAttribute(DIGITAL_FILE_TYPES)}
          multiple
          hidden
          onChange={async (e) => {
            const input = e.currentTarget;
            if (!input.files?.length) return;
            if ((await upload(input.files)) > 0) router.refresh();
            input.value = "";
          }}
        />
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => inputRef.current?.click()}>
          {uploading ? <Loader2 className="animate-spin" aria-hidden /> : <FilePlus2 aria-hidden />}
          {uploading ? `กำลังอัปโหลด ${uploading}` : "อัปโหลดไฟล์"}
        </Button>
      </div>
    </li>
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
