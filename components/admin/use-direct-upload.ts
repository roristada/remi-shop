"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/actions/result";
import { detectExtension, getExtension, mimeFor, SIGNATURE_BYTES, type FileRule } from "@/lib/storage/file-types";
import type { SignedUpload } from "@/lib/storage/product-storage";
import { putSignedUpload } from "@/lib/storage/upload-client";

/**
 * Renames a file whose extension does not match its bytes (chat apps often save a JPEG or GIF as
 * `.png`), which the server would reject. Unknown bytes keep the name; the server still checks them.
 */
export async function withContentExtension(rules: Record<string, FileRule>, file: File): Promise<File> {
  const head = new Uint8Array(await file.slice(0, SIGNATURE_BYTES).arrayBuffer());
  const ext = detectExtension(rules, head);
  const current = getExtension(file.name);
  if (!ext || ext === current || (ext === "jpg" && current === "jpeg")) return file;
  const base = file.name.slice(0, file.name.length - current.length - (current ? 1 : 0)) || "image";
  const name = `${base}.${ext}`;
  return new File([file], name, { type: mimeFor(rules, name), lastModified: file.lastModified });
}

type Request = (input: { fileName: string; size: number }) => Promise<ActionResult<SignedUpload>>;
type Confirm = (input: { path: string; fileName: string }) => Promise<ActionResult>;

/**
 * Uploads one file's bytes to storage with a one-time signed upload target. The server still
 * has to verify and record the object; returns the issued key, or an error message.
 */
export async function uploadToStorage(
  request: Request,
  file: File,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const target = await request({ fileName: file.name, size: file.size });
  if (!target.ok) return { ok: false, error: target.error };

  const uploaded = await putSignedUpload(target.data, file, file.type || "application/octet-stream");
  return uploaded ? { ok: true, path: target.data.path } : { ok: false, error: "อัปโหลดไม่สำเร็จ" };
}

/**
 * Browser → Supabase Storage via a one-time signed upload token, then the server
 * verifies the stored object. Files are uploaded one at a time.
 */
export function useDirectUpload(request: Request, confirm: Confirm) {
  const [uploading, setUploading] = useState<string | null>(null);

  async function uploadOne(file: File): Promise<boolean> {
    const stored = await uploadToStorage(request, file);
    if (!stored.ok) {
      toast.error(`${file.name}: ${stored.error}`);
      return false;
    }
    const { path } = stored;

    const result = await confirm({ path, fileName: file.name });
    if (!result.ok) {
      toast.error(`${file.name}: ${result.error}`);
      return false;
    }
    return true;
  }

  async function upload(files: FileList | File[]): Promise<number> {
    let done = 0;
    try {
      for (const file of Array.from(files)) {
        setUploading(file.name);
        if (await uploadOne(file)) done++;
      }
    } catch {
      toast.error("อัปโหลดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setUploading(null);
    }
    return done;
  }

  return { upload, uploading };
}

/**
 * Asks the server to make optimized copies of a saved picture, without waiting: it can take
 * a while for long animations, and the original shows until it is done. `keepalive` lets it
 * finish after the editor navigates away.
 */
export function requestImageOptimize(kind: "product" | "variant", id: string) {
  void fetch("/api/admin/images/optimize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, id }),
    keepalive: true,
  }).catch(() => undefined);
}
