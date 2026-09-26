"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ImageUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { confirmSlipUpload, requestSlipUpload } from "@/lib/payments/customer-actions";
import { MAX_FILE_SIZE } from "@/lib/storage/buckets";

const ACCEPT = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
const EXTENSIONS = /\.(jpe?g|png|webp)$/i;

/**
 * Choose → preview → send. The browser uploads straight to private storage with a one-time token;
 * the server then checks the real bytes and attaches the slip to this customer's own order.
 */
export function SlipUpload({ orderNumber }: { orderNumber: string }) {
  const t = useTranslations("cart.slip");
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Release the last preview URL when the component goes away.
  const previewRef = useRef<string | null>(null);
  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  function pick(next: File | undefined) {
    setError(null);
    if (!next) return;
    // Quick client-side feedback only; the server repeats every check.
    if (!EXTENSIONS.test(next.name)) return setError(t("errors.unsupported_type"));
    if (next.size > MAX_FILE_SIZE) return setError(t("errors.too_large"));
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = URL.createObjectURL(next);
    setPreview(previewRef.current);
    setFile(next);
  }

  function send() {
    if (!file) return;
    startTransition(async () => {
      const target = await requestSlipUpload(orderNumber, { fileName: file.name, size: file.size });
      if (!target.ok) return setError(t(`errors.${target.code}`));

      const { bucket, path, token } = target.data;
      const { error: uploadError } = await createClient()
        .storage.from(bucket)
        .uploadToSignedUrl(path, token, file, { contentType: file.type || "image/jpeg" });
      if (uploadError) return setError(t("errors.ERROR"));

      const result = await confirmSlipUpload(orderNumber, { path, fileName: file.name });
      if (!result.ok) return setError(t(`errors.${result.code}`));

      toast.success(t("submitted"));
      router.refresh();
    });
  }

  return (
    // The order page's numbered step supplies the heading ("attach your transfer slip").
    <div className="space-y-3">
      <p className="text-xs text-foreground/75">{t("hint")}</p>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
        <img src={preview} alt={t("preview")} className="max-h-72 w-full rounded-xl border object-contain" />
      ) : (
        <label
          htmlFor={inputId}
          className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-foreground/15 px-4 py-8 text-sm transition-colors hover:border-foreground/30 bg-background/60 hover:bg-background focus-within:ring-2 focus-within:ring-ring"
        >
          <ImageUp className="size-6 text-muted-foreground" aria-hidden />
          <span className="font-medium">{t("choose")}</span>
        </label>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {file && (
        <div className="flex flex-wrap gap-2">
          <Button className="h-11 flex-1 rounded-full" onClick={send} disabled={pending} aria-busy={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {pending ? t("uploading") : t("submit")}
          </Button>
          <Button variant="outline" className="h-11 rounded-full" disabled={pending} onClick={() => inputRef.current?.click()}>
            {t("change")}
          </Button>
        </div>
      )}
    </div>
  );
}
