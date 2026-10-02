"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, EyeOff, FilePen, Loader2, MoreHorizontal, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { runWithToast } from "@/components/admin/form-controls";
import { useSaveShortcut, useUnsavedWarning } from "@/components/admin/save-bar";
import { deleteProduct, setPublishStatus } from "@/lib/products/admin-actions";
import type { PublishStatus } from "@/lib/generated/prisma/enums";

/**
 * What every section's save gets. `productId` is null until the details section has created
 * the product; options created in this save map their temporary ids to real ones.
 */
export type SaveContext = { productId: string | null; variantIds: Map<string, string> };

/** Resolves an option id that may still be a temporary one from this editing session. */
export function resolveVariantId(ctx: SaveContext, id: string | null): string | null {
  return id === null ? null : (ctx.variantIds.get(id) ?? id);
}

/** Prefix of option ids that exist only in the editor until saved. */
export const NEW_ID = "new:";
export const newId = () => `${NEW_ID}${crypto.randomUUID()}`;

type Section = {
  /** Lower runs first: details → options → pictures → files → license. */
  order: number;
  tab: string;
  label: string;
  /** Must run even without changes (the details section of a new product). */
  required?: boolean;
  /** Returns false when it failed; the section shows or toasts its own errors. */
  save: (ctx: SaveContext) => Promise<boolean>;
};

/** An option as the files tab sees it; `id` may be a temporary NEW_ID one. */
export type EditorVariant = { id: string; name: string };

type Registry = {
  register: (id: string, section: Section) => () => void;
  setDirty: (id: string, dirty: boolean) => void;
  saving: boolean;
  variants: EditorVariant[];
  setVariants: (variants: EditorVariant[]) => void;
};

const EditorContext = createContext<Registry | null>(null);

/**
 * Registers a section's save with the editor's single save button. `save` may change every
 * render; the latest one is used.
 */
export function useEditorSection(id: string, section: Section, dirty: boolean) {
  const editor = useContext(EditorContext);
  if (!editor) throw new Error("useEditorSection must be used inside ProductEditor");
  const latest = useRef(section);
  useEffect(() => {
    latest.current = section;
  });
  const { register, setDirty } = editor;
  useEffect(
    () =>
      register(id, {
        order: latest.current.order,
        tab: latest.current.tab,
        label: latest.current.label,
        required: latest.current.required,
        save: (ctx) => latest.current.save(ctx),
      }),
    [id, register],
  );
  useEffect(() => setDirty(id, dirty), [id, dirty, setDirty]);
  return { saving: editor.saving };
}

/** The options currently in the editor (including unsaved ones), and a way to publish them. */
export function useEditorVariants() {
  const editor = useContext(EditorContext);
  if (!editor) throw new Error("useEditorVariants must be used inside ProductEditor");
  return { variants: editor.variants, setVariants: editor.setVariants };
}

export type EditorTab = { value: string; label: string; content: ReactNode };

type Props = {
  /** null for a new product. */
  productId: string | null;
  publishStatus: PublishStatus | null;
  title: ReactNode;
  summary?: ReactNode;
  tabs: EditorTab[];
  /** Products with orders cannot be deleted (only hidden). */
  hasOrders?: boolean;
  /** Saved options, for the files tab until the options tab reports its own list. */
  variants?: EditorVariant[];
};

type Target = "PUBLISHED" | "DRAFT" | "KEEP";

/**
 * Product editor in the style of VGen: one save button at the top saves every tab at once,
 * then returns to the product list. "บันทึกและเผยแพร่" publishes, "บันทึกเป็นฉบับร่าง" keeps
 * it hidden as a draft. Tabs stay mounted so switching never loses unsaved edits.
 */
export function ProductEditor({ productId, publishStatus, title, summary, tabs, hasOrders = false, variants: savedVariants = [] }: Props) {
  const router = useRouter();
  const [variants, setVariants] = useState(savedVariants);
  const sections = useRef(new Map<string, Section>());
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState(tabs[0]?.value ?? "");
  const [saving, setSaving] = useState<string | null>(null);
  // Set once the product exists, so a retry after a partial save updates instead of creating again.
  const createdId = useRef<string | null>(productId);
  const rootRef = useRef<HTMLDivElement>(null);

  const register = useCallback((id: string, section: Section) => {
    sections.current.set(id, section);
    return () => {
      sections.current.delete(id);
      setDirtyIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    };
  }, []);
  const setDirty = useCallback((id: string, dirty: boolean) => {
    setDirtyIds((prev) => {
      if (prev.has(id) === dirty) return prev;
      const next = new Set(prev);
      if (dirty) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const dirty = dirtyIds.size > 0;
  useUnsavedWarning(dirty && saving === null);

  async function save(target: Target) {
    if (saving) return;
    const ctx: SaveContext = { productId: createdId.current, variantIds: new Map() };
    const ordered = [...sections.current.entries()].sort(([, a], [, b]) => a.order - b.order);
    try {
      for (const [id, section] of ordered) {
        const needed = dirtyIds.has(id) || (section.required && ctx.productId === null);
        if (!needed) continue;
        setSaving(`กำลังบันทึก${section.label}`);
        const ok = await section.save(ctx);
        createdId.current = ctx.productId;
        if (!ok) {
          setTab(section.tab);
          return;
        }
      }
      const id = ctx.productId;
      if (!id) return;
      const status = target === "KEEP" ? null : target;
      if (status && status !== publishStatus) {
        setSaving(status === "PUBLISHED" ? "กำลังเผยแพร่" : "กำลังบันทึกเป็นฉบับร่าง");
        if (!(await runWithToast(() => setPublishStatus(id, status)))) return;
      }
      if (target === "KEEP") {
        // Ctrl+S: stay here. A new product moves to its own edit page.
        if (!productId) router.replace(`/admin/products/${id}`);
        router.refresh();
        return;
      }
      router.push("/admin/products");
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error("บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSaving(null);
    }
  }

  useSaveShortcut(() => void save("KEEP"), saving === null, rootRef);
  const busy = saving !== null;

  return (
    <EditorContext.Provider value={{ register, setDirty, saving: busy, variants, setVariants }}>
      <div ref={rootRef} className="mx-auto max-w-5xl space-y-6">
        <div className="sticky top-0 z-30 -mx-4 border-b bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="ghost" size="icon" className="rounded-full" aria-label="กลับไปที่สินค้าทั้งหมด">
              <Link href="/admin/products">
                <ChevronLeft aria-hidden />
              </Link>
            </Button>
            <div className="min-w-0 flex-1">{title}</div>
            <div className="flex flex-wrap items-center gap-2">
              {busy ? (
                <span className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> {saving}
                </span>
              ) : (
                dirty && <span className="hidden text-sm text-warning sm:inline">มีการแก้ไขที่ยังไม่บันทึก</span>
              )}
              <Button variant="outline" className="h-10 rounded-full px-4" disabled={busy} onClick={() => void save("DRAFT")}>
                <FilePen aria-hidden /> บันทึกเป็นฉบับร่าง
              </Button>
              <Button className="h-10 rounded-full px-5" disabled={busy} onClick={() => void save("PUBLISHED")}>
                <Send aria-hidden /> บันทึกและเผยแพร่
              </Button>
              {productId && <MoreMenu productId={productId} publishStatus={publishStatus} hasOrders={hasOrders} disabled={busy} />}
            </div>
          </div>
          {summary && <div className="mt-2 pl-12">{summary}</div>}
        </div>

        <Tabs value={tab} onValueChange={setTab} className="gap-4">
          <TabsList className="flex-wrap">
            {tabs.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {/* forceMount + hidden keeps unsaved edits when switching tabs. */}
          {tabs.map((t) => (
            <TabsContent key={t.value} value={t.value} forceMount className="space-y-6 data-[state=inactive]:hidden">
              {t.content}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </EditorContext.Provider>
  );
}

/** Rare actions: hide from the shop, back to draft, delete. */
function MoreMenu({
  productId,
  publishStatus,
  hasOrders,
  disabled,
}: {
  productId: string;
  publishStatus: PublishStatus | null;
  hasOrders: boolean;
  disabled: boolean;
}) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const hide = async () => {
    if (await runWithToast(() => setPublishStatus(productId, "DISABLED"))) router.refresh();
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full" aria-label="ตัวเลือกเพิ่มเติม" disabled={disabled}>
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {publishStatus !== "DISABLED" && (
            <DropdownMenuItem onSelect={() => void hide()}>
              <EyeOff aria-hidden /> ซ่อนสินค้า
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={hasOrders}
            className="text-destructive focus:text-destructive"
            onSelect={() => setConfirmDelete(true)}
          >
            <Trash2 aria-hidden /> {hasOrders ? "ลบไม่ได้ (มีคำสั่งซื้อแล้ว)" : "ลบสินค้า"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="ลบสินค้าถาวร?"
        description="ข้อมูล รูปภาพ เวอร์ชัน และไฟล์ทั้งหมดจะถูกลบ และกู้คืนไม่ได้"
        confirmLabel="ลบถาวร"
        destructive
        onConfirm={() => runWithToast(() => deleteProduct(productId))}
      />
    </>
  );
}
