import Link from "next/link";
import { cookies } from "next/headers";
import { FolderCog, FolderOpen, Inbox, LayoutGrid, Layers, List, MonitorCog, Plus, Search } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { listAdminProducts, listCategoryOptions, listFolderCounts } from "@/lib/products/admin-queries";
import { listSoftwareTagOptions } from "@/lib/software-tags/queries";
import { ADMIN_PRODUCT_SORTS, parseAdminProductSort } from "@/lib/products/admin-sort";
import { getProductStatus } from "@/lib/products/status";
import { calculateProductPrice, formatTHB } from "@/lib/pricing/calculate";
import { formatBangkokDateTime } from "@/lib/datetime";
import { previewImageSrc } from "@/lib/storage/public-url";
import { idSchema } from "@/lib/validation/product";
import { lineHasFiles } from "@/lib/downloads/rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProductList, type AdminProductRow, type ProductListView } from "@/components/admin/product-list";
import { Pagination } from "@/components/shared/pagination";
import { SelectInput } from "@/components/admin/form-controls";
import type { PublishStatus } from "@/lib/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { FOLDER_PANEL_COOKIE } from "@/lib/admin/ui-prefs";
import { FolderPanelToggle } from "@/components/admin/folder-panel-toggle";

const PUBLISH_FILTERS: { value: PublishStatus; label: string }[] = [
  { value: "DRAFT", label: "ฉบับร่าง" },
  { value: "PUBLISHED", label: "เผยแพร่" },
];

const VIEWS: { value: ProductListView; label: string; icon: typeof List }[] = [
  { value: "list", label: "รายการ", icon: List },
  { value: "grid", label: "การ์ด", icon: LayoutGrid },
];

/** File count, and whether any buyable line gets its file by email (same rule as the shop). */
function fileLabel(files: { variantId: string | null }[], activeVariants: { id: string }[]): string {
  const lines = activeVariants.length > 0 ? activeVariants.map((v) => v.id) : [null];
  const emailed = lines.filter((id) => !lineHasFiles(files, id)).length;
  if (files.length === 0) return "ยังไม่มีไฟล์ · ส่งทางอีเมล";
  if (emailed === 0) return `${files.length} ไฟล์`;
  return `${files.length} ไฟล์ · ${emailed} ตัวเลือกส่งทางอีเมล`;
}

function one(v: string | string[] | undefined) {
  return typeof v === "string" ? v : undefined;
}

export default async function AdminProductsPage({ searchParams }: PageProps<"/admin/products">) {
  await requireAdmin();
  const sp = await searchParams;

  // Filters come from the URL — validate before they reach the query.
  const q = one(sp.q)?.trim().slice(0, 100) || undefined;
  const categoryId = idSchema.safeParse(one(sp.category)).success ? one(sp.category) : undefined;
  const status = PUBLISH_FILTERS.find((f) => f.value === one(sp.status))?.value;
  const view: ProductListView = one(sp.view) === "grid" ? "grid" : "list";
  const page = Math.max(1, Math.min(10_000, Number.parseInt(one(sp.page) ?? "1", 10) || 1));
  const sort = parseAdminProductSort(one(sp.sort));
  const folderParam = one(sp.folder);
  const folder = folderParam === "none" || idSchema.safeParse(folderParam).success ? folderParam : undefined;
  const delivery = one(sp.delivery) === "email" ? "email" : undefined;

  const folderPanelCollapsed = (await cookies()).get(FOLDER_PANEL_COOKIE)?.value === "collapsed";

  const [{ items, total, pageCount }, categories, folderCounts, softwareTags] = await Promise.all([
    listAdminProducts({ q, categoryId, publishStatus: status, folder, delivery, sort, page }),
    listCategoryOptions(),
    listFolderCounts(),
    listSoftwareTagOptions(),
  ]);
  const now = new Date();
  const params = {
    q,
    category: categoryId,
    status,
    folder,
    delivery,
    sort: sort === "updated" ? undefined : sort,
    view: view === "grid" ? view : undefined,
  };
  const folderOptions = folderCounts.folders.map((f) => ({ id: f.id, name: f.nameTH }));
  const currentFolder = folderCounts.folders.find((f) => f.id === folder);

  const rows: AdminProductRow[] = items.map((p) => {
    const price = calculateProductPrice(p, now);
    return {
      id: p.id,
      slug: p.slug,
      nameTH: p.nameTH,
      nameEN: p.nameEN,
      fileLabel: fileLabel(p.versions[0]?.files ?? [], p.variants),
      waitlistCount: p._count.waitlist,
      categoryName: p.category.nameTH,
      folderId: p.folder?.id ?? null,
      folderName: p.folder?.nameTH ?? null,
      imageUrl: p.images[0] ? previewImageSrc(p.images[0], "card") : null,
      price: formatTHB(price.finalPrice),
      originalPrice: price.isDiscounted ? formatTHB(price.unitPrice) : null,
      status: getProductStatus(p, now),
      publishStatus: p.publishStatus,
      updatedAt: formatBangkokDateTime(p.updatedAt),
      hasOrders: p._count.orderItems > 0,
      stockLabel:
        p._count.variants > 0
          ? `${p._count.variants} ตัวเลือก`
          : p.stockLimit === null
            ? "∞"
            : `${Math.max(0, p.stockLimit - p.stockTaken)}/${p.stockLimit}`,
      stockTitle:
        p._count.variants > 0
          ? "สต็อกตั้งแยกตามตัวเลือก"
          : p.stockLimit === null
            ? "สต็อกไม่จำกัด"
            : `เหลือ ${Math.max(0, p.stockLimit - p.stockTaken)} จาก ${p.stockLimit} ชิ้น`,
    };
  });

  const hrefWith = (patch: Partial<typeof params>) => {
    const qs = new URLSearchParams();
    for (const [k, val] of Object.entries({ ...params, ...patch })) if (val) qs.set(k, val);
    const str = qs.toString();
    return str ? `/admin/products?${str}` : "/admin/products";
  };
  const viewHref = (v: ProductListView) => hrefWith({ view: v === "grid" ? v : undefined });
  // Changing folder starts from page 1 (page is not part of params).
  const folderLinks = [
    { key: "all", href: hrefWith({ folder: undefined }), label: "สินค้าทั้งหมด", count: null, icon: Layers, active: !folder },
    ...folderCounts.folders.map((f) => ({
      key: f.id,
      href: hrefWith({ folder: f.id }),
      label: f.status === "ARCHIVED" ? `${f.nameTH} (เก็บแล้ว)` : f.nameTH,
      count: f.count,
      icon: FolderOpen,
      active: folder === f.id,
    })),
    { key: "none", href: hrefWith({ folder: "none" }), label: "ไม่มีโฟลเดอร์", count: folderCounts.unfiled, icon: Inbox, active: folder === "none" },
  ];

  return (
    <div
      className={cn(
        "mx-auto grid max-w-7xl gap-6",
        // Collapsed: folders become a chip row above the list, which then gets the full width.
        !folderPanelCollapsed && "lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-5",
      )}
    >
      {/* Folders live beside the products, so filing and checking what is inside is one screen. */}
      <aside className={cn("min-w-0 space-y-1.5", !folderPanelCollapsed && "lg:sticky lg:top-6 lg:self-start")}>
        <div className="flex items-center justify-between gap-1 pl-2">
          <h2 className="text-sm font-semibold">โฟลเดอร์</h2>
          <div className="flex items-center gap-0.5">
            <Link href="/admin/folders" className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground">
              <FolderCog className="size-3.5" aria-hidden /> จัดการ
            </Link>
            <FolderPanelToggle collapsed={folderPanelCollapsed} />
          </div>
        </div>
        <nav
          aria-label="โฟลเดอร์"
          className={cn(
            "flex gap-1 overflow-x-auto pb-1",
            !folderPanelCollapsed && "lg:max-h-[calc(100dvh-8rem)] lg:flex-col lg:overflow-y-auto lg:pb-0",
          )}
        >
          {folderLinks.map(({ key, href, label, count, icon: Icon, active }) => (
            <Link
              key={key}
              href={href}
              aria-current={active ? "page" : undefined}
              title={label}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
                folderPanelCollapsed && "rounded-full border bg-card",
                active && "bg-secondary font-medium text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className={cn("min-w-0 truncate", !folderPanelCollapsed && "lg:flex-1", folderPanelCollapsed && "max-w-48")}>{label}</span>
              {count !== null && <span className="text-xs tabular-nums">{count}</span>}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">
              {currentFolder ? currentFolder.nameTH : folder === "none" ? "สินค้าที่ไม่มีโฟลเดอร์" : "สินค้า"}
            </h1>
            <p className="text-sm text-muted-foreground">ทั้งหมด {total.toLocaleString("th-TH")} รายการ</p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" className="h-10 rounded-full px-5">
              <Link href="/admin/products/software-tags">
                <MonitorCog aria-hidden /> จัดการโปรแกรม
              </Link>
            </Button>
            <Button asChild className="h-10 rounded-full px-5">
              <Link href={folder && folder !== "none" ? `/admin/products/new?folder=${folder}` : "/admin/products/new"}>
                <Plus aria-hidden /> เพิ่มสินค้า
              </Link>
            </Button>
          </div>
        </div>

        <form className="flex flex-wrap gap-2 rounded-2xl border bg-card p-3 shadow-soft" role="search">
          {view === "grid" && <input type="hidden" name="view" value="grid" />}
          {folder && <input type="hidden" name="folder" value={folder} />}
          <label className="relative min-w-48 flex-1">
            <span className="sr-only">ค้นหา</span>
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input name="q" defaultValue={q} placeholder="ค้นหาชื่อหรือ slug" className="h-10 rounded-xl pl-9" />
          </label>
          {/* "all" is a sentinel: it fails the validation above, i.e. "no filter". */}
          <SelectInput
            label="หมวดหมู่"
            hideLabel
            name="category"
            defaultValue={categoryId ?? "all"}
            options={[{ value: "all", label: "ทุกหมวดหมู่" }, ...categories.map((c) => ({ value: c.id, label: c.nameTH }))]}
            wrapperClassName="w-44 space-y-0"
          />
          <SelectInput
            label="สถานะ"
            hideLabel
            name="status"
            defaultValue={status ?? "all"}
            options={[{ value: "all", label: "ทุกสถานะ" }, ...PUBLISH_FILTERS]}
            wrapperClassName="w-36 space-y-0"
          />
          <SelectInput
            label="ไฟล์"
            hideLabel
            name="delivery"
            defaultValue={delivery ?? "all"}
            options={[
              { value: "all", label: "ทุกแบบไฟล์" },
              { value: "email", label: "ยังไม่มีไฟล์ (ส่งทางอีเมล)" },
            ]}
            wrapperClassName="w-52 space-y-0"
          />
          <SelectInput
            label="เรียงตาม"
            hideLabel
            name="sort"
            defaultValue={sort}
            options={ADMIN_PRODUCT_SORTS.map(({ value, label }) => ({ value, label: `เรียง: ${label}` }))}
            wrapperClassName="w-44 space-y-0"
          />
          <Button type="submit" variant="secondary" className="h-10 rounded-xl px-4">
            กรอง
          </Button>
          <nav aria-label="มุมมอง" className="ml-auto flex rounded-xl border p-0.5">
            {VIEWS.map(({ value, label, icon: Icon }) => (
              <Link
                key={value}
                href={viewHref(value)}
                aria-current={view === value ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground",
                  view === value && "bg-secondary font-medium text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden /> {label}
              </Link>
            ))}
          </nav>
        </form>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-card p-12 text-center">
            <p className="font-medium">ไม่พบสินค้า</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {q || categoryId || status || delivery ? "ลองเปลี่ยนตัวกรอง" : "เริ่มจากเพิ่มสินค้าชิ้นแรก"}
            </p>
          </div>
        ) : (
          <ProductList rows={rows} view={view} folders={folderOptions} editOptions={{ categories, softwareTags }} />
        )}

        <Pagination page={page} pageCount={pageCount} params={params} basePath="/admin/products" />
      </div>
    </div>
  );
}
