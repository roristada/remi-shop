"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { requestOwnPasswordReset } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/auth/form-state";
import { FormMessage } from "@/components/auth/form-fields";
import { SubmitButton } from "@/components/auth/submit-button";

export function ChangePasswordForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [state, action, pending] = useActionState(requestOwnPasswordReset, initialFormState);

  return (
    <form action={action} className="max-w-md space-y-3">
      <input type="hidden" name="locale" value={locale} />
      {state.status === "success" && <FormMessage tone="success">{t("forgot.sent")}</FormMessage>}
      {state.error && <FormMessage tone="error">{t(`errors.${state.error}`)}</FormMessage>}
      <SubmitButton pending={pending} variant="secondary" className="w-auto px-6">
        {t("forgot.submit")}
      </SubmitButton>
    </form>
  );
}
