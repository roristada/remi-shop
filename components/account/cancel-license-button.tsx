"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { useRouter } from "@/i18n/navigation";
import { cancelLicenseRequest } from "@/lib/licenses/customer-actions";

export function CancelLicenseButton({ requestId }: { requestId: string }) {
  const t = useTranslations("account.licenses");
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" className="h-11 rounded-full px-4 text-muted-foreground">
          {t("cancel")}
        </Button>
      }
      title={t("cancelTitle")}
      description={t("cancelBody")}
      confirmLabel={t("cancelConfirm")}
      cancelLabel={t("keep")}
      destructive
      onConfirm={async () => {
        const { ok } = await cancelLicenseRequest(requestId);
        if (ok) toast.success(t("cancelled"));
        else toast.error(t("cancelFailed"));
        router.refresh();
      }}
    />
  );
}
