import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { listAllFormFields, listUsageTypeChoices } from "@/lib/licenses/form-queries";
import { LicenseFormBuilder } from "@/components/admin/license-form-builder";

export default async function AdminLicenseFormPage() {
  await requireAdmin();
  const [fields, usageTypes] = await Promise.all([listAllFormFields(), listUsageTypeChoices()]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/admin/licenses" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> คำขอ License
      </Link>
      <div>
        <h1 className="text-2xl font-bold">แบบฟอร์มคำขอ Commercial license</h1>
        <p className="text-sm text-muted-foreground">
          คลังคำถามกลางที่ลูกค้าตอบตอนขอ License เรียงตามลำดับนี้ ลูกค้าจะเห็นเฉพาะคำถามที่เปิดไว้ในฟอร์มของประเภทที่เลือก ช่องพื้นฐาน (ชื่อผู้ซื้อ ศิลปิน
          ฯลฯ) ถามทุกประเภท ลบไม่ได้แต่ปิดใช้งานได้ เลือกคำถามของแต่ละประเภทและตั้งเงื่อนไขได้ที่{" "}
          <Link href="/admin/licenses/types" className="underline underline-offset-4">
            ประเภทการใช้งาน
          </Link>
        </p>
      </div>
      <LicenseFormBuilder
        fields={fields.map((f) => ({
          ...f,
          descriptionTH: f.descriptionTH ?? "",
          descriptionEN: f.descriptionEN ?? "",
        }))}
        usageTypes={usageTypes}
      />
    </div>
  );
}
