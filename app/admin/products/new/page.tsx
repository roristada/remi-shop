import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { listCategoryOptions } from "@/lib/products/admin-queries";
import { createProduct } from "@/lib/products/admin-actions";
import { EMPTY_PRODUCT_VALUES, ProductForm } from "@/components/admin/product-form";

export default async function NewProductPage() {
  await requireAdmin();
  const categories = await listCategoryOptions();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/admin/products" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> สินค้าทั้งหมด
      </Link>
      <div>
        <h1 className="text-2xl font-bold">เพิ่มสินค้า</h1>
        <p className="text-sm text-muted-foreground">
          สินค้าใหม่จะเป็นฉบับร่าง — เพิ่มรูป เวอร์ชัน และไฟล์ได้หลังบันทึก
        </p>
      </div>
      <ProductForm action={createProduct} values={EMPTY_PRODUCT_VALUES} categories={categories} submitLabel="บันทึกและไปต่อ" />
    </div>
  );
}
