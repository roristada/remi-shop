import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { idSchema } from "@/lib/validation/product";
import { getUsageTypeForForm, listUsageTypeFormFields } from "@/lib/licenses/form-queries";
import { LicenseFormBuilder } from "@/components/admin/license-form-builder";
import { Badge } from "@/components/ui/badge";

export default async function AdminUsageTypeFormPage({ params }: PageProps<"/admin/licenses/types/[id]/form">) {
  await requireAdmin();
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const [usageType, fields] = await Promise.all([
    getUsageTypeForForm(id),
    listUsageTypeFormFields(id),
  ]);
  if (!usageType) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/admin/licenses/types" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> ประเภทการใช้งาน
      </Link>
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">ฟอร์มคำขอ: {usageType.nameTH}</h1>
          {!usageType.isActive && <Badge className="bg-muted text-muted-foreground">ประเภทนี้ปิดใช้งาน</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          คำถามที่ลูกค้าตอบเมื่อขอ License ประเภท “{usageType.nameTH}” แก้ที่นี่มีผลกับฟอร์มนี้เท่านั้น ฟอร์มของประเภทอื่นไม่เปลี่ยน ช่องพื้นฐาน (ชื่อผู้ซื้อ
          ศิลปิน ฯลฯ) ลบไม่ได้แต่ปิดใช้งานได้
        </p>
      </div>
      <LicenseFormBuilder
        usageTypeId={usageType.id}
        fields={fields.map((f) => ({
          ...f,
          descriptionTH: f.descriptionTH ?? "",
          descriptionEN: f.descriptionEN ?? "",
        }))}
      />
    </div>
  );
}
