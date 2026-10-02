"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FormSection } from "@/components/admin/form-controls";
import { useEditorSection } from "@/components/admin/product-editor";
import { saveProductLicensePrices } from "@/lib/licenses/admin-actions";
import type { FieldErrors } from "@/lib/validation/auth";

export type LicensePricingRow = { id: string; nameTH: string; nameEN: string; isActive: boolean; price: string | null };

type RowState = { enabled: boolean; price: string };

const initialState = (rows: LicensePricingRow[]): Record<string, RowState> =>
  Object.fromEntries(rows.map((r) => [r.id, { enabled: r.price !== null, price: r.price ?? "" }]));

/** Per-product price for each usage type. Unticked = not offered. Saved with the editor's save button. */
export function LicensePricingEditor({ rows }: { rows: LicensePricingRow[] }) {
  const [state, setState] = useState(() => initialState(rows));
  const [saved, setSaved] = useState(() => JSON.stringify(initialState(rows)));
  const [errors, setErrors] = useState<FieldErrors>({});
  const dirty = JSON.stringify(state) !== saved;

  useEditorSection(
    "license",
    {
      order: 50,
      tab: "license",
      label: "ราคา License",
      save: async (ctx) => {
        if (!ctx.productId) return false;
        const entries = rows.map((r) => ({ usageTypeId: r.id, ...state[r.id] }));
        const result = await saveProductLicensePrices(ctx.productId, entries);
        if (!result.ok) {
          if (result.fieldErrors) setErrors(result.fieldErrors);
          toast.error(`License: ${result.error}`);
          return false;
        }
        setSaved(JSON.stringify(state));
        return true;
      },
    },
    dirty,
  );

  function update(id: string, patch: Partial<RowState>) {
    setState((s) => ({ ...s, [id]: { ...s[id], ...patch } }));
    setErrors((e) => {
      const next = { ...e };
      delete next[id];
      return next;
    });
  }

  return (
    <FormSection
      title="Commercial license"
      description="เลือกประเภทการใช้งานที่เปิดให้ขอ License สำหรับสินค้านี้ และตั้งราคาของแต่ละประเภท ลูกค้าเลือกได้หลายประเภท ราคารวม = ผลรวม ส่วนลดของสินค้าไม่มีผลกับราคา License"
    >
      {rows.length === 0 ? (
        <p className="rounded-xl bg-muted px-4 py-6 text-center text-sm text-muted-foreground">
          ยังไม่มีประเภทการใช้งาน{" "}
          <Link href="/admin/licenses/types" className="font-medium text-foreground underline">
            เพิ่มประเภทก่อน
          </Link>
        </p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {rows.map((r) => {
            const row = state[r.id];
            const error = errors[r.id];
            const checkboxId = `license-${r.id}`;
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-3 sm:flex-nowrap">
                <Checkbox
                  id={checkboxId}
                  checked={row.enabled}
                  onCheckedChange={(v) => update(r.id, { enabled: v === true })}
                />
                <label htmlFor={checkboxId} className="min-w-0 flex-1 cursor-pointer">
                  <span className="block font-medium">{r.nameTH}</span>
                  <span className="block text-xs text-muted-foreground">{r.nameEN}</span>
                </label>
                {!r.isActive && <Badge className="bg-muted text-muted-foreground">ปิดใช้งาน (ลูกค้าไม่เห็น)</Badge>}
                <div className="w-full space-y-1 sm:w-40">
                  <div className="relative">
                    <Input
                      inputMode="decimal"
                      value={row.price}
                      onChange={(e) => update(r.id, { price: e.target.value })}
                      disabled={!row.enabled}
                      aria-label={`ราคา ${r.nameTH} (บาท)`}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? `${checkboxId}-error` : undefined}
                      placeholder="0.00"
                      className="h-10 rounded-xl pr-10 text-right tabular-nums"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                      ฿
                    </span>
                  </div>
                  {error && (
                    <p id={`${checkboxId}-error`} className="text-xs text-destructive">
                      {error}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </FormSection>
  );
}
