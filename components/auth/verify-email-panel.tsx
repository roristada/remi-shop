"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { MailCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { resendVerification } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/auth/form-state";
import { FormMessage, TextField } from "./form-fields";
import { SubmitButton } from "./submit-button";

/** "Check your inbox" message with a resend form. Email is prefilled when known. */
export function VerifyEmailPanel({ email }: { email?: string }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [state, action, pending] = useActionState(resendVerification, initialFormState);

  return (
    <div className="space-y-5 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-secondary">
        <MailCheck className="size-6" aria-hidden />
      </span>
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{t("verify.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("verify.body")}</p>
        {email && <p className="text-sm font-medium break-all">{email}</p>}
        <p className="text-xs text-muted-foreground">{t("verify.spam")}</p>
      </div>

      <form action={action} className="space-y-3 text-left" noValidate>
        <input type="hidden" name="locale" value={locale} />
        {state.status === "success" && <FormMessage tone="success">{t("verify.resent")}</FormMessage>}
        {state.error && <FormMessage tone="error">{t(`errors.${state.error}`)}</FormMessage>}
        {email ? (
          <input type="hidden" name="email" value={email} />
        ) : (
          <TextField
            label={t("fields.email")}
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={state.email}
            error={state.fieldErrors?.email}
          />
        )}
        <SubmitButton pending={pending} variant="secondary">
          {t("verify.resend")}
        </SubmitButton>
      </form>

      <Link href="/login" className="inline-block text-sm text-brand-strong hover:underline">
        {t("verify.backToLogin")}
      </Link>
    </div>
  );
}
