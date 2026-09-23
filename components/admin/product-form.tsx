"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormSection, SelectInput, TextArea, TextInput, useResultToast } from "@/components/admin/form-controls";
import { DateTimeInput } from "@/components/admin/date-time-input";
import type { ActionResult } from "@/lib/actions/result";

export type ProductFormValues = {
  slug: string;
  nameTH: string;
  nameEN: string;
  descriptionTH: string;
  descriptionEN: string;
  categoryId: string;
  price: string;
  discountPercent: string;
  discountStartAt: string;
  discountEndAt: string;
  saleStartAt: string;
  saleEndAt: string;
  software: string;
  supportedVersion: string;
  fileFormat: string;
  license: string;
  requirementsTH: string;
  requirementsEN: string;
  downloadLimitMode: "unlimited" | "5" | "10" | "custom";
  downloadLimitCustom: string;
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
  price: "",
  discountPercent: "",
  discountStartAt: "",
  discountEndAt: "",
  saleStartAt: "",
  saleEndAt: "",
  software: "",
  supportedVersion: "",
  fileFormat: "",
  license: "",
  requirementsTH: "",
  requirementsEN: "",
  downloadLimitMode: "unlimited",
  downloadLimitCustom: "",
  seoTitleTH: "",
  seoTitleEN: "",
  metaDescriptionTH: "",
  metaDescriptionEN: "",
};

type Action = (prev: ActionResult<unknown> | null, formData: FormData) => Promise<ActionResult<unknown>>;

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

export function ProductForm({
  action,
  values,
  categories,
  submitLabel,
}: {
  action: Action;
  values: ProductFormValues;
  categories: { id: string; nameTH: string; status: string }[];
  submitLabel: string;
}) {
  const [state, setState] = useState<ActionResult<unknown> | null>(null);
  const [pending, startTransition] = useTransition();
  const [limitMode, setLimitMode] = useState(values.downloadLimitMode);
  const slugRef = useRef<HTMLInputElement>(null);
  const nameENRef = useRef<HTMLInputElement>(null);
  useResultToast(state);

  // Submitting via onSubmit (not the `action` prop) keeps the user's input on validation errors.
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => setState(await action(state, formData)));
  }

  const err = (name: string) => (state && !state.ok ? state.fieldErrors?.[name] : undefined);

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
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
          <TextArea label="รายละเอียด (ไทย)" name="descriptionTH" defaultValue={values.descriptionTH} rows={6} error={err("descriptionTH")} />
          <TextArea label="รายละเอียด (English)" name="descriptionEN" defaultValue={values.descriptionEN} rows={6} error={err("descriptionEN")} />
        </div>
      </FormSection>

      <FormSection title="ราคาและส่วนลด" description="ราคาจริงคำนวณที่ server ทุกครั้ง ส่วนลดใช้ได้เฉพาะในช่วงเวลาที่กำหนด (เวลาไทย)">
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
          <DateTimeInput label="สิ้นสุดส่วนลด" name="discountEndAt" defaultTime="23:59" defaultValue={values.discountEndAt} error={err("discountEndAt")} />
        </div>
      </FormSection>

      <FormSection title="ช่วงเวลาขาย" description="เว้นว่าง = ขายได้ทันที / ไม่มีวันสิ้นสุด (เวลาไทย)">
        <div className="grid gap-4 md:grid-cols-2">
          <DateTimeInput label="เริ่มขาย" name="saleStartAt" defaultValue={values.saleStartAt} error={err("saleStartAt")} />
          <DateTimeInput label="สิ้นสุดการขาย" name="saleEndAt" defaultTime="23:59" defaultValue={values.saleEndAt} error={err("saleEndAt")} />
        </div>
      </FormSection>

      <FormSection title="ความเข้ากันได้และลิขสิทธิ์">
        <div className="grid gap-4 md:grid-cols-2">
          <TextInput label="โปรแกรม" name="software" placeholder="เช่น Procreate, Clip Studio Paint" defaultValue={values.software} error={err("software")} />
          <TextInput label="เวอร์ชันที่รองรับ" name="supportedVersion" placeholder="เช่น 5.2+" defaultValue={values.supportedVersion} error={err("supportedVersion")} />
          <TextInput label="รูปแบบไฟล์" name="fileFormat" placeholder="เช่น .brushset" defaultValue={values.fileFormat} error={err("fileFormat")} />
          <TextInput label="License" name="license" placeholder="เช่น Personal & Commercial Use" defaultValue={values.license} error={err("license")} />
          <TextArea label="ความต้องการของระบบ (ไทย)" name="requirementsTH" rows={3} defaultValue={values.requirementsTH} error={err("requirementsTH")} />
          <TextArea label="ความต้องการของระบบ (English)" name="requirementsEN" rows={3} defaultValue={values.requirementsEN} error={err("requirementsEN")} />
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

      <div className="sticky bottom-0 -mx-4 flex justify-end border-t bg-background/90 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <Button type="submit" disabled={pending} aria-busy={pending} className="h-10 rounded-full px-6">
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
