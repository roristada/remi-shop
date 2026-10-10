"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ImageOff, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { PreviewImage } from "@/components/shared/preview-image";
import { FormSection } from "@/components/admin/form-controls";
import { useEditorSection } from "@/components/admin/product-editor";
import { saveProductAddons } from "@/lib/addons/actions";
import { MAX_ADDONS } from "@/lib/addons/rules";
import type { AddonCandidate } from "@/lib/addons/queries";
import { formatTHB } from "@/lib/pricing/calculate";
import { cn } from "@/lib/utils";

const iconButton =
  "grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30";
const RESULTS = 20;

/** The product's add-on list and on/off switch. Saved with the editor's save button. */
export function AddonEditor({ enabled: savedEnabled, selectedIds, candidates }: { enabled: boolean; selectedIds: string[]; candidates: AddonCandidate[] }) {
  const [enabled, setEnabled] = useState(savedEnabled);
  const [ids, setIds] = useState(selectedIds);
  const [saved, setSaved] = useState(() => JSON.stringify({ enabled: savedEnabled, ids: selectedIds }));
  const [query, setQuery] = useState("");
  const byId = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);
  const dirty = JSON.stringify({ enabled, ids }) !== saved;

  useEditorSection(
    "addons",
    {
      order: 60,
      tab: "addons",
      label: "Add-on",
      save: async (ctx) => {
        if (!ctx.productId) return false;
        const result = await saveProductAddons(ctx.productId, { enabled, addonIds: ids });
        if (!result.ok) {
          toast.error(`Add-on: ${result.error}`);
          return false;
        }
        setSaved(JSON.stringify({ enabled, ids }));
        return true;
      },
    },
    dirty,
  );

  const q = query.trim().toLowerCase();
  const results = q ? candidates.filter((c) => !ids.includes(c.id) && c.name.toLowerCase().includes(q)).slice(0, RESULTS) : [];
  const move = (i: number, d: -1 | 1) =>
    setIds((s) => {
      const next = [...s];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });

  return (
    <FormSection
      title="Add-on (ซื้อเพิ่มคู่กัน)"
      description="สินค้าที่แสดงให้ลูกค้าติ๊กเพิ่มในหน้าสินค้านี้ แต่ละชิ้นคิดราคาปกติของตัวเอง (ส่วนลดของสินค้านั้นยังใช้ได้) ใช้ได้เฉพาะสินค้าที่ไม่มีตัวเลือก สินค้าที่ปิดขายหรือหมดจะไม่แสดง"
    >
      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="size-4 accent-brand-strong" />
        เปิดใช้ Add-on สำหรับสินค้านี้
      </label>

      <div className={cn("space-y-4", !enabled && "opacity-60")}>
        {ids.length === 0 ? (
          <p className="rounded-xl bg-muted px-4 py-6 text-center text-sm text-muted-foreground">ยังไม่ได้เลือกสินค้า Add-on</p>
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
                  <button type="button" className={iconButton} disabled={i === 0} aria-label="เลื่อนขึ้น" onClick={() => move(i, -1)}>
                    <ArrowUp className="size-4" aria-hidden />
                  </button>
                  <button type="button" className={iconButton} disabled={i === ids.length - 1} aria-label="เลื่อนลง" onClick={() => move(i, 1)}>
                    <ArrowDown className="size-4" aria-hidden />
                  </button>
                  <button type="button" className={cn(iconButton, "hover:text-destructive")} aria-label={`เอา ${c?.name ?? ""} ออก`} onClick={() => setIds((s) => s.filter((x) => x !== id))}>
                    <X className="size-4" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        <div className="space-y-2">
          <label className="relative block">
            <span className="sr-only">ค้นหาสินค้าเพื่อเพิ่มเป็น Add-on</span>
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={ids.length >= MAX_ADDONS ? `เลือกได้สูงสุด ${MAX_ADDONS} รายการ` : "ค้นหาชื่อสินค้าเพื่อเพิ่ม"}
              disabled={ids.length >= MAX_ADDONS}
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
                      setIds((s) => (s.length >= MAX_ADDONS ? s : [...s, c.id]));
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
          {q && results.length === 0 && <p className="text-xs text-muted-foreground">ไม่พบสินค้า (สินค้าที่มีตัวเลือกใช้เป็น Add-on ไม่ได้)</p>}
        </div>
      </div>
    </FormSection>
  );
}

function Thumb({ url }: { url: string | null }) {
  return (
    <span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">
      {url ? <PreviewImage src={url} alt="" fill sizes="40px" className="object-cover" /> : <ImageOff className="size-4 text-muted-foreground" aria-hidden />}
    </span>
  );
}
