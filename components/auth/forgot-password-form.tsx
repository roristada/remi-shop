"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { requestPasswordReset } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/auth/form-state";
import { FormMessage, TextField } from "./form-fields";
import { SubmitButton } from "./submit-button";

export function ForgotPasswordForm({ initialError }: { initialError?: string }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [state, action, pending] = useActionState(requestPasswordReset, initialFormState);
  const error = state.status === "idle" ? initialError : state.error;

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {state.status === "success" && <FormMessage tone="success">{t("forgot.sent")}</FormMessage>}
      {error && <FormMessage tone="error">{t(`errors.${error}`)}</FormMessage>}
      <TextField
        label={t("fields.email")}
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.email}
        error={state.fieldErrors?.email}
      />
      <SubmitButton pending={pending}>{t("forgot.submit")}</SubmitButton>
    </form>
  );
}
