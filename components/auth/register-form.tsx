"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { register } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/auth/form-state";
import { FormMessage, PasswordField, TextField } from "./form-fields";
import { SubmitButton } from "./submit-button";
import { VerifyEmailPanel } from "./verify-email-panel";

export function RegisterForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [state, action, pending] = useActionState(register, initialFormState);

  if (state.status === "success") return <VerifyEmailPanel email={state.email} />;

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {state.error && <FormMessage tone="error">{t(`errors.${state.error}`)}</FormMessage>}

      <TextField
        label={t("fields.displayName")}
        name="displayName"
        autoComplete="nickname"
        maxLength={50}
        error={state.fieldErrors?.displayName}
      />
      <TextField
        label={t("fields.email")}
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.email}
        error={state.fieldErrors?.email}
      />
      <PasswordField
        label={t("fields.password")}
        name="password"
        autoComplete="new-password"
        required
        minLength={8}
        hint={t("register.passwordHint")}
        error={state.fieldErrors?.password}
      />
      <SubmitButton pending={pending}>{t("register.submit")}</SubmitButton>
    </form>
  );
}
