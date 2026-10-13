import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import { previewImageUrl } from "@/lib/storage/public-url";
import { PaymentSettingsForm } from "@/components/admin/payment-settings-form";
import { LicenseSettingsForm } from "@/components/admin/license-settings-form";
import { getLicensePaymentDays } from "@/lib/licenses/queries";
import { ContactChannelsForm } from "@/components/admin/contact-channels-form";

export default async function AdminSettingsPage() {
  await requireAdmin();
  const [s, licensePaymentDays, contacts] = await Promise.all([
    prisma.paymentSetting.findUnique({ where: { id: 1 } }),
    getLicensePaymentDays(),
    prisma.contactChannel.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { type: true, label: true, value: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl">ตั้งค่า</h1>
        <p className="text-sm text-muted-foreground">ช่องทางชำระเงิน กำหนดเวลาที่ลูกค้าเห็นหลังสั่งซื้อ และช่องทางติดต่อร้าน</p>
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
      <ContactChannelsForm channels={contacts} />
    </div>
  );
}
