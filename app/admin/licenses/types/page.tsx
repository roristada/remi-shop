import Link from "next/link";
import { ChevronLeft, Copy, ListChecks } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { listUsageTypes } from "@/lib/licenses/admin-queries";
import { UsageTypeManager } from "@/components/admin/usage-type-manager";

export default async function AdminUsageTypesPage() {
  await requireAdmin();
  const types = await listUsageTypes();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/admin/licenses" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> คำขอ License
      </Link>
      <div>
        <h1 className="text-2xl font-bold">ประเภทการใช้งาน</h1>
        <p className="text-sm text-muted-foreground">
          รายการกลางที่ใช้กับทุกสินค้า ตั้งราคาแต่ละประเภทได้ในหน้าแก้ไขสินค้า แท็บ “License” ประเภทที่เคยถูกขอแล้วลบไม่ได้ ใช้
          “ปิดใช้งาน” แทน แต่ละประเภทมีฟอร์มคำขอของตัวเอง กดปุ่ม <ListChecks className="inline size-3.5 align-[-2px]" aria-label="แก้ไขฟอร์ม" /> เพื่อแก้ฟอร์ม
          หรือปุ่ม <Copy className="inline size-3.5 align-[-2px]" aria-label="คัดลอก" /> เพื่อคัดลอกประเภทพร้อมฟอร์มไปเป็นประเภทใหม่
        </p>
      </div>
      <UsageTypeManager
        types={types.map((t) => ({
          id: t.id,
          nameTH: t.nameTH,
          nameEN: t.nameEN,
          descriptionTH: t.descriptionTH ?? "",
          descriptionEN: t.descriptionEN ?? "",
          conditionsTH: t.conditionsTH ?? "",
          conditionsEN: t.conditionsEN ?? "",
          isActive: t.isActive,
          sortOrder: t.sortOrder,
          productCount: t._count.prices,
          requestCount: t._count.requestItems,
          fieldCount: t._count.formFields,
        }))}
      />
    </div>
  );
}
