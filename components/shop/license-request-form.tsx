"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ImageUp, Loader2, MessageSquareWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormMessage } from "@/components/auth/form-fields";
import { useRouter } from "@/i18n/navigation";
import { intlLocale, localized } from "@/i18n/localize";
import { putSignedUpload } from "@/lib/storage/upload-client";
import type { FieldErrors } from "@/lib/validation/auth";
import { formatTHB } from "@/lib/pricing/calculate";
import { ARTWORK_FIELD_ID, answerErrorKey, FIELD_LIMITS, isChoiceType, resolveAnswers, type FormFieldDef } from "@/lib/licenses/form-fields";
import { requestArtworkUpload, submitLicenseRequest, updateLicenseRequest } from "@/lib/licenses/customer-actions";
import { MAX_FILE_SIZE } from "@/lib/storage/buckets";
import { cn } from "@/lib/utils";

const ACCEPT = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
const EXTENSIONS = /\.(jpe?g|png|webp)$/i;

export type LicenseFormOffer = { usageTypeId: string; name: string; description: string | null; conditions: string | null; price: number };

export type LicenseFormField = FormFieldDef & { descriptionTH: string | null; descriptionEN: string | null };

/** fieldId → text, or chosen option ids. */
export type AnswerValues = Record<string, string | string[]>;

/** Editing a submitted request (or answering the store's request for changes). */
export type LicenseFormEdit = {
  requestId: string;
  answers: AnswerValues;
  lines: { id: string; name: string; price: number }[];
  total: number;
  hasArtwork: boolean;
  /** ISO time the edit window closes; null while answering a request for changes. */
  editableUntil: string | null;
  /** Present when the store asked for changes. */
  respond?: {
    message: string | null;
    flagged: string[];
    proposedTotal: number | null;
    priceReason: string | null;
  };
};

type Props = {
  productId: string;
  offers: LicenseFormOffer[];
  fields: LicenseFormField[];
  /** Prefill for a new request: account email for email fields, display name for the buyer name. */
  defaults: { name: string; email: string };
  edit?: LicenseFormEdit;
};

function initialAnswers(fields: LicenseFormField[], defaults: Props["defaults"]): AnswerValues {
  const out: AnswerValues = {};
  for (const f of fields) {
    if (f.key === "buyerName" && defaults.name) out[f.id] = defaults.name;
    else if (f.type === "EMAIL" && defaults.email) out[f.id] = defaults.email;
  }
  return out;
}

/**
 * Commercial license request, built from the questions the admin set up in Settings. The total
 * shown here is only echoed back for comparison; the server re-prices from the database and
 * re-checks every answer. The artwork goes straight to private storage.
 */
export function LicenseRequestForm({ productId, offers, fields, defaults, edit }: Props) {
  const t = useTranslations("shop.license");
  const locale = useLocale();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const artworkId = useId();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [answers, setAnswers] = useState<AnswerValues>(() => edit?.answers ?? initialAnswers(fields, defaults));
  const [acceptPrice, setAcceptPrice] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const previewRef = useRef<string | null>(null);
  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  const respond = edit?.respond;
  const flagged = new Set(respond?.flagged ?? []);
  const total = edit ? edit.total : offers.filter((o) => selected.has(o.usageTypeId)).reduce((sum, o) => sum + o.price, 0);
  const money = (satang: number) => formatTHB(satang, intlLocale(locale).number);
  const errorText = (key: string) => (fieldErrors[key] ? t(`errors.${fieldErrors[key]}`) : undefined);

  function clearError(key: string) {
    setFieldErrors((e) => {
      if (!e[key]) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  }

  function setAnswer(fieldId: string, value: string | string[]) {
    setAnswers((a) => ({ ...a, [fieldId]: value }));
    clearError(answerErrorKey(fieldId));
  }

  function toggleUsage(id: string, on: boolean) {
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
    const els = formRef.current?.querySelectorAll<HTMLElement>("[data-field]") ?? [];
    for (const el of els) {
      if (errors[el.dataset.field ?? ""]) return el.focus();
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const errors: FieldErrors = {};
    const checked = resolveAnswers(fields, answers);
    if (!checked.ok) Object.assign(errors, checked.errors);
    if (!edit && selected.size === 0) errors.usageTypeIds = "pick_usage";
    if (respond && flagged.has(ARTWORK_FIELD_ID) && !file) errors.artwork = "artwork_required";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return focusFirstError(errors);
    if (respond?.proposedTotal != null && !acceptPrice) return setFormError(t("errors.PRICE_NOT_ACCEPTED"));

    startTransition(async () => {
      // The artwork is optional: upload only when one was chosen.
      let artwork: { artworkPath: string; artworkFileName: string } | null = null;
      if (file) {
        const target = await requestArtworkUpload({ fileName: file.name, size: file.size });
        if (!target.ok) return setFormError(t(`errors.${target.code}`));
        if (!(await putSignedUpload(target.data, file, file.type || "image/jpeg"))) return setFormError(t("errors.ERROR"));
        artwork = { artworkPath: target.data.path, artworkFileName: file.name };
      }

      const result = edit
        ? await updateLicenseRequest(edit.requestId, { answers, acceptPrice: respond ? acceptPrice : undefined, ...artwork })
        : await submitLicenseRequest({ productId, usageTypeIds: [...selected], answers, expectedTotal: total, ...artwork });
      if (!result.ok) {
        if (result.fieldErrors) {
          setFieldErrors(result.fieldErrors);
          focusFirstError(result.fieldErrors);
        }
        return setFormError(t(`errors.${result.code}`));
      }
      if (edit) router.push(`/account/licenses/${edit.requestId}?${respond ? "responded" : "updated"}=1`);
      else router.push("/account/licenses?submitted=1");
    });
  }

  const artworkFlagged = flagged.has(ARTWORK_FIELD_ID);

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-8">
      {formError && <FormMessage tone="error">{formError}</FormMessage>}

      {respond && (respond.message || respond.flagged.length > 0) && (
        <section className="space-y-2 rounded-2xl border border-warning/40 bg-warning/10 p-4" aria-labelledby="store-note">
          <h2 id="store-note" className="flex items-center gap-2 font-semibold">
            <MessageSquareWarning className="size-4 text-warning" aria-hidden /> {t("storeNoteTitle")}
          </h2>
          {respond.message && <p className="text-sm whitespace-pre-line">{respond.message}</p>}
          {respond.flagged.length > 0 && <p className="text-sm text-foreground/75">{t("flaggedHint")}</p>}
        </section>
      )}

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

      {!edit && (
        <fieldset className="space-y-3">
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
                    onCheckedChange={(v) => toggleUsage(o.usageTypeId, v === true)}
                    className="mt-0.5"
                  />
                  <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer space-y-1">
                    <span className="block font-medium">{o.name}</span>
                    {o.description && <span className="block text-sm text-foreground/70">{o.description}</span>}
                    {o.conditions && (
                      <span className="block rounded-lg bg-muted/70 px-2.5 py-1.5 text-xs whitespace-pre-line text-foreground/75">
                        <span className="font-medium">{t("conditions")}</span> {o.conditions}
                      </span>
                    )}
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
      )}

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-lg font-semibold">{t("detailsTitle")}</legend>
        {fields.map((f) => (
          <AnswerField
            key={f.id}
            field={f}
            locale={locale}
            value={answers[f.id]}
            onChange={(v) => setAnswer(f.id, v)}
            error={errorText(answerErrorKey(f.id))}
            flagged={flagged.has(f.id)}
            optionalLabel={t("optional")}
            flaggedLabel={t("flagged")}
          />
        ))}
      </fieldset>

      <div className={cn("space-y-1.5", artworkFlagged && "rounded-2xl border border-warning/50 bg-warning/5 p-3")}>
        <Label htmlFor={artworkId}>
          {t("artwork")}{" "}
          {artworkFlagged ? (
            <span className="font-normal text-warning">{t("flagged")}</span>
          ) : (
            <span className="font-normal text-muted-foreground">{t("optional")}</span>
          )}
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

      <div className="sticky bottom-0 -mx-4 space-y-3 border-t bg-background/95 px-4 py-4 backdrop-blur sm:static sm:mx-0 sm:rounded-3xl sm:border-0 sm:bg-background/80 sm:p-6">
        {respond?.proposedTotal != null ? (
          <PriceChange
            oldTotal={money(total)}
            newTotal={money(respond.proposedTotal)}
            reason={respond.priceReason}
            labels={{ title: t("newPriceTitle"), old: t("oldPrice"), next: t("newPrice"), reason: t("priceReason") }}
          >
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <Checkbox checked={acceptPrice} onCheckedChange={(v) => setAcceptPrice(v === true)} className="mt-0.5" />
              <span>{t("acceptNewPrice", { price: money(respond.proposedTotal) })}</span>
            </label>
          </PriceChange>
        ) : (
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-semibold">{t("total")}</span>
            <span className="text-xl font-semibold tabular-nums" aria-live="polite">
              {money(total)}
            </span>
          </div>
        )}
        <Button type="submit" size="lg" className="h-12 w-full rounded-full text-base" disabled={pending} aria-busy={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {respond ? t("sendBack") : edit ? (pending ? t("saving") : t("save")) : pending ? t("submitting") : t("submit")}
        </Button>
        <p className="text-xs text-foreground/70">
          {respond
            ? t("sendBackHint")
            : edit?.editableUntil
              ? t("editHint", {
                  date: new Intl.DateTimeFormat(intlLocale(locale).date, { dateStyle: "medium", timeZone: "Asia/Bangkok" }).format(
                    new Date(edit.editableUntil),
                  ),
                })
              : t("submitHint")}
        </p>
      </div>
    </form>
  );
}

/** Old and new price side by side, so the customer sees exactly what changed and why. */
export function PriceChange({
  oldTotal,
  newTotal,
  reason,
  labels,
  children,
}: {
  oldTotal: string;
  newTotal: string;
  reason: string | null;
  labels: { title: string; old: string; next: string; reason: string };
  children?: ReactNode;
}) {
  return (
    <div className="space-y-2 rounded-2xl border border-brand-strong/30 bg-accent/60 p-4">
      <p className="font-semibold">{labels.title}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{labels.old}</dt>
        <dd className="tabular-nums line-through">{oldTotal}</dd>
        <dt className="text-muted-foreground">{labels.next}</dt>
        <dd className="text-lg font-semibold tabular-nums">{newTotal}</dd>
        {reason && (
          <>
            <dt className="text-muted-foreground">{labels.reason}</dt>
            <dd className="whitespace-pre-line">{reason}</dd>
          </>
        )}
      </dl>
      {children}
    </div>
  );
}

function AnswerField({
  field,
  locale,
  value,
  onChange,
  error,
  flagged,
  optionalLabel,
  flaggedLabel,
}: {
  field: LicenseFormField;
  locale: string;
  value: string | string[] | undefined;
  onChange: (v: string | string[]) => void;
  error?: string;
  flagged: boolean;
  optionalLabel: string;
  flaggedLabel: string;
}) {
  const id = useId();
  const label = localized(locale, field.labelTH, field.labelEN);
  const description = localized(locale, field.descriptionTH, field.descriptionEN);
  const describedBy = error ? `${id}-error` : description ? `${id}-hint` : undefined;
  const wide = field.type === "TEXTAREA" || isChoiceType(field.type);
  const text = typeof value === "string" ? value : "";
  const picked = Array.isArray(value) ? value : typeof value === "string" && value ? [value] : [];
  const optionLabel = (o: { th: string; en: string }) => localized(locale, o.th, o.en);
  const a11y = { "aria-invalid": error ? true : undefined, "aria-describedby": describedBy } as const;

  let control: ReactNode;
  if (field.type === "TEXTAREA") {
    control = (
      <Textarea id={id} data-field={answerErrorKey(field.id)} rows={3} maxLength={FIELD_LIMITS.TEXTAREA} value={text} onChange={(e) => onChange(e.target.value)} className="min-h-24 rounded-xl" {...a11y} />
    );
  } else if (field.type === "TEXT" || field.type === "EMAIL") {
    control = (
      <Input
        id={id}
        data-field={answerErrorKey(field.id)}
        type={field.type === "EMAIL" ? "email" : "text"}
        maxLength={FIELD_LIMITS[field.type]}
        autoComplete={field.type === "EMAIL" ? "email" : field.key === "buyerName" ? "name" : undefined}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 rounded-xl"
        {...a11y}
      />
    );
  } else if (field.type === "DROPDOWN") {
    control = (
      <select
        id={id}
        data-field={answerErrorKey(field.id)}
        value={picked[0] ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        {...a11y}
      >
        <option value="">—</option>
        {field.options.map((o) => (
          <option key={o.id} value={o.id}>
            {optionLabel(o)}
          </option>
        ))}
      </select>
    );
  } else {
    const multi = field.type === "CHECKBOX";
    control = (
      <div role={multi ? "group" : "radiogroup"} aria-labelledby={`${id}-label`} {...a11y} className="grid gap-2 sm:grid-cols-2">
        {field.options.map((o, i) => {
          const optId = `${id}-${o.id}`;
          const on = picked.includes(o.id);
          return (
            <label key={o.id} htmlFor={optId} className="flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 text-sm has-[:checked]:border-brand-strong/50 has-[:checked]:bg-accent/50">
              <input
                id={optId}
                data-field={i === 0 ? answerErrorKey(field.id) : undefined}
                type={multi ? "checkbox" : "radio"}
                name={`answer-${field.id}`}
                checked={on}
                onChange={(e) => onChange(multi ? (e.target.checked ? [...picked, o.id] : picked.filter((p) => p !== o.id)) : o.id)}
                className="mt-0.5 size-4 accent-brand-strong"
              />
              <span>{optionLabel(o)}</span>
            </label>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn("space-y-1.5", wide && "sm:col-span-2", flagged && "rounded-2xl border border-warning/50 bg-warning/5 p-3")}>
      <Label id={`${id}-label`} htmlFor={isChoiceType(field.type) && field.type !== "DROPDOWN" ? undefined : id}>
        {label}{" "}
        {flagged ? (
          <span className="font-normal text-warning">{flaggedLabel}</span>
        ) : (
          !field.isRequired && <span className="font-normal text-muted-foreground">{optionalLabel}</span>
        )}
      </Label>
      {control}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : description ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  );
}
