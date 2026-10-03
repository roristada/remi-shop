"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, ImagePlus, Pencil, Plus, Trash2, Undo2, X } from "lucide-react";
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
import { TextInput } from "@/components/admin/form-controls";
import { DateTimeInput } from "@/components/admin/date-time-input";
import { PreviewImage } from "@/components/shared/preview-image";
import { newId, useEditorSection, useEditorVariants, type SaveContext } from "@/components/admin/product-editor";
import { requestImageOptimize, uploadToStorage } from "@/components/admin/use-direct-upload";
import {
  confirmVariantImage,
  createVariant,
  deleteVariant,
  removeVariantImage,
  requestVariantImageUpload,
  setVariantActive,
  updateVariant,
} from "@/lib/products/variant-actions";
import { acceptAttribute, checkFileMeta, FILE_TYPE_ERROR_TH, PRODUCT_IMAGE_FILE_TYPES } from "@/lib/storage/file-types";
import { MAX_PRODUCT_FILE_SIZE } from "@/lib/storage/buckets";
import { cn } from "@/lib/utils";

/** The editable fields of an option, as form strings (dates as Bangkok datetime-local). */
type VariantValues = {
  nameTH: string;
  nameEN: string;
  price: string;
  discountPercent: string;
  discountStartAt: string;
  discountEndAt: string;
  stockLimit: string;
};

/** Form-ready values plus display-only facts from the server. */
export type ManagedVariant = VariantValues & {
  id: string;
  isActive: boolean;
  imageUrl: string | null;
  priceLabel: string;
  discountLabel: string | null;
  /** Units in open or completed orders. */
  taken: number;
  fileCount: number;
};

/** One row of the editor's list; `saved` is null for an option added in this session. */
type Row = {
  key: string;
  saved: ManagedVariant | null;
  values: VariantValues;
  isActive: boolean;
  deleted: boolean;
  /** A picked picture (uploaded on save) or `removed` to clear the saved one. */
  image: { file: File; url: string } | "removed" | null;
};

const EMPTY: VariantValues = {
  nameTH: "",
  nameEN: "",
  price: "",
  discountPercent: "",
  discountStartAt: "",
  discountEndAt: "",
  stockLimit: "",
};

const FIELDS = Object.keys(EMPTY) as (keyof VariantValues)[];

const toRows = (variants: ManagedVariant[]): Row[] =>
  variants.map((v) => ({
    key: v.id,
    saved: v,
    values: Object.fromEntries(FIELDS.map((f) => [f, v[f]])) as VariantValues,
    isActive: v.isActive,
    deleted: false,
    image: null,
  }));

const changedValues = (row: Row) => !row.saved || FIELDS.some((f) => row.values[f] !== row.saved![f]);

function toFormData(values: VariantValues, sortOrder: number) {
  const fd = new FormData();
  for (const f of FIELDS) fd.set(f, values[f]);
  fd.set("sortOrder", String(sortOrder));
  return fd;
}

/**
 * Purchasable options (A/B/C). Adding, editing, switching off and removing only change this list;
 * the editor's save button writes them. Each option may have its own picture.
 */
export function VariantManager({ variants }: { variants: ManagedVariant[] }) {
  const [rows, setRows] = useState(() => toRows(variants));
  // Server data is read once. Saving refreshes the route (revalidation) while later sections still
  // hold unsaved work, so the list is never reset from props; after a save the page navigates.
  const { setVariants } = useEditorVariants();

  // The files tab lists the options that will exist after saving.
  const live = rows.filter((r) => !r.deleted);
  const liveKey = live.map((r) => `${r.key}=${r.values.nameTH}`).join("|");
  useEffect(() => {
    setVariants(live.map((r) => ({ id: r.key, name: r.values.nameTH || "(ไม่มีชื่อ)" })));
    // Only when the list of options or their names change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey, setVariants]);

  const dirty = rows.some((r) => r.deleted || r.image !== null || changedValues(r) || (r.saved && r.isActive !== r.saved.isActive));

  const { saving } = useEditorSection(
    "variants",
    {
      order: 20,
      tab: "variants",
      label: "ตัวเลือก",
      save: (ctx) => saveRows(ctx, rows, setRows),
    },
    dirty,
  );

  const update = (key: string, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          ถ้ามีตัวเลือก ลูกค้าต้องเลือกแบบก่อนซื้อ แต่ละแบบมีราคา ส่วนลด สต็อก และรูปของตัวเอง ช่วงเวลาขายและ License ใช้ของสินค้า
          · ไฟล์ของแต่ละแบบตั้งได้ที่แท็บเวอร์ชันและไฟล์
        </p>
        <VariantDialog
          title="เพิ่มตัวเลือก"
          trigger={
            <Button className="rounded-full" disabled={saving}>
              <Plus aria-hidden /> เพิ่มตัวเลือก
            </Button>
          }
          values={EMPTY}
          onApply={(values) =>
            setRows((prev) => [...prev, { key: newId(), saved: null, values, isActive: true, deleted: false, image: null }])
          }
        />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          ยังไม่มีตัวเลือก — สินค้านี้ขายเป็นชิ้นเดียวตามราคาในแท็บรายละเอียด
        </div>
      ) : (
        <ul className="divide-y rounded-2xl border bg-card shadow-soft">
          {rows.map((r) => (
            <VariantRow key={r.key} row={r} disabled={saving} onChange={(patch) => update(r.key, patch)} onDiscard={() => setRows((prev) => prev.filter((x) => x.key !== r.key))} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Writes every changed option in list order; stops at the first failure (earlier ones stay saved). */
async function saveRows(ctx: SaveContext, rows: Row[], setRows: (rows: Row[]) => void): Promise<boolean> {
  const productId = ctx.productId;
  if (!productId) return false;
  const next = [...rows];
  // Rows already removed on the server leave the list.
  const keep = () => setRows(next.filter((r) => !(r.deleted && !r.saved)));
  const fail = (row: Row, error: string) => {
    toast.error(`ตัวเลือก ${row.values.nameTH || "ใหม่"}: ${error}`);
    keep();
    return false;
  };

  for (const [index, row] of next.entries()) {
    // An option created by an earlier, partly failed save keeps its temporary key in the files tab.
    if (row.saved && row.key !== row.saved.id) ctx.variantIds.set(row.key, row.saved.id);
    if (row.deleted) {
      if (row.saved) {
        const result = await deleteVariant(row.saved.id);
        if (!result.ok) return fail(row, result.error);
        next[index] = { ...row, saved: null };
      }
      continue;
    }
    const sortOrder = next.filter((r, i) => i < index && !r.deleted).length;
    let id = row.saved?.id ?? null;
    if (!id) {
      const result = await createVariant(productId, null, toFormData(row.values, sortOrder));
      if (!result.ok) return fail(row, Object.values(result.fieldErrors ?? {})[0] ?? result.error);
      id = result.data.id;
      ctx.variantIds.set(row.key, id);
    } else if (changedValues(row)) {
      const result = await updateVariant(id, null, toFormData(row.values, sortOrder));
      if (!result.ok) return fail(row, Object.values(result.fieldErrors ?? {})[0] ?? result.error);
    }
    if (row.saved ? row.saved.isActive !== row.isActive : !row.isActive) {
      const result = await setVariantActive(id, row.isActive);
      if (!result.ok) return fail(row, result.error);
    }
    if (row.image === "removed" && row.saved?.imageUrl) {
      const result = await removeVariantImage(id);
      if (!result.ok) return fail(row, result.error);
    } else if (row.image && row.image !== "removed") {
      const file = row.image.file;
      const stored = await uploadToStorage((input) => requestVariantImageUpload(id, input), file);
      if (!stored.ok) return fail(row, stored.error);
      const result = await confirmVariantImage(id, { path: stored.path, fileName: file.name });
      if (!result.ok) return fail(row, result.error);
      requestImageOptimize("variant", id);
    }
    // Saved: later failures must not redo this row.
    next[index] = {
      ...row,
      saved: {
        ...(row.saved ?? { imageUrl: null, priceLabel: "", discountLabel: null, taken: 0, fileCount: 0 }),
        ...row.values,
        id,
        isActive: row.isActive,
      },
      key: row.key,
      image: null,
    };
  }
  keep();
  return true;
}

function VariantRow({
  row,
  disabled,
  onChange,
  onDiscard,
}: {
  row: Row;
  disabled: boolean;
  onChange: (patch: Partial<Row>) => void;
  onDiscard: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const v = row.saved;
  const stock =
    row.values.stockLimit === ""
      ? "ไม่จำกัด"
      : `${Math.max(0, Number(row.values.stockLimit) - (v?.taken ?? 0))}/${row.values.stockLimit} เหลือ`;
  const imageUrl = row.image === "removed" ? null : row.image ? row.image.url : (v?.imageUrl ?? null);
  const pending = !v || changedValues(row) || row.image !== null || (v && v.isActive !== row.isActive);

  function pickImage(file: File) {
    const error = checkFileMeta(PRODUCT_IMAGE_FILE_TYPES, file.name, file.size, MAX_PRODUCT_FILE_SIZE);
    if (error) return void toast.error(`${file.name}: ${FILE_TYPE_ERROR_TH[error]}`);
    onChange({ image: { file, url: URL.createObjectURL(file) } });
  }

  return (
    <li className={cn("flex flex-wrap items-center gap-3 p-4", row.deleted && "opacity-60")}>
      <input
        ref={inputRef}
        type="file"
        hidden
        accept={acceptAttribute(PRODUCT_IMAGE_FILE_TYPES)}
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) pickImage(file);
          e.currentTarget.value = "";
        }}
      />
      <div className="group relative size-14 shrink-0">
        <button
          type="button"
          disabled={disabled || row.deleted}
          onClick={() => inputRef.current?.click()}
          aria-label={imageUrl ? `เปลี่ยนรูปของ ${row.values.nameTH}` : `เพิ่มรูปของ ${row.values.nameTH}`}
          className="relative grid size-14 place-items-center overflow-hidden rounded-xl border-2 border-dashed bg-muted text-muted-foreground hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {imageUrl ? (
            imageUrl.startsWith("blob:") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="" className="size-full object-cover" />
            ) : (
              <PreviewImage src={imageUrl} alt="" fill sizes="56px" className="object-cover" />
            )
          ) : (
            <ImagePlus className="size-5" aria-hidden />
          )}
        </button>
        {imageUrl && !row.deleted && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange({ image: v?.imageUrl ? "removed" : null })}
            aria-label={`ลบรูปของ ${row.values.nameTH}`}
            className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-foreground text-background shadow-soft hover:bg-destructive"
          >
            <X className="size-3" aria-hidden />
          </button>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          <span className={cn(row.deleted && "line-through")}>{row.values.nameTH}</span>
          <span className="font-normal text-muted-foreground">/ {row.values.nameEN}</span>
          {!row.isActive && <Badge className="bg-muted text-muted-foreground">ปิดขาย</Badge>}
          {row.deleted ? (
            <Badge className="bg-destructive/10 text-destructive">จะลบเมื่อบันทึก</Badge>
          ) : (
            pending && <Badge className="bg-warning/10 text-warning">{v ? "แก้ไขแล้ว" : "ใหม่"}</Badge>
          )}
        </p>
        <p className="text-sm tabular-nums">
          {row.values.price ? `฿${row.values.price}` : "—"}
          {row.values.discountPercent && <span className="text-muted-foreground"> · ลด {row.values.discountPercent}%</span>}
        </p>
        <p className="text-xs text-muted-foreground">
          สต็อก {stock}
          {v && ` · ขาย/จองแล้ว ${v.taken} · ไฟล์เฉพาะแบบนี้ ${v.fileCount}`}
        </p>
      </div>
      <div className="flex flex-wrap gap-1">
        {row.deleted ? (
          <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onChange({ deleted: false })}>
            <Undo2 aria-hidden /> เลิกลบ
          </Button>
        ) : (
          <>
            <VariantDialog
              title={`แก้ไข ${row.values.nameTH}`}
              trigger={
                <Button size="sm" variant="outline" disabled={disabled}>
                  <Pencil aria-hidden /> แก้ไข
                </Button>
              }
              values={row.values}
              onApply={(values) => onChange({ values })}
            />
            <Button size="sm" variant="outline" disabled={disabled} onClick={() => onChange({ isActive: !row.isActive })}>
              {row.isActive ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
              {row.isActive ? "ปิดขาย" : "เปิดขาย"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={disabled || (v !== null && (v.taken > 0 || v.fileCount > 0))}
              title={v && (v.taken > 0 || v.fileCount > 0) ? "มีคำสั่งซื้อหรือไฟล์แล้ว ลบไม่ได้ — ใช้ปิดขายแทน" : undefined}
              onClick={() => (v ? onChange({ deleted: true }) : onDiscard())}
            >
              <Trash2 aria-hidden /> ลบ
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

/** Edits the option in the list only; nothing is saved until the editor's save button. */
function VariantDialog({
  title,
  trigger,
  values,
  onApply,
}: {
  title: string;
  trigger: ReactNode;
  values: VariantValues;
  onApply: (values: VariantValues) => void;
}) {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof VariantValues, string>>>({});

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    const fd = new FormData(e.currentTarget);
    const next = Object.fromEntries(FIELDS.map((f) => [f, String(fd.get(f) ?? "").trim()])) as VariantValues;
    // Quick checks for the obvious; the server validates everything again on save.
    const found: typeof errors = {};
    if (!next.nameTH) found.nameTH = "กรุณากรอกชื่อ";
    if (!next.nameEN) found.nameEN = "กรุณากรอกชื่อ";
    if (!/^\d+(\.\d{1,2})?$/.test(next.price)) found.price = "กรุณากรอกราคาเป็นตัวเลข";
    if (next.discountPercent && (!next.discountStartAt || !next.discountEndAt)) found.discountEndAt = "ส่วนลดต้องมีวันเริ่มและวันสิ้นสุด";
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    onApply(next);
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setErrors({});
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>วันที่เป็นเวลาไทย · ส่วนลดต้องระบุทั้งวันเริ่มและวันสิ้นสุด · สต็อกเว้นว่าง = ไม่จำกัด</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="ชื่อ (ไทย)" name="nameTH" maxLength={80} defaultValue={values.nameTH} error={errors.nameTH} />
            <TextInput label="ชื่อ (English)" name="nameEN" maxLength={80} defaultValue={values.nameEN} error={errors.nameEN} />
            <TextInput label="ราคา (บาท)" name="price" inputMode="decimal" defaultValue={values.price} error={errors.price} />
            <TextInput
              label="สต็อก"
              name="stockLimit"
              type="number"
              min={0}
              max={100000}
              placeholder="ไม่จำกัด"
              defaultValue={values.stockLimit}
            />
            <TextInput
              label="ส่วนลด (%)"
              name="discountPercent"
              inputMode="decimal"
              placeholder="ไม่มีส่วนลด"
              defaultValue={values.discountPercent}
            />
            <div className="hidden sm:block" />
            <DateTimeInput label="เริ่มส่วนลด" name="discountStartAt" defaultValue={values.discountStartAt} />
            <DateTimeInput
              label="สิ้นสุดส่วนลด"
              name="discountEndAt"
              defaultTime="23:59"
              defaultValue={values.discountEndAt}
              error={errors.discountEndAt}
            />
          </div>
          <DialogFooter>
            <Button type="submit">ตกลง</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
