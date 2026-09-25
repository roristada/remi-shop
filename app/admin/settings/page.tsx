import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import { previewImageUrl } from "@/lib/storage/public-url";
import { PaymentSettingsForm } from "@/components/admin/payment-settings-form";

export default async function AdminSettingsPage() {
  await requireAdmin();
  const s = await prisma.paymentSetting.findUnique({ where: { id: 1 } });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl">ตั้งค่า</h1>
        <p className="text-sm text-muted-foreground">ช่องทางชำระเงินที่ลูกค้าเห็นหลังสั่งซื้อ</p>
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
    </div>
  );
}
