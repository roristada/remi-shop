import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import { previewImageUrl } from "@/lib/storage/public-url";
import { PaymentSettingsForm } from "@/components/admin/payment-settings-form";
import { LicenseSettingsForm } from "@/components/admin/license-settings-form";
import { getLicensePaymentDays } from "@/lib/licenses/queries";

export default async function AdminSettingsPage() {
  await requireAdmin();
  const [s, licensePaymentDays] = await Promise.all([
    prisma.paymentSetting.findUnique({ where: { id: 1 } }),
    getLicensePaymentDays(),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl">ตั้งค่า</h1>
        <p className="text-sm text-muted-foreground">ช่องทางชำระเงินและกำหนดเวลาที่ลูกค้าเห็นหลังสั่งซื้อ</p>
      </div>
      <PaymentSettingsForm
        values={{
          promptPayName: s?.promptPayName ?? "",
          promptPayNumber: s?.promptPayNumber ?? "",
          instructionsTH: s?.instructionsTH ?? "",
          instructionsEN: s?.instructionsEN ?? "",
          qrImageUrl: s?.qrImagePath ? previewImageUrl(s.qrImagePath) : null,
        }}
      />
      <LicenseSettingsForm licensePaymentDays={licensePaymentDays} />
    </div>
  );
}
