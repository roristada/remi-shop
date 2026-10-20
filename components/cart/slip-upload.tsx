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
import { detectExtension, getExtension, IMAGE_FILE_TYPES, mimeFor, SIGNATURE_BYTES } from "@/lib/storage/file-types";

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

/**
 * Extension matching the file's real bytes. Banking apps and galleries sometimes save a PNG or
 * WEBP under a `.jpg` name, which the server rejects; null for formats it does not accept (HEIC…).
 */
async function contentExtension(blob: Blob): Promise<string | null> {
  const head = new Uint8Array(await blob.slice(0, SIGNATURE_BYTES).arrayBuffer());
  return detectExtension(IMAGE_FILE_TYPES, head);
}

/** Max edge of a redrawn slip; plenty for the bank QR, keeps the JPEG well under the size limit. */
const REDRAW_MAX_EDGE = 2000;

/**
 * Fallback when the file's bytes cannot be read or are in an unaccepted format but the browser can
 * still display it: decode it as an image, draw it on a canvas and re-encode as JPEG. Returns null
 * when that fails too.
 */
async function redrawImage(source: Blob): Promise<Blob | null> {
  const url = URL.createObjectURL(source);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, REDRAW_MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff"; // transparent PNG areas would turn black in JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
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
  /** In-memory copy of the picked file; this is what gets previewed and uploaded. */
  const [body, setBody] = useState<Blob | null>(null);
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

  /** Diagnostics for failures the server never sees (file read, direct storage upload, dropped requests). */
  function report(source: File, stage: string, reason: string) {
    void reportSlipClientFailure(orderNumber, {
      stage,
      reason,
      size: source.size,
      type: source.type,
      ext: source.name.split(".").pop() ?? "",
    }).catch(() => undefined);
  }

  async function pick(next: File | undefined) {
    setError(null);
    if (!next) return;
    // Quick client-side feedback only; the server repeats every check.
    const name = slipFileName(next);
    if (!name) {
      setError(t("errors.unsupported_type"));
      return report(next, "pick", "unsupported_type");
    }
    if (next.size > MAX_FILE_SIZE) {
      setError(t("errors.too_large"));
      return report(next, "pick", "too_large");
    }
    // Copy the bytes right away. Android Chrome can revoke access to a picked file (photo picker,
    // cloud gallery) shortly after the choice, so reading it later at send time fails with
    // NotReadableError even though the preview showed.
    let copy: Blob | null;
    let uploadName = name;
    let redrawn = false;
    try {
      copy = new Blob([await next.arrayBuffer()], { type: next.type || "image/jpeg" });
    } catch (e) {
      report(next, "read", e instanceof Error ? `${e.name}: ${e.message}` : String(e));
      // The preview still renders in that case, so redraw the image and upload the redrawn copy.
      copy = await redrawImage(next);
      if (!copy) {
        setError(t("errors.unreadable"));
        return report(next, "redraw", "failed");
      }
      uploadName = "slip.jpg";
      redrawn = true;
    }
    if (!redrawn) {
      const ext = await contentExtension(copy).catch(() => null);
      if (ext && getExtension(uploadName) !== ext) {
        report(next, "pick", `renamed ${getExtension(uploadName)} -> ${ext}`);
        copy = new Blob([copy], { type: mimeFor(IMAGE_FILE_TYPES, `slip.${ext}`) });
        uploadName = `slip.${ext}`;
      } else if (!ext) {
        report(next, "pick", "unknown format, redrawn");
        const jpeg = await redrawImage(copy);
        if (!jpeg) {
          setError(t("errors.signature_mismatch"));
          return report(next, "redraw", "failed");
        }
        copy = jpeg;
        uploadName = "slip.jpg";
      }
    }
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = URL.createObjectURL(copy);
    setPreview(previewRef.current);
    setFile(next);
    setBody(copy);
    setFileName(uploadName);
  }

  function send() {
    if (!file || !body) return;
    startTransition(async () => {
      let stage = "request";
      try {
        const target = await requestSlipUpload(orderNumber, { fileName, size: body.size });
        if (!target.ok) return setError(t(`errors.${target.code}`));

        stage = "upload";
        const { path } = target.data;
        if (!(await uploadWithRetry(target.data, body, body.type, (reason) => report(file, "upload", reason)))) {
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
        report(file, stage, `exception: ${e instanceof Error ? e.message : String(e)}`);
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
          const input = e.currentTarget;
          // Clear the input only after the bytes are copied, so the browser keeps the file handle meanwhile.
          void pick(input.files?.[0]).finally(() => (input.value = ""));
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
