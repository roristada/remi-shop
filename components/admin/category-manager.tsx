"use client";

import { useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Pencil, Plus, Trash2, Wand2 } from "lucide-react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { runWithToast, SelectInput, TextArea, TextInput } from "@/components/admin/form-controls";
import { useDirectUpload } from "@/components/admin/use-direct-upload";
import { CategoryIcon } from "@/components/shop/category-icon";
import {
  confirmCategoryImageUpload,
  deleteCategory,
  removeCategoryImage,
  requestCategoryImageUpload,
  saveCategory,
} from "@/lib/categories/actions";
import { CATEGORY_ICON_KEYS, CATEGORY_ICON_LABEL_TH, guessIconKey, type CategoryIconKey } from "@/lib/categories/icons";
import { acceptAttribute, IMAGE_FILE_TYPES } from "@/lib/storage/file-types";
import type { ActionResult } from "@/lib/actions/result";
import { cn } from "@/lib/utils";

export type ManagedCategory = {
  id: string;
  slug: string;
  nameTH: string;
  nameEN: string;
  descriptionTH: string;
  descriptionEN: string;
  status: "ACTIVE" | "HIDDEN";
  sortOrder: number;
  productCount: number;
  /** null = guessed from the slug. */
  iconKey: string | null;
  /** Uploaded icon picture (replaces the drawn icon). */
  imageUrl: string | null;
};

export function CategoryManager({ categories }: { categories: ManagedCategory[] }) {
  const router = useRouter();

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <CategoryDialog
          title="เพิ่มหมวดหมู่"
          trigger={
            <Button className="h-10 rounded-full px-5">
              <Plus aria-hidden /> เพิ่มหมวดหมู่
            </Button>
          }
        />
      </div>

      {categories.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-12 text-center text-sm text-muted-foreground">
          ยังไม่มีหมวดหมู่
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent [&>th]:h-11 [&>th]:text-xs [&>th]:font-medium [&>th]:text-muted-foreground">
                <TableHead className="w-16 pl-4">ลำดับ</TableHead>
                <TableHead className="w-14">
                  <span className="sr-only">ไอคอน</span>
                </TableHead>
                <TableHead>ชื่อ</TableHead>
                <TableHead className="hidden w-36 sm:table-cell">Slug</TableHead>
                <TableHead className="w-20 pr-6 text-right">สินค้า</TableHead>
                <TableHead className="w-24">สถานะ</TableHead>
                <TableHead className="w-24 pr-4">
                  <span className="sr-only">จัดการ</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((c) => (
                <TableRow key={c.id} className="hover:bg-muted/40">
                  <TableCell className="pl-4 text-muted-foreground tabular-nums">{c.sortOrder}</TableCell>
                  <TableCell>
                    <CategoryIcon slug={c.slug} iconKey={c.iconKey} imageUrl={c.imageUrl} className="size-10 rounded-xl" />
                  </TableCell>
                  <TableCell className="max-w-0">
                    <p className="font-medium">
                      {c.nameTH} <span className="font-normal text-muted-foreground">· {c.nameEN}</span>
                    </p>
                    {/* The description is shown on the shop's category page; a preview helps spot empty ones. */}
                    <p className="truncate text-xs text-muted-foreground" title={c.descriptionTH || undefined}>
                      {c.descriptionTH || <span className="italic">ยังไม่มีคำอธิบาย</span>}
                    </p>
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">{c.slug}</TableCell>
                  <TableCell className="pr-6 text-right font-medium tabular-nums">{c.productCount}</TableCell>
                  <TableCell>
                    {c.status === "ACTIVE" ? (
                      <Badge className="bg-success/10 text-success">แสดง</Badge>
                    ) : (
                      <Badge className="bg-muted text-muted-foreground">ซ่อน</Badge>
                    )}
                  </TableCell>
                  <TableCell className="pr-4">
                    <div className="flex justify-end gap-0.5">
                      <CategoryDialog
                        title={`แก้ไข ${c.nameTH}`}
                        category={c}
                        trigger={
                          <Button size="icon-sm" variant="ghost" aria-label={`แก้ไข ${c.nameTH}`}>
                            <Pencil />
                          </Button>
                        }
                      />
                      {c.productCount > 0 ? (
                        // Kept visible (disabled) so every row's buttons line up and the reason is discoverable.
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          disabled
                          aria-label={`ลบ ${c.nameTH} ไม่ได้ เพราะมีสินค้า`}
                          title="มีสินค้าในหมวดนี้ ลบไม่ได้ — ใช้ “ซ่อน” แทน"
                        >
                          <Trash2 />
                        </Button>
                      ) : (
                        <ConfirmDialog
                          trigger={
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              aria-label={`ลบ ${c.nameTH}`}
                            >
                              <Trash2 />
                            </Button>
                          }
                          title={`ลบหมวดหมู่ ${c.nameTH}?`}
                          description="ลบถาวร กู้คืนไม่ได้"
                          confirmLabel="ลบ"
                          destructive
                          onConfirm={async () => {
                            const done = await runWithToast(() => deleteCategory(c.id));
                            if (done) router.refresh();
                            return done;
                          }}
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function CategoryDialog({ title, trigger, category }: { title: string; trigger: ReactNode; category?: ManagedCategory }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const err = (name: string) => (state && !state.ok ? state.fieldErrors?.[name] : undefined);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await saveCategory(category?.id ?? null, state, formData);
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
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        // The file picker for the icon upload takes focus away; that must not close the form.
        onFocusOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>หมวดหมู่ที่ซ่อนจะไม่แสดงในหน้าร้าน</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {state && !state.ok && !state.fieldErrors && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="ชื่อ (ไทย)" name="nameTH" defaultValue={category?.nameTH} maxLength={80} required error={err("nameTH")} />
            <TextInput label="ชื่อ (English)" name="nameEN" defaultValue={category?.nameEN} maxLength={80} required error={err("nameEN")} />
            <TextInput label="Slug" name="slug" defaultValue={category?.slug} maxLength={100} required error={err("slug")} />
            <TextInput
              label="ลำดับ"
              name="sortOrder"
              type="number"
              min={0}
              max={9999}
              defaultValue={category?.sortOrder ?? 0}
              error={err("sortOrder")}
            />
          </div>
          <IconPicker category={category} />
          <TextArea label="คำอธิบาย (ไทย)" name="descriptionTH" rows={2} maxLength={500} defaultValue={category?.descriptionTH} error={err("descriptionTH")} />
          <TextArea label="คำอธิบาย (English)" name="descriptionEN" rows={2} maxLength={500} defaultValue={category?.descriptionEN} error={err("descriptionEN")} />
          <SelectInput
            label="สถานะ"
            name="status"
            defaultValue={category?.status ?? "ACTIVE"}
            options={[
              { value: "ACTIVE", label: "แสดง" },
              { value: "HIDDEN", label: "ซ่อน" },
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

/**
 * Drawn icon for the home page (or "auto": guessed from the slug), plus an optional uploaded picture
 * that replaces it. The picture uploads right away, so it needs a saved category (its id).
 */
function IconPicker({ category }: { category?: ManagedCategory }) {
  const [picked, setPicked] = useState<CategoryIconKey | "">((category?.iconKey as CategoryIconKey | null) ?? "");
  const autoKey = guessIconKey(category?.slug ?? "");

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">ไอคอนบนหน้าแรก</legend>
      <input type="hidden" name="iconKey" value={picked} />
      <div role="radiogroup" aria-label="ไอคอน" className="grid grid-cols-5 gap-2 sm:grid-cols-8">
        <IconChoice selected={picked === ""} label={`อัตโนมัติจาก slug (${CATEGORY_ICON_LABEL_TH[autoKey]})`} onSelect={() => setPicked("")}>
          <span className="relative">
            <CategoryIcon slug={category?.slug ?? ""} className="size-12 rounded-xl" />
            <Wand2 className="absolute -right-1 -bottom-1 size-4 rounded-full bg-background p-0.5 text-brand-strong" aria-hidden />
          </span>
        </IconChoice>
        {CATEGORY_ICON_KEYS.map((key) => (
          <IconChoice key={key} selected={picked === key} label={CATEGORY_ICON_LABEL_TH[key]} onSelect={() => setPicked(key)}>
            <CategoryIcon slug="" iconKey={key} className="size-12 rounded-xl" />
          </IconChoice>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {picked === "" ? `อัตโนมัติ: ตอนนี้ได้ ${CATEGORY_ICON_LABEL_TH[autoKey]} (เดาจาก slug)` : `เลือก: ${CATEGORY_ICON_LABEL_TH[picked]}`}
      </p>
      {category ? (
        <CategoryImageControls categoryId={category.id} imageUrl={category.imageUrl} />
      ) : (
        <p className="text-xs text-muted-foreground">อัปโหลดรูปไอคอนเองได้หลังบันทึกหมวดหมู่</p>
      )}
    </fieldset>
  );
}

function IconChoice({ selected, label, onSelect, children }: { selected: boolean; label: string; onSelect: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      title={label}
      onClick={onSelect}
      className={cn(
        "grid place-items-center rounded-2xl p-1 ring-2 ring-transparent transition-shadow hover:bg-muted focus-visible:ring-ring focus-visible:outline-none",
        selected && "bg-muted ring-brand-strong",
      )}
    >
      {children}
    </button>
  );
}

function CategoryImageControls({ categoryId, imageUrl }: { categoryId: string; imageUrl: string | null }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [current, setCurrent] = useState(imageUrl);
  const { upload, uploading } = useDirectUpload(
    (input) => requestCategoryImageUpload(categoryId, input),
    (input) => confirmCategoryImageUpload(categoryId, input),
  );

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed p-3">
      {current && <CategoryIcon slug="" imageUrl={current} className="size-12 rounded-xl" />}
      <p className="min-w-0 flex-1 text-xs text-muted-foreground">
        {current
          ? "ใช้รูปที่อัปโหลดแทนไอคอนวาด (ไม่มีแอนิเมชัน)"
          : "หรืออัปโหลดรูปไอคอนเองแทนไอคอนวาด · JPG, PNG, WEBP ไม่เกิน 5 MB · แนะนำรูปสี่เหลี่ยมจัตุรัส"}
      </p>
      <input
        ref={fileRef}
        type="file"
        accept={acceptAttribute(IMAGE_FILE_TYPES)}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file && (await upload([file]))) {
            setCurrent(URL.createObjectURL(file));
            router.refresh();
          }
        }}
      />
      <Button type="button" variant="outline" size="sm" className="rounded-full" disabled={Boolean(uploading)} onClick={() => fileRef.current?.click()}>
        {uploading ? <Loader2 className="animate-spin" aria-hidden /> : <ImagePlus aria-hidden />}
        {current ? "เปลี่ยนรูป" : "อัปโหลดรูป"}
      </Button>
      {current && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-full text-destructive"
          onClick={async () => {
            if (await runWithToast(() => removeCategoryImage(categoryId))) {
              setCurrent(null);
              router.refresh();
            }
          }}
        >
          <Trash2 aria-hidden /> ใช้ไอคอนวาด
        </Button>
      )}
    </div>
  );
}
