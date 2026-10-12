"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FolderOpen, ImageOff, Inbox, Layers, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { PreviewImage } from "@/components/shared/preview-image";
import { FormSection } from "@/components/admin/form-controls";
import { useEditorSection } from "@/components/admin/product-editor";
import { saveProductAddons } from "@/lib/addons/actions";
import { MAX_ADDON_MAINS } from "@/lib/addons/rules";
import type { AddonCandidate } from "@/lib/addons/queries";
import { formatTHB } from "@/lib/pricing/calculate";
import { cn } from "@/lib/utils";

type Props = {
  addonOnly: boolean;
  hasVariants: boolean;
  offered: { id: string; name: string }[];
  mainIds: string[];
  mainCandidates: AddonCandidate[];
  folders: { id: string; nameTH: string }[];
};

/**
 * The product's add-on tab, saved with the editor's save button. Add-ons are set up from the
 * add-on's side only: tick "add-on only" and pick the main products that sell it. A main product
 * just shows (read-only) the add-ons that picked it.
 */
export function AddonEditor({ addonOnly: savedAddonOnly, hasVariants, offered, mainIds: savedMainIds, mainCandidates, folders }: Props) {
  const [addonOnly, setAddonOnly] = useState(savedAddonOnly);
  const [mainIds, setMainIds] = useState(savedMainIds);
  const snapshot = (v: { addonOnly: boolean; mainIds: string[] }) => JSON.stringify({ addonOnly: v.addonOnly, mainIds: [...v.mainIds].sort() });
  const [saved, setSaved] = useState(() => snapshot({ addonOnly: savedAddonOnly, mainIds: savedMainIds }));
  const current = snapshot({ addonOnly, mainIds });
  const dirty = current !== saved;

  useEditorSection(
    "addons",
    {
      order: 60,
      tab: "addons",
      label: "Add-on",
      save: async (ctx) => {
        if (!ctx.productId) return false;
        const result = await saveProductAddons(ctx.productId, { addonOnly, mainIds });
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
        description="สินค้านี้จะยังแสดงในหน้าร้าน (มีป้าย Add-on) แต่ซื้อแยกไม่ได้ ลูกค้าต้องซื้อคู่กับสินค้าหลักที่เลือก หรือมีสินค้าหลักนั้นอยู่แล้ว และจะแสดงเป็นตัวเลือกให้ติ๊กเพิ่มในหน้าสินค้าหลัก"
      >
        <label className={cn("flex items-center gap-2 text-sm font-medium", hasVariants && !addonOnly ? "opacity-60" : "cursor-pointer")}>
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
        {!addonOnly && savedAddonOnly && (
          <p className="text-xs text-destructive">เมื่อบันทึก สินค้านี้จะถูกเอาออกจาก Add-on ของสินค้าหลักทั้ง {savedMainIds.length} รายการ</p>
        )}

        {addonOnly && <MainPicker ids={mainIds} onChange={setMainIds} candidates={mainCandidates} folders={folders} />}
      </FormSection>

      {!addonOnly && offered.length > 0 && (
        <FormSection title="Add-on ของสินค้านี้" description="สินค้า Add-on ที่เลือกขายคู่กับสินค้านี้ แก้ได้ที่หน้าของสินค้า Add-on นั้น">
          <ul className="divide-y rounded-xl border">
            {offered.map((a) => (
              <li key={a.id}>
                <Link href={`/admin/products/${a.id}`} className="block truncate px-3 py-2 text-sm hover:bg-muted">
                  {a.name}
                </Link>
              </li>
            ))}
          </ul>
        </FormSection>
      )}
    </div>
  );
}

const ALL = "all";
const NONE = "none";

/** Main products by folder (like the product list), ticked on/off; the chosen ones stay listed above. */
function MainPicker({
  ids,
  onChange,
  candidates,
  folders,
}: {
  ids: string[];
  onChange: (next: string[]) => void;
  candidates: AddonCandidate[];
  folders: Props["folders"];
}) {
  const [folder, setFolder] = useState<string>(ALL);
  const [query, setQuery] = useState("");
  const byId = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);
  const chosen = new Set(ids);
  const full = ids.length >= MAX_ADDON_MAINS;

  const counts = useMemo(() => {
    const m = new Map<string | null, number>();
    for (const c of candidates) m.set(c.folderId, (m.get(c.folderId) ?? 0) + 1);
    return m;
  }, [candidates]);
  const folderTabs = [
    { key: ALL, label: "สินค้าทั้งหมด", count: candidates.length, icon: Layers },
    ...folders.filter((f) => counts.has(f.id)).map((f) => ({ key: f.id, label: f.nameTH, count: counts.get(f.id) ?? 0, icon: FolderOpen })),
    ...(counts.has(null) ? [{ key: NONE, label: "ไม่มีโฟลเดอร์", count: counts.get(null) ?? 0, icon: Inbox }] : []),
  ];

  const q = query.trim().toLowerCase();
  const visible = candidates.filter(
    (c) =>
      (folder === ALL || (folder === NONE ? c.folderId === null : c.folderId === folder)) && (!q || c.name.toLowerCase().includes(q)),
  );
  const allVisibleChosen = visible.length > 0 && visible.every((c) => chosen.has(c.id));

  const toggle = (id: string) => {
    if (chosen.has(id)) onChange(ids.filter((x) => x !== id));
    else if (!full) onChange([...ids, id]);
  };
  const toggleVisible = () => {
    if (allVisibleChosen) {
      const drop = new Set(visible.map((c) => c.id));
      onChange(ids.filter((x) => !drop.has(x)));
    } else {
      const add = visible.filter((c) => !chosen.has(c.id)).map((c) => c.id);
      onChange([...ids, ...add].slice(0, MAX_ADDON_MAINS));
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium">
          ขายคู่กับสินค้าหลัก <span className="text-muted-foreground">({ids.length}/{MAX_ADDON_MAINS})</span>
        </p>
        {ids.length === 0 ? (
          <p className="rounded-xl bg-muted px-4 py-4 text-center text-sm text-muted-foreground">ยังไม่ได้เลือกสินค้าหลัก ลูกค้าจะซื้อ Add-on นี้ไม่ได้</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {ids.map((id) => (
              <li key={id} className="flex max-w-full items-center gap-1 rounded-full border bg-card py-0.5 pr-1 pl-3 text-xs">
                <span className="truncate">{byId.get(id)?.name ?? "(สินค้าถูกลบ)"}</span>
                <button
                  type="button"
                  aria-label={`เอา ${byId.get(id)?.name ?? ""} ออก`}
                  onClick={() => onChange(ids.filter((x) => x !== id))}
                  className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-destructive"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-3 rounded-xl border p-2 sm:grid-cols-[11rem_minmax(0,1fr)]">
        <nav aria-label="โฟลเดอร์" className="flex gap-1 overflow-x-auto pb-1 sm:max-h-96 sm:flex-col sm:overflow-y-auto sm:pb-0">
          {folderTabs.map(({ key, label, count, icon: Icon }) => (
            <button
              key={key}
              type="button"
              aria-pressed={folder === key}
              onClick={() => setFolder(key)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm",
                folder === key ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="max-w-40 min-w-0 truncate sm:flex-1">{label}</span>
              <span className="text-xs tabular-nums">{count}</span>
            </button>
          ))}
        </nav>

        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <label className="relative block flex-1">
              <span className="sr-only">ค้นหาสินค้าหลัก</span>
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาชื่อสินค้า" className="h-9 rounded-xl pl-9" />
            </label>
            {visible.length > 0 && (
              <button
                type="button"
                onClick={toggleVisible}
                disabled={!allVisibleChosen && full}
                className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
              >
                {allVisibleChosen ? "ไม่เลือกทั้งหมด" : "เลือกทั้งหมด"}
              </button>
            )}
          </div>
          {visible.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">ไม่พบสินค้า</p>
          ) : (
            <ul className="max-h-96 divide-y overflow-y-auto rounded-lg border">
              {visible.map((c) => {
                const on = chosen.has(c.id);
                return (
                  <li key={c.id}>
                    <label className={cn("flex items-center gap-3 px-3 py-2", !on && full ? "opacity-50" : "cursor-pointer hover:bg-muted/60")}>
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!on && full}
                        onChange={() => toggle(c.id)}
                        className="size-4 shrink-0 accent-brand-strong"
                      />
                      <Thumb url={c.imageUrl} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{c.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {formatTHB(c.price)}
                          {c.status !== "ACTIVE" && " · ไม่ได้เปิดขาย"}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">สินค้าหลักที่เลือกจะเปิดช่อง Add-on ให้อัตโนมัติ และ Add-on นี้จะต่อท้ายรายการของสินค้าหลักนั้น</p>
    </div>
  );
}

function Thumb({ url }: { url: string | null }) {
  return (
    <span className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">
      {url ? <PreviewImage src={url} alt="" fill sizes="36px" className="object-cover" /> : <ImageOff className="size-4 text-muted-foreground" aria-hidden />}
    </span>
  );
}
