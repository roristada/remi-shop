import Link from "next/link";
import { LayoutGrid, List, MonitorCog, Plus, Search } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { listAdminProducts, listCategoryOptions } from "@/lib/products/admin-queries";
import { getProductStatus } from "@/lib/products/status";
import { calculateProductPrice, formatTHB } from "@/lib/pricing/calculate";
import { formatBangkokDateTime } from "@/lib/datetime";
import { previewImageUrl } from "@/lib/storage/public-url";
import { idSchema } from "@/lib/validation/product";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProductList, type AdminProductRow, type ProductListView } from "@/components/admin/product-list";
import { Pagination } from "@/components/shared/pagination";
import { FlashToast } from "@/components/admin/flash-toast";
import { SelectInput } from "@/components/admin/form-controls";
import type { PublishStatus } from "@/lib/generated/prisma/enums";
import { cn } from "@/lib/utils";

const PUBLISH_FILTERS: { value: PublishStatus; label: string }[] = [
  { value: "DRAFT", label: "ฉบับร่าง" },
  { value: "PUBLISHED", label: "เผยแพร่" },
  { value: "DISABLED", label: "ปิดการขาย" },
];

const VIEWS: { value: ProductListView; label: string; icon: typeof List }[] = [
  { value: "list", label: "รายการ", icon: List },
  { value: "grid", label: "การ์ด", icon: LayoutGrid },
];

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

  const [{ items, total, pageCount }, categories] = await Promise.all([
    listAdminProducts({ q, categoryId, publishStatus: status, page }),
    listCategoryOptions(),
  ]);
  const now = new Date();
  const params = { q, category: categoryId, status, view: view === "grid" ? view : undefined };

  const rows: AdminProductRow[] = items.map((p) => {
    const price = calculateProductPrice(p, now);
    return {
      id: p.id,
      nameTH: p.nameTH,
      nameEN: p.nameEN,
      versionNumber: p.versions[0]?.versionNumber ?? null,
      categoryName: p.category.nameTH,
      imageUrl: p.images[0] ? previewImageUrl(p.images[0].imagePath) : null,
      price: formatTHB(price.finalPrice),
      originalPrice: price.isDiscounted ? formatTHB(price.unitPrice) : null,
      status: getProductStatus(p, now),
      publishStatus: p.publishStatus,
      updatedAt: formatBangkokDateTime(p.updatedAt),
      hasOrders: p._count.orderItems > 0,
    };
  });

  const viewHref = (v: ProductListView) => {
    const qs = new URLSearchParams();
    for (const [k, val] of Object.entries({ ...params, view: v === "grid" ? v : undefined })) if (val) qs.set(k, val);
    const str = qs.toString();
    return str ? `/admin/products?${str}` : "/admin/products";
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {one(sp.deleted) && <FlashToast message="ลบสินค้าแล้ว" />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">สินค้า</h1>
          <p className="text-sm text-muted-foreground">ทั้งหมด {total.toLocaleString("th-TH")} รายการ</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" className="h-10 rounded-full px-5">
            <Link href="/admin/products/software-tags">
              <MonitorCog aria-hidden /> จัดการโปรแกรม
            </Link>
          </Button>
          <Button asChild className="h-10 rounded-full px-5">
            <Link href="/admin/products/new">
              <Plus aria-hidden /> เพิ่มสินค้า
            </Link>
          </Button>
        </div>
      </div>

      <form className="flex flex-wrap gap-2 rounded-2xl border bg-card p-3 shadow-soft" role="search">
        {view === "grid" && <input type="hidden" name="view" value="grid" />}
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
            {q || categoryId || status ? "ลองเปลี่ยนตัวกรอง" : "เริ่มจากเพิ่มสินค้าชิ้นแรก"}
          </p>
        </div>
      ) : (
        <ProductList rows={rows} view={view} />
      )}

      <Pagination page={page} pageCount={pageCount} params={params} basePath="/admin/products" />
    </div>
  );
}
