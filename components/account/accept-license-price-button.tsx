"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { useRouter } from "@/i18n/navigation";
import { acceptLicensePrice } from "@/lib/licenses/customer-actions";

export function AcceptLicensePriceButton({ requestId, price }: { requestId: string; price: string }) {
  const t = useTranslations("account.licenses");
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button className="h-11 rounded-full px-5">
          <Check aria-hidden /> {t("acceptPrice")}
        </Button>
      }
      title={t("acceptPriceTitle", { price })}
      description={t("acceptPriceBody")}
      confirmLabel={t("acceptPrice")}
      cancelLabel={t("keep")}
      onConfirm={async () => {
        const { ok } = await acceptLicensePrice(requestId);
        if (ok) toast.success(t("priceAccepted"));
        else toast.error(t("priceAcceptFailed"));
        router.refresh();
      }}
    />
  );
}
