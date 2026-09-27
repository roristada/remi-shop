import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { listAdminSoftwareTags } from "@/lib/software-tags/queries";
import { SoftwareTagManager } from "@/components/admin/software-tag-manager";

export default async function AdminSoftwareTagsPage() {
  await requireAdmin();
  const tags = await listAdminSoftwareTags();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/admin/products" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> สินค้าทั้งหมด
      </Link>
      <div>
        <h1 className="text-2xl font-bold">โปรแกรมที่รองรับ</h1>
        <p className="text-sm text-muted-foreground">
          รายการกลางที่ใช้กับทุกสินค้า และเป็นตัวกรองในหน้าร้าน โปรแกรมที่เคยถูกเลือกใช้แล้วลบไม่ได้ ใช้ “ปิดใช้งาน” แทน
        </p>
      </div>
      <SoftwareTagManager
        tags={tags.map((t) => ({
          id: t.id,
          name: t.name,
          isActive: t.isActive,
          sortOrder: t.sortOrder,
          productCount: t._count.products,
        }))}
      />
    </div>
  );
}
