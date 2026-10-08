"use client";

import { useActionState, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { requestPasswordReset } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/auth/form-state";
import { FormMessage, TextField } from "./form-fields";
import { SubmitButton } from "./submit-button";
import { useCooldown } from "./use-cooldown";

export function ForgotPasswordForm({ initialError }: { initialError?: string }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [state, action, pending] = useActionState(requestPasswordReset, initialFormState);
  const error = state.status === "idle" ? initialError : state.error;
  const cooldown = useCooldown();
  const { start } = cooldown;

  useEffect(() => {
    if (state.status === "success" || state.error === "rate_limited") start();
  }, [state, start]);

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
      <SubmitButton pending={pending} disabled={cooldown.remaining > 0}>
        {cooldown.remaining > 0 ? t("resendIn", { seconds: cooldown.remaining }) : t("forgot.submit")}
      </SubmitButton>
    </form>
  );
}
