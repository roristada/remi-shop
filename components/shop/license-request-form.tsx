"use client";

import { useEffect, useId, useRef, useState, useTransition, type ComponentProps, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ImageUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormMessage } from "@/components/auth/form-fields";
import { useRouter } from "@/i18n/navigation";
import { intlLocale } from "@/i18n/localize";
import { createClient } from "@/lib/supabase/client";
import { zodFieldErrors } from "@/lib/actions/result";
import type { FieldErrors } from "@/lib/validation/auth";
import { formatTHB } from "@/lib/pricing/calculate";
import { LICENSE_LIMITS, licenseEditFieldsSchema, licenseRequestFieldsSchema } from "@/lib/licenses/validation";
import { requestArtworkUpload, submitLicenseRequest, updateLicenseRequest } from "@/lib/licenses/customer-actions";
import { MAX_FILE_SIZE } from "@/lib/storage/buckets";
import { cn } from "@/lib/utils";

const ACCEPT = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
const EXTENSIONS = /\.(jpe?g|png|webp)$/i;

export type LicenseFormOffer = { usageTypeId: string; name: string; description: string | null; price: number };

export type LicenseFormValues = {
  buyerName: string;
  buyerEmail: string;
  buyerContact: string;
  artistName: string;
  artistContact: string;
  platform: string;
  note: string;
};

/** Editing a submitted request: details and artwork only; the chosen types and price stay locked. */
export type LicenseFormEdit = {
  requestId: string;
  values: LicenseFormValues;
  lines: { id: string; name: string; price: number }[];
  total: number;
  hasArtwork: boolean;
  /** ISO time the edit window closes. */
  editableUntil: string;
};

type Props = {
  productId: string;
  offers: LicenseFormOffer[];
  defaults: { buyerName: string; buyerEmail: string };
  edit?: LicenseFormEdit;
};

/**
 * Commercial license request. The total shown here is only echoed back for comparison; the server
 * re-prices from the database and locks that price. The artwork goes straight to private storage.
 */
export function LicenseRequestForm({ productId, offers, defaults, edit }: Props) {
  const t = useTranslations("shop.license");
  const locale = useLocale();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const artworkId = useId();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const previewRef = useRef<string | null>(null);
  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  const total = edit
    ? edit.total
    : offers.filter((o) => selected.has(o.usageTypeId)).reduce((sum, o) => sum + o.price, 0);
  const values: LicenseFormValues = edit?.values ?? {
    buyerName: defaults.buyerName,
    buyerEmail: defaults.buyerEmail,
    buyerContact: "",
    artistName: "",
    artistContact: "",
    platform: "",
    note: "",
  };
  const money = (satang: number) => formatTHB(satang, intlLocale(locale).number);
  const errorText = (key: string) => (fieldErrors[key] ? t(`errors.${fieldErrors[key]}`) : undefined);

  function clearError(key: string) {
    setFieldErrors((e) => {
      const next = { ...e };
      delete next[key];
      return next;
    });
  }

  function toggle(id: string, on: boolean) {
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
    clearError("usageTypeIds");
  }

  function pickFile(next: File | undefined) {
    clearError("artwork");
    if (!next) return;
    // Quick client-side feedback only; the server repeats every check.
    if (!EXTENSIONS.test(next.name)) return setFieldErrors((e) => ({ ...e, artwork: "unsupported_type" }));
    if (next.size > MAX_FILE_SIZE) return setFieldErrors((e) => ({ ...e, artwork: "too_large" }));
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = URL.createObjectURL(next);
    setPreview(previewRef.current);
    setFile(next);
  }

  /** Focuses the first invalid field in page order, not in the order the errors were found. */
  function focusFirstError(errors: FieldErrors) {
    const fields = formRef.current?.querySelectorAll<HTMLElement>("[data-field]") ?? [];
    for (const el of fields) {
      if (errors[el.dataset.field ?? ""]) return el.focus();
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const form = new FormData(e.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "");
    const details = {
      buyerName: text("buyerName"),
      buyerEmail: text("buyerEmail"),
      buyerContact: text("buyerContact"),
      artistName: text("artistName"),
      artistContact: text("artistContact"),
      platform: text("platform"),
      note: text("note"),
    };
    const fields = { ...details, usageTypeIds: [...selected] };
    const parsed = edit ? licenseEditFieldsSchema.safeParse(details) : licenseRequestFieldsSchema.safeParse(fields);
    const errors: FieldErrors = parsed.success ? {} : zodFieldErrors(parsed.error);
    // Array item errors (e.g. `usageTypeIds.0`) collapse onto the group.
    for (const key of Object.keys(errors)) if (key.startsWith("usageTypeIds.")) errors.usageTypeIds ??= "pick_usage";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return focusFirstError(errors);

    startTransition(async () => {
      // The artwork is optional: upload only when one was chosen.
      let artwork: { artworkPath: string; artworkFileName: string } | null = null;
      if (file) {
        const target = await requestArtworkUpload({ fileName: file.name, size: file.size });
        if (!target.ok) return setFormError(t(`errors.${target.code}`));

        const { bucket, path, token } = target.data;
        const { error: uploadError } = await createClient()
          .storage.from(bucket)
          .uploadToSignedUrl(path, token, file, { contentType: file.type || "image/jpeg" });
        if (uploadError) return setFormError(t("errors.ERROR"));
        artwork = { artworkPath: path, artworkFileName: file.name };
      }

      const result = edit
        ? await updateLicenseRequest(edit.requestId, { ...details, ...artwork })
        : await submitLicenseRequest({ ...fields, productId, expectedTotal: total, ...artwork });
      if (!result.ok) {
        if (result.fieldErrors) {
          setFieldErrors(result.fieldErrors);
          focusFirstError(result.fieldErrors);
        }
        return setFormError(t(`errors.${result.code}`));
      }
      router.push(edit ? "/account/licenses?updated=1" : "/account/licenses?submitted=1");
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      // A field's error clears as soon as the customer edits it.
      onInput={(e) => {
        const field = (e.target as HTMLElement).dataset.field;
        if (field && field !== "artwork" && fieldErrors[field]) clearError(field);
      }}
      noValidate
      className="space-y-8"
    >
      {formError && <FormMessage tone="error">{formError}</FormMessage>}

      {edit && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t("usageTitle")}</h2>
          <p className="text-sm text-foreground/70">{t("editLockedHint")}</p>
          <ul className="divide-y rounded-2xl border bg-muted/40">
            {edit.lines.map((l) => (
              <li key={l.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <span className="font-medium">{l.name}</span>
                <span className="shrink-0 font-medium tabular-nums">{money(l.price)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <fieldset className={cn("space-y-3", edit && "hidden")} disabled={Boolean(edit)}>
        <legend className="mb-1 text-lg font-semibold">{t("usageTitle")}</legend>
        <p className="text-sm text-foreground/70">{t("usageHint")}</p>
        <ul
          className={cn("divide-y rounded-2xl border", fieldErrors.usageTypeIds && "border-destructive")}
          aria-describedby={fieldErrors.usageTypeIds ? "usage-error" : undefined}
        >
          {offers.map((o, i) => {
            const id = `usage-${o.usageTypeId}`;
            return (
              <li key={o.usageTypeId} className="flex items-start gap-3 px-4 py-3">
                <Checkbox
                  id={id}
                  data-field={i === 0 ? "usageTypeIds" : undefined}
                  checked={selected.has(o.usageTypeId)}
                  onCheckedChange={(v) => toggle(o.usageTypeId, v === true)}
                  className="mt-0.5"
                />
                <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
                  <span className="block font-medium">{o.name}</span>
                  {o.description && <span className="block text-sm text-foreground/70">{o.description}</span>}
                </label>
                <span className="shrink-0 font-medium tabular-nums">{money(o.price)}</span>
              </li>
            );
          })}
        </ul>
        {fieldErrors.usageTypeIds && (
          <p id="usage-error" className="text-xs text-destructive">
            {errorText("usageTypeIds")}
          </p>
        )}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-lg font-semibold">{t("buyerTitle")}</legend>
        <Field name="buyerName" label={t("buyerName")} defaultValue={values.buyerName} maxLength={LICENSE_LIMITS.name} autoComplete="name" error={errorText("buyerName")} />
        <Field name="buyerEmail" label={t("buyerEmail")} type="email" defaultValue={values.buyerEmail} maxLength={LICENSE_LIMITS.email} autoComplete="email" error={errorText("buyerEmail")} />
        <Field
          name="buyerContact"
          label={t("buyerContact")}
          defaultValue={values.buyerContact}
          hint={t("contactHint")}
          maxLength={LICENSE_LIMITS.contact}
          wrapperClassName="sm:col-span-2"
          error={errorText("buyerContact")}
        />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-1 text-lg font-semibold">{t("artistTitle")}</legend>
        <p className="text-sm text-foreground/70 sm:col-span-2">{t("artistHint")}</p>
        <Field name="artistName" label={t("artistName")} defaultValue={values.artistName} maxLength={LICENSE_LIMITS.name} error={errorText("artistName")} />
        <Field name="artistContact" label={t("artistContact")} defaultValue={values.artistContact} hint={t("contactHint")} maxLength={LICENSE_LIMITS.contact} error={errorText("artistContact")} />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-3 text-lg font-semibold">{t("usageDetailTitle")}</legend>
        <Field name="platform" label={t("platform")} defaultValue={values.platform} hint={t("platformHint")} maxLength={LICENSE_LIMITS.platform} error={errorText("platform")} />

        <div className="space-y-1.5">
          <Label htmlFor={artworkId}>
            {t("artwork")} <span className="font-normal text-muted-foreground">{t("optional")}</span>
          </Label>
          <p id={`${artworkId}-hint`} className="text-xs text-muted-foreground">
            {t("artworkHint")}
            {edit?.hasArtwork && ` ${t("artworkAttached")}`}
          </p>
          <input
            id={artworkId}
            data-field="artwork"
            type="file"
            accept={ACCEPT}
            className="sr-only"
            aria-describedby={fieldErrors.artwork ? `${artworkId}-error` : `${artworkId}-hint`}
            aria-invalid={fieldErrors.artwork ? true : undefined}
            onChange={(e) => {
              pickFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <label
            htmlFor={artworkId}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed bg-background/60 px-4 py-6 text-sm transition-colors focus-within:ring-2 focus-within:ring-ring hover:bg-secondary/30",
              fieldErrors.artwork ? "border-destructive" : "border-foreground/15 hover:border-foreground/30",
            )}
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
              <img src={preview} alt={t("artworkPreview")} className="max-h-72 w-full rounded-xl object-contain" />
            ) : (
              <ImageUp className="size-6 text-muted-foreground" aria-hidden />
            )}
            <span className="font-medium">{file ? t("artworkChange") : t("artworkChoose")}</span>
          </label>
          {fieldErrors.artwork && (
            <p id={`${artworkId}-error`} className="text-xs text-destructive">
              {errorText("artwork")}
            </p>
          )}
        </div>

        <TextAreaField name="note" label={t("note")} defaultValue={values.note} hint={t("noteHint")} maxLength={LICENSE_LIMITS.note} error={errorText("note")} />
      </fieldset>

      <div className="sticky bottom-0 -mx-4 space-y-3 border-t bg-background/95 px-4 py-4 backdrop-blur sm:static sm:mx-0 sm:rounded-3xl sm:border-0 sm:bg-secondary/45 sm:p-6">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-semibold">{t("total")}</span>
          <span className="text-xl font-semibold tabular-nums" aria-live="polite">
            {money(total)}
          </span>
        </div>
        <Button type="submit" size="lg" className="h-12 w-full rounded-full text-base" disabled={pending} aria-busy={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {edit ? (pending ? t("saving") : t("save")) : pending ? t("submitting") : t("submit")}
        </Button>
        <p className="text-xs text-foreground/70">
          {edit
            ? t("editHint", { date: new Intl.DateTimeFormat(intlLocale(locale).date, { dateStyle: "medium", timeZone: "Asia/Bangkok" }).format(new Date(edit.editableUntil)) })
            : t("submitHint")}
        </p>
      </div>
    </form>
  );
}

type FieldProps = Omit<ComponentProps<"input">, "id" | "name"> & {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  wrapperClassName?: string;
};

function Field({ name, label, hint, error, wrapperClassName, className, ...props }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("space-y-1.5", wrapperClassName)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        data-field={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn("h-11 rounded-xl", className)}
        {...props}
      />
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function TextAreaField({
  name,
  label,
  hint,
  error,
  ...props
}: Omit<ComponentProps<"textarea">, "id" | "name"> & { name: string; label: string; hint?: string; error?: string }) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        name={name}
        data-field={name}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="min-h-24 rounded-xl"
        {...props}
      />
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
