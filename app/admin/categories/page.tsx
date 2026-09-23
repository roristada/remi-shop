import { requireAdmin } from "@/lib/auth/guards";
import { listAdminCategories } from "@/lib/products/admin-queries";
import { CategoryManager } from "@/components/admin/category-manager";

export default async function AdminCategoriesPage() {
  await requireAdmin();
  const categories = await listAdminCategories();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">หมวดหมู่</h1>
        <p className="text-sm text-muted-foreground">หมวดหมู่ที่มีสินค้าลบไม่ได้ — ใช้ “ซ่อน” แทน</p>
      </div>
      <CategoryManager
        categories={categories.map((c) => ({
          id: c.id,
          slug: c.slug,
          nameTH: c.nameTH,
          nameEN: c.nameEN,
          descriptionTH: c.descriptionTH ?? "",
          descriptionEN: c.descriptionEN ?? "",
          status: c.status,
          sortOrder: c.sortOrder,
          productCount: c._count.products,
        }))}
      />
    </div>
  );
}
