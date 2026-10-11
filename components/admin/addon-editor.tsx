"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ImageOff, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { PreviewImage } from "@/components/shared/preview-image";
import { FormSection } from "@/components/admin/form-controls";
import { useEditorSection } from "@/components/admin/product-editor";
import { saveProductAddons } from "@/lib/addons/actions";
import { MAX_ADDON_MAINS, MAX_ADDONS } from "@/lib/addons/rules";
import type { AddonCandidate } from "@/lib/addons/queries";
import { formatTHB } from "@/lib/pricing/calculate";
import { cn } from "@/lib/utils";

const iconButton =
  "grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30";
const RESULTS = 20;

type Props = {
  enabled: boolean;
  selectedIds: string[];
  candidates: AddonCandidate[];
  addonOnly: boolean;
  hasVariants: boolean;
  mainIds: string[];
  mainCandidates: AddonCandidate[];
};

/**
 * The product's add-on tab, saved with the editor's save button. Either the product offers
 * add-ons (its list and on/off switch), or it is sold only as an add-on of the main products
 * picked here.
 */
export function AddonEditor({ enabled: savedEnabled, selectedIds, candidates, addonOnly: savedAddonOnly, hasVariants, mainIds: savedMainIds, mainCandidates }: Props) {
  const [enabled, setEnabled] = useState(savedEnabled);
  const [ids, setIds] = useState(selectedIds);
  const [addonOnly, setAddonOnly] = useState(savedAddonOnly);
  const [mainIds, setMainIds] = useState(savedMainIds);
  const snapshot = (v: { enabled: boolean; ids: string[]; addonOnly: boolean; mainIds: string[] }) => JSON.stringify(v);
  const [saved, setSaved] = useState(() => snapshot({ enabled: savedEnabled, ids: selectedIds, addonOnly: savedAddonOnly, mainIds: savedMainIds }));
  const current = snapshot({ enabled, ids, addonOnly, mainIds });
  const dirty = current !== saved;

  useEditorSection(
    "addons",
    {
      order: 60,
      tab: "addons",
      label: "Add-on",
      save: async (ctx) => {
        if (!ctx.productId) return false;
        const result = await saveProductAddons(ctx.productId, { enabled, addonIds: ids, addonOnly, mainIds });
        if (!result.ok) {
          toast.error(`Add-on: ${result.error}`);
          return false;
        }
        setSaved(current);
        return true;
      },
    },
    dirty,
  );

  return (
    <div className="space-y-6">
      <FormSection
        title="ขายเป็น Add-on เท่านั้น"
        description="สินค้านี้จะยังแสดงในหน้าร้าน (มีป้าย Add-on) แต่ซื้อแยกไม่ได้ ลูกค้าต้องซื้อคู่กับสินค้าหลักที่เลือกด้านล่าง หรือมีสินค้าหลักนั้นอยู่แล้ว"
      >
        <label className={cn("flex items-center gap-2 text-sm font-medium", hasVariants ? "opacity-60" : "cursor-pointer")}>
          <input
            type="checkbox"
            checked={addonOnly}
            disabled={hasVariants && !addonOnly}
            onChange={(e) => setAddonOnly(e.target.checked)}
            className="size-4 accent-brand-strong"
          />
          ขายเป็น Add-on เท่านั้น
        </label>
        {hasVariants && !addonOnly && <p className="text-xs text-muted-foreground">สินค้าที่มีตัวเลือกขายเป็น Add-on ไม่ได้</p>}

        {addonOnly && (
          <div className="space-y-2">
            <p className="text-sm font-medium">ขายคู่กับสินค้าหลัก</p>
            <ProductPicker
              ids={mainIds}
              onChange={setMainIds}
              candidates={mainCandidates}
              max={MAX_ADDON_MAINS}
              emptyText="ยังไม่ได้เลือกสินค้าหลัก ลูกค้าจะซื้อ Add-on นี้ไม่ได้"
              searchLabel="ค้นหาสินค้าหลัก"
              sortable={false}
            />
            <p className="text-xs text-muted-foreground">สินค้าหลักที่เลือกจะเปิดใช้ Add-on ให้อัตโนมัติ และ Add-on นี้จะต่อท้ายรายการของสินค้าหลักนั้น</p>
          </div>
        )}
      </FormSection>

      {!addonOnly && (
        <FormSection
          title="Add-on (ซื้อเพิ่มคู่กัน)"
          description="สินค้าที่แสดงให้ลูกค้าติ๊กเพิ่มในหน้าสินค้านี้ แต่ละชิ้นคิดราคาปกติของตัวเอง (ส่วนลดของสินค้านั้นยังใช้ได้) ใช้ได้เฉพาะสินค้าที่ไม่มีตัวเลือก สินค้าที่ปิดขายหรือหมดจะไม่แสดง"
        >
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="size-4 accent-brand-strong" />
            เปิดใช้ Add-on สำหรับสินค้านี้
          </label>
          <div className={cn(!enabled && "opacity-60")}>
            <ProductPicker
              ids={ids}
              onChange={setIds}
              candidates={candidates}
              max={MAX_ADDONS}
              emptyText="ยังไม่ได้เลือกสินค้า Add-on"
              searchLabel="ค้นหาสินค้าเพื่อเพิ่มเป็น Add-on"
              notFound="ไม่พบสินค้า (สินค้าที่มีตัวเลือกใช้เป็น Add-on ไม่ได้)"
              sortable
            />
          </div>
        </FormSection>
      )}
    </div>
  );
}

/** Chosen products (optionally reorderable) plus a name search to add more. */
function ProductPicker({
  ids,
  onChange,
  candidates,
  max,
  emptyText,
  searchLabel,
  notFound = "ไม่พบสินค้า",
  sortable,
}: {
  ids: string[];
  onChange: (next: string[]) => void;
  candidates: AddonCandidate[];
  max: number;
  emptyText: string;
  searchLabel: string;
  notFound?: string;
  sortable: boolean;
}) {
  const [query, setQuery] = useState("");
  const byId = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);
  const q = query.trim().toLowerCase();
  const results = q ? candidates.filter((c) => !ids.includes(c.id) && c.name.toLowerCase().includes(q)).slice(0, RESULTS) : [];
  const move = (i: number, d: -1 | 1) => {
    const next = [...ids];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-4">
      {ids.length === 0 ? (
        <p className="rounded-xl bg-muted px-4 py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ol className="divide-y rounded-xl border">
          {ids.map((id, i) => {
            const c = byId.get(id);
            return (
              <li key={id} className="flex items-center gap-3 px-3 py-2">
                <Thumb url={c?.imageUrl ?? null} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{c?.name ?? "(สินค้าถูกลบ)"}</span>
                  {c && (
                    <span className="block text-xs text-muted-foreground">
                      {formatTHB(c.price)}
                      {c.status !== "ACTIVE" && " · ไม่ได้เปิดขาย (ลูกค้าไม่เห็น)"}
                    </span>
                  )}
                </span>
                {sortable && (
                  <>
                    <button type="button" className={iconButton} disabled={i === 0} aria-label="เลื่อนขึ้น" onClick={() => move(i, -1)}>
                      <ArrowUp className="size-4" aria-hidden />
                    </button>
                    <button type="button" className={iconButton} disabled={i === ids.length - 1} aria-label="เลื่อนลง" onClick={() => move(i, 1)}>
                      <ArrowDown className="size-4" aria-hidden />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className={cn(iconButton, "hover:text-destructive")}
                  aria-label={`เอา ${c?.name ?? ""} ออก`}
                  onClick={() => onChange(ids.filter((x) => x !== id))}
                >
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            );
          })}
        </ol>
      )}

      <div className="space-y-2">
        <label className="relative block">
          <span className="sr-only">{searchLabel}</span>
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={ids.length >= max ? `เลือกได้สูงสุด ${max} รายการ` : "ค้นหาชื่อสินค้าเพื่อเพิ่ม"}
            disabled={ids.length >= max}
            className="h-10 rounded-xl pl-9"
          />
        </label>
        {results.length > 0 && (
          <ul className="max-h-72 divide-y overflow-y-auto rounded-xl border">
            {results.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted"
                  onClick={() => {
                    if (ids.length < max) onChange([...ids, c.id]);
                    setQuery("");
                  }}
                >
                  <Thumb url={c.imageUrl} />
                  <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{formatTHB(c.price)}</span>
                  <Plus className="size-4 text-muted-foreground" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        {q && results.length === 0 && <p className="text-xs text-muted-foreground">{notFound}</p>}
      </div>
    </div>
  );
}

function Thumb({ url }: { url: string | null }) {
  return (
    <span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">
      {url ? <PreviewImage src={url} alt="" fill sizes="40px" className="object-cover" /> : <ImageOff className="size-4 text-muted-foreground" aria-hidden />}
    </span>
  );
}
