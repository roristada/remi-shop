"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Wand2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FormSection, SelectInput, TextArea, TextInput } from "@/components/admin/form-controls";
import { DateTimeInput } from "@/components/admin/date-time-input";
import { useEditorSection } from "@/components/admin/product-editor";
import { createProduct, updateProduct } from "@/lib/products/admin-actions";
import type { ActionResult } from "@/lib/actions/result";

export type ProductFormValues = {
  slug: string;
  nameTH: string;
  nameEN: string;
  descriptionTH: string;
  descriptionEN: string;
  categoryId: string;
  /** "none" = no folder. */
  folderId: string;
  price: string;
  discountPercent: string;
  discountStartAt: string;
  discountEndAt: string;
  saleStartAt: string;
  saleEndAt: string;
  softwareTagIds: string[];
  supportedVersion: string;
  fileFormat: string;
  license: string;
  requirementsTH: string;
  requirementsEN: string;
  downloadLimitMode: "unlimited" | "5" | "10" | "custom";
  downloadLimitCustom: string;
  stockLimit: string;
  seoTitleTH: string;
  seoTitleEN: string;
  metaDescriptionTH: string;
  metaDescriptionEN: string;
};

export const EMPTY_PRODUCT_VALUES: ProductFormValues = {
  slug: "",
  nameTH: "",
  nameEN: "",
  descriptionTH: "",
  descriptionEN: "",
  categoryId: "",
  folderId: "none",
  price: "",
  discountPercent: "",
  discountStartAt: "",
  discountEndAt: "",
  saleStartAt: "",
  saleEndAt: "",
  softwareTagIds: [],
  supportedVersion: "",
  fileFormat: "",
  license: "",
  requirementsTH: "",
  requirementsEN: "",
  downloadLimitMode: "unlimited",
  downloadLimitCustom: "",
  stockLimit: "",
  seoTitleTH: "",
  seoTitleEN: "",
  metaDescriptionTH: "",
  metaDescriptionEN: "",
};

function scheduleWarningsOf(data: unknown): Record<string, string | undefined> {
  if (data && typeof data === "object" && "warnings" in data && data.warnings && typeof data.warnings === "object") {
    return data.warnings as Record<string, string | undefined>;
  }
  return {};
}

function VariantsNotice() {
  return (
    <p className="rounded-xl bg-warning/10 p-3 text-sm font-medium text-warning">
      สินค้านี้มีตัวเลือก ราคา ส่วนลด และสต็อกที่ใช้ขายจริงตั้งที่แท็บตัวเลือก ค่าในส่วนนี้ไม่ถูกใช้ (ราคาจะปรับเป็นราคาต่ำสุดของตัวเลือกอัตโนมัติ)
    </p>
  );
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

type ProductFormProps = {
  values: ProductFormValues;
  categories: { id: string; nameTH: string; status: string }[];
  folders: { id: string; nameTH: string }[];
  softwareTags: { id: string; name: string; isActive: boolean }[];
  /** Units held by open or completed orders; edit page only. */
  stockTaken?: number;
  /** Price, discount and stock then come from the variants (this price is kept at the cheapest). */
  hasVariants?: boolean;
};

/** Field values as one comparable string; files are compared by name only. */
function serializeForm(form: HTMLFormElement): string {
  return JSON.stringify([...new FormData(form).entries()].map(([k, v]) => [k, typeof v === "string" ? v : v.name]));
}

/** Text, price, schedule and other details. Saved (or, for a new product, created first) by the editor. */
export function ProductForm({ values, categories, folders, softwareTags, stockTaken, hasVariants = false }: ProductFormProps) {
  const [state, setState] = useState<ActionResult<unknown> | null>(null);
  const [limitMode, setLimitMode] = useState(values.downloadLimitMode);
  const slugRef = useRef<HTMLInputElement>(null);
  const nameENRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const savedRef = useRef<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEditorSection(
    "details",
    {
      order: 10,
      tab: "details",
      label: "รายละเอียด",
      required: true,
      save: async (ctx) => {
        const form = formRef.current;
        if (!form) return false;
        const formData = new FormData(form);
        const submitted = serializeForm(form);
        const result = ctx.productId ? await updateProduct(ctx.productId, null, formData) : await createProduct(null, formData);
        setState(result);
        if (!result.ok) {
          toast.error(result.error);
          return false;
        }
        if (!ctx.productId && result.data && typeof result.data === "object" && "id" in result.data) {
          ctx.productId = String(result.data.id);
        }
        // Warnings (e.g. a discount window already over) must be read before leaving the page.
        if (result.notify && result.message) toast.info(result.message);
        savedRef.current = submitted;
        setDirty(serializeForm(form) !== submitted);
        return true;
      },
    },
    dirty,
  );

  useEffect(() => {
    if (formRef.current) savedRef.current = serializeForm(formRef.current);
  }, []);

  // Custom inputs update their hidden fields after the event, so compare on the next tick.
  const checkDirty = () =>
    setTimeout(() => {
      if (formRef.current && savedRef.current !== null) setDirty(serializeForm(formRef.current) !== savedRef.current);
    }, 0);

  // Enter in a field must not submit: the editor's save button saves every tab together.
  const onSubmit = (e: FormEvent<HTMLFormElement>) => e.preventDefault();

  const err = (name: string) => (state && !state.ok ? state.fieldErrors?.[name] : undefined);
  // Non-blocking notes from a successful save (e.g. a discount window that is already over).
  const warn = (name: string) => (state?.ok ? scheduleWarningsOf(state.data)[name] : undefined);

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      onInput={checkDirty}
      onChange={checkDirty}
      onClick={checkDirty}
      className="space-y-6"
      noValidate
    >
      <FormSection title="ข้อมูลสินค้า">
        <div className="grid gap-4 md:grid-cols-2">
          <TextInput label="ชื่อสินค้า (ไทย)" name="nameTH" defaultValue={values.nameTH} maxLength={150} required error={err("nameTH")} />
          <TextInput
            ref={nameENRef}
            label="ชื่อสินค้า (English)"
            name="nameEN"
            defaultValue={values.nameEN}
            maxLength={150}
            required
            error={err("nameEN")}
          />
          <div className="relative">
            <TextInput
              ref={slugRef}
              label="Slug (URL)"
              name="slug"
              defaultValue={values.slug}
              maxLength={100}
              required
              error={err("slug")}
              hint="a-z, 0-9 และ - เช่น watercolor-brush-pack"
            />
            {/* Sits in the label row so the input keeps its full width. */}
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="absolute -top-1 right-0 text-muted-foreground"
              onClick={() => {
                if (slugRef.current && nameENRef.current) slugRef.current.value = slugify(nameENRef.current.value);
              }}
            >
              <Wand2 aria-hidden /> สร้างจากชื่อ EN
            </Button>
          </div>
          <SelectInput
            label="หมวดหมู่"
            name="categoryId"
            defaultValue={values.categoryId}
            placeholder="— เลือกหมวดหมู่ —"
            options={categories.map((c) => ({ value: c.id, label: c.status === "HIDDEN" ? `${c.nameTH} (ซ่อน)` : c.nameTH }))}
            error={err("categoryId")}
          />
          <SelectInput
            label="โฟลเดอร์ (ไม่บังคับ)"
            name="folderId"
            defaultValue={values.folderId}
            options={[{ value: "none", label: "— ไม่มีโฟลเดอร์ —" }, ...folders.map((f) => ({ value: f.id, label: f.nameTH }))]}
            error={err("folderId")}
          />
          <TextArea label="รายละเอียด (ไทย)" name="descriptionTH" defaultValue={values.descriptionTH} rows={6} error={err("descriptionTH")} />
          <TextArea label="รายละเอียด (English)" name="descriptionEN" defaultValue={values.descriptionEN} rows={6} error={err("descriptionEN")} />
        </div>
      </FormSection>

      <FormSection title="ราคาและส่วนลด" description="ราคาจริงคำนวณที่ server ทุกครั้ง ส่วนลดใช้ได้เฉพาะในช่วงเวลาที่กำหนด (เวลาไทย)">
        {hasVariants && <VariantsNotice />}
        <div className="grid gap-4 md:grid-cols-2">
          <TextInput label="ราคา (บาท)" name="price" inputMode="decimal" defaultValue={values.price} required error={err("price")} />
          <TextInput
            label="ส่วนลด (%)"
            name="discountPercent"
            inputMode="decimal"
            defaultValue={values.discountPercent}
            error={err("discountPercent")}
            hint="เว้นว่างถ้าไม่มีส่วนลด"
          />
          <DateTimeInput label="เริ่มส่วนลด" name="discountStartAt" defaultValue={values.discountStartAt} error={err("discountStartAt")} />
          <DateTimeInput label="สิ้นสุดส่วนลด" name="discountEndAt" defaultTime="23:59" defaultValue={values.discountEndAt} error={err("discountEndAt")} warning={warn("discountEndAt")} />
        </div>
      </FormSection>

      <FormSection title="ช่วงเวลาขาย" description="เว้นว่าง = ขายได้ทันที / ไม่มีวันสิ้นสุด (เวลาไทย)">
        <div className="grid gap-4 md:grid-cols-2">
          <DateTimeInput label="เริ่มขาย" name="saleStartAt" defaultValue={values.saleStartAt} error={err("saleStartAt")} />
          <DateTimeInput label="สิ้นสุดการขาย" name="saleEndAt" defaultTime="23:59" defaultValue={values.saleEndAt} error={err("saleEndAt")} warning={warn("saleEndAt")} />
        </div>
      </FormSection>

      <FormSection title="ความเข้ากันได้และลิขสิทธิ์">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium">โปรแกรม</span>
            {softwareTags.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                ยังไม่มีรายการโปรแกรม —{" "}
                <Link href="/admin/products/software-tags" className="underline underline-offset-2">
                  จัดการโปรแกรม
                </Link>
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {softwareTags.map((tag) => (
                  <label
                    key={tag.id}
                    className="flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm has-checked:border-primary has-checked:bg-secondary/60"
                  >
                    <input
                      type="checkbox"
                      name="softwareTagIds"
                      value={tag.id}
                      defaultChecked={values.softwareTagIds.includes(tag.id)}
                      className="size-3.5 accent-brand-strong"
                    />
                    {tag.name}
                    {!tag.isActive && <span className="text-xs text-muted-foreground">(ปิดใช้งาน)</span>}
                  </label>
                ))}
              </div>
            )}
            {err("softwareTagIds") && <p className="text-sm text-destructive">{err("softwareTagIds")}</p>}
          </div>
          <TextInput label="เวอร์ชันที่รองรับ" name="supportedVersion" placeholder="เช่น 5.2+" defaultValue={values.supportedVersion} error={err("supportedVersion")} />
          <TextInput label="รูปแบบไฟล์" name="fileFormat" placeholder="เช่น .brushset" defaultValue={values.fileFormat} error={err("fileFormat")} />
          <TextInput label="License" name="license" placeholder="เช่น Personal & Commercial Use" defaultValue={values.license} error={err("license")} />
          <TextArea label="ความต้องการของระบบ (ไทย)" name="requirementsTH" rows={3} defaultValue={values.requirementsTH} error={err("requirementsTH")} />
          <TextArea label="ความต้องการของระบบ (English)" name="requirementsEN" rows={3} defaultValue={values.requirementsEN} error={err("requirementsEN")} />
        </div>
      </FormSection>

      <FormSection title="สต็อกสินค้า" description="เว้นว่าง = ไม่จำกัด ถ้ากำหนดไว้ หน้าร้านจะแสดงจำนวนที่เหลือ และขึ้นป้าย “สินค้าหมด” (ซื้อไม่ได้) เมื่อหมด">
        {hasVariants && <VariantsNotice />}
        <div className="grid gap-4 md:grid-cols-2">
          <TextInput
            label="จำนวนสต็อก"
            name="stockLimit"
            type="number"
            min={0}
            max={100000}
            placeholder="ไม่จำกัด"
            defaultValue={values.stockLimit}
            error={err("stockLimit")}
            hint={
              stockTaken !== undefined
                ? `ขายแล้วหรือจองในคำสั่งซื้อที่รอชำระ/รอตรวจ ${stockTaken} ชิ้น (คำสั่งซื้อที่หมดเวลา ยกเลิก หรือถูกปฏิเสธ จะคืนสต็อกอัตโนมัติ)`
                : undefined
            }
          />
        </div>
      </FormSection>

      <FormSection title="การดาวน์โหลด">
        <div className="grid gap-4 md:grid-cols-2">
          <SelectInput
            label="จำกัดจำนวนครั้งดาวน์โหลด"
            name="downloadLimitMode"
            value={limitMode}
            onValueChange={(v) => setLimitMode(v as ProductFormValues["downloadLimitMode"])}
            options={[
              { value: "unlimited", label: "ไม่จำกัด" },
              { value: "5", label: "5 ครั้ง" },
              { value: "10", label: "10 ครั้ง" },
              { value: "custom", label: "กำหนดเอง" },
            ]}
          />
          {limitMode === "custom" && (
            <TextInput
              label="จำนวนครั้ง"
              name="downloadLimitCustom"
              type="number"
              min={1}
              max={10000}
              defaultValue={values.downloadLimitCustom}
              error={err("downloadLimit.custom")}
            />
          )}
        </div>
      </FormSection>

      <FormSection title="SEO" description="เว้นว่างเพื่อใช้ชื่อและรายละเอียดสินค้า">
        <div className="grid gap-4 md:grid-cols-2">
          <TextInput label="SEO Title (ไทย)" name="seoTitleTH" maxLength={70} defaultValue={values.seoTitleTH} error={err("seoTitleTH")} />
          <TextInput label="SEO Title (English)" name="seoTitleEN" maxLength={70} defaultValue={values.seoTitleEN} error={err("seoTitleEN")} />
          <TextArea label="Meta Description (ไทย)" name="metaDescriptionTH" maxLength={160} rows={2} defaultValue={values.metaDescriptionTH} error={err("metaDescriptionTH")} />
          <TextArea label="Meta Description (English)" name="metaDescriptionEN" maxLength={160} rows={2} defaultValue={values.metaDescriptionEN} error={err("metaDescriptionEN")} />
        </div>
      </FormSection>

    </form>
  );
}
