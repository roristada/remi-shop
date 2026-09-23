"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { updateProfile } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/auth/form-state";
import { FormMessage, TextField } from "@/components/auth/form-fields";
import { SubmitButton } from "@/components/auth/submit-button";

export function ProfileForm({ email, displayName }: { email: string; displayName: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const [state, action, pending] = useActionState(updateProfile, initialFormState);

  return (
    <form action={action} className="max-w-md space-y-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {state.status === "success" && <FormMessage tone="success">{t("account.profile.saved")}</FormMessage>}
      {state.error && <FormMessage tone="error">{t(`auth.errors.${state.error}`)}</FormMessage>}
      <TextField
        label={t("auth.fields.email")}
        name="email-readonly"
        type="email"
        value={email}
        readOnly
        disabled
        hint={t("account.profile.emailHint")}
      />
      <TextField
        label={t("auth.fields.displayName")}
        name="displayName"
        autoComplete="nickname"
        maxLength={50}
        defaultValue={displayName}
        error={state.fieldErrors?.displayName}
      />
      <SubmitButton pending={pending} className="w-auto px-6">
        {t("account.profile.save")}
      </SubmitButton>
    </form>
  );
}
