"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ImageUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { putSignedUpload } from "@/lib/storage/upload-client";
import type { SignedUpload } from "@/lib/storage/product-storage";
import { confirmSlipUpload, reportSlipClientFailure, requestSlipUpload } from "@/lib/payments/customer-actions";
import { MAX_FILE_SIZE } from "@/lib/storage/buckets";

const ACCEPT = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
const EXTENSIONS = /\.(jpe?g|png|webp)$/i;
const MIME_EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/**
 * Name sent to the server. Some banking apps and galleries hand over images with no or an odd
 * extension (e.g. `.jfif`, or none); the browser's image type then decides. The server still
 * checks the real bytes against this extension, so a wrong guess cannot slip through.
 */
function slipFileName(file: File): string | null {
  if (EXTENSIONS.test(file.name)) return file.name;
  const ext = MIME_EXTENSIONS[file.type];
  return ext ? `slip.${ext}` : null;
}

/** Extra tries for the direct upload; mobile connections drop the body now and then. */
const UPLOAD_RETRIES = 2;
const RETRY_DELAY_MS = 1500;

/**
 * Uploads to the same one-time target, retrying a failed send. A retry after a send that did land
 * gets "already exists" from storage; that counts as success (the server verifies the object next).
 */
async function uploadWithRetry(
  target: SignedUpload,
  body: Blob,
  contentType: string,
  onError: (reason: string) => void,
): Promise<boolean> {
  for (let attempt = 0; attempt <= UPLOAD_RETRIES; attempt++) {
    let reason = "";
    if (await putSignedUpload(target, body, contentType, (r) => (reason = r))) return true;
    if (attempt > 0 && /already exists/i.test(reason)) return true;
    onError(`attempt ${attempt + 1}: ${reason}`);
    if (attempt < UPLOAD_RETRIES) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }
  return false;
}

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
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [checking, setChecking] = useState(false);

  // Release the last preview URL when the component goes away.
  const previewRef = useRef<string | null>(null);
  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  function pick(next: File | undefined) {
    setError(null);
    if (!next) return;
    // Quick client-side feedback only; the server repeats every check.
    const reject = (code: "unsupported_type" | "too_large") => {
      setError(t(`errors.${code}`));
      void reportSlipClientFailure(orderNumber, {
        stage: "pick",
        reason: code,
        size: next.size,
        type: next.type,
        ext: next.name.split(".").pop() ?? "",
      }).catch(() => undefined);
    };
    const name = slipFileName(next);
    if (!name) return reject("unsupported_type");
    if (next.size > MAX_FILE_SIZE) return reject("too_large");
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = URL.createObjectURL(next);
    setPreview(previewRef.current);
    setFile(next);
    setFileName(name);
  }

  function send() {
    if (!file) return;
    // Failures the server never sees (direct storage upload, dropped requests) are reported for diagnostics.
    const report = (stage: string, reason: string) =>
      reportSlipClientFailure(orderNumber, {
        stage,
        reason,
        size: file.size,
        type: file.type,
        ext: file.name.split(".").pop() ?? "",
      }).catch(() => undefined);

    startTransition(async () => {
      let stage = "request";
      try {
        const target = await requestSlipUpload(orderNumber, { fileName, size: file.size });
        if (!target.ok) return setError(t(`errors.${target.code}`));

        // Read the bytes up front: an Android photo-picker file that is not really on the device
        // fails here with a clear message instead of as a silent network error mid-upload.
        stage = "read";
        const contentType = file.type || "image/jpeg";
        let body: Blob;
        try {
          body = new Blob([await file.arrayBuffer()], { type: contentType });
        } catch (e) {
          void report("read", e instanceof Error ? `${e.name}: ${e.message}` : String(e));
          return setError(t("errors.unreadable"));
        }

        stage = "upload";
        const { path } = target.data;
        if (!(await uploadWithRetry(target.data, body, contentType, (reason) => report("upload", reason)))) {
          return setError(t("errors.ERROR"));
        }

        // The server may verify the slip with the bank here, which takes a few seconds.
        stage = "confirm";
        setChecking(true);
        const result = await confirmSlipUpload(orderNumber, { path, fileName });
        if (!result.ok) return setError(t(`errors.${result.code}`));

        toast.success(t(result.data.approved ? "approved" : "submitted"));
        router.refresh();
      } catch (e) {
        // A server action that never answered (network drop, function timeout) used to fail silently.
        setError(t("errors.ERROR"));
        void report(stage, `exception: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setChecking(false);
      }
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
            {pending ? t(checking ? "checking" : "uploading") : t("submit")}
          </Button>
          <Button variant="outline" className="h-11 rounded-full" disabled={pending} onClick={() => inputRef.current?.click()}>
            {t("change")}
          </Button>
        </div>
      )}
    </div>
  );
}
