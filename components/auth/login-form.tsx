"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { login } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/auth/form-state";
import { FormMessage, PasswordField, TextField } from "./form-fields";
import { SubmitButton } from "./submit-button";

export function LoginForm({ next, initialError }: { next?: string; initialError?: string }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [state, action, pending] = useActionState(login, initialFormState);
  const error = state.status === "idle" ? initialError : state.error;

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {next && <input type="hidden" name="next" value={next} />}

      {error && <FormMessage tone="error">{t(`errors.${error}`)}</FormMessage>}
      {error === "email_not_confirmed" && (
        <p className="text-center text-sm">
          <Link href="/verify-email" className="font-medium text-brand-strong hover:underline">
            {t("verify.resend")}
          </Link>
        </p>
      )}

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
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm text-brand-strong hover:underline">
          {t("login.forgot")}
        </Link>
      </div>
      <SubmitButton pending={pending}>{t("login.submit")}</SubmitButton>
    </form>
  );
}
