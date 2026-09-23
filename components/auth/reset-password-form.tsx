"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { updatePassword } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/auth/form-state";
import { FormMessage, PasswordField } from "./form-fields";
import { SubmitButton } from "./submit-button";

export function ResetPasswordForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [state, action, pending] = useActionState(updatePassword, initialFormState);

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {state.error && <FormMessage tone="error">{t(`errors.${state.error}`)}</FormMessage>}
      <PasswordField
        label={t("fields.newPassword")}
        name="password"
        autoComplete="new-password"
        required
        minLength={8}
        hint={t("register.passwordHint")}
        error={state.fieldErrors?.password}
      />
      <PasswordField
        label={t("fields.confirmPassword")}
        name="confirmPassword"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirmPassword}
      />
      <SubmitButton pending={pending}>{t("reset.submit")}</SubmitButton>
    </form>
  );
}
