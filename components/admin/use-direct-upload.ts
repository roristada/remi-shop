"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { ActionResult } from "@/lib/actions/result";
import type { SignedUpload } from "@/lib/storage/product-storage";

type Request = (input: { fileName: string; size: number }) => Promise<ActionResult<SignedUpload>>;
type Confirm = (input: { path: string; fileName: string }) => Promise<ActionResult>;

/**
 * Uploads one file's bytes to Storage with a one-time signed upload token. The server still
 * has to verify and record the object; returns the issued key, or an error message.
 */
export async function uploadToStorage(
  request: Request,
  file: File,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const target = await request({ fileName: file.name, size: file.size });
  if (!target.ok) return { ok: false, error: target.error };

  const { bucket, path, token } = target.data;
  const { error } = await createClient()
    .storage.from(bucket)
    .uploadToSignedUrl(path, token, file, { contentType: file.type || "application/octet-stream" });
  return error ? { ok: false, error: "อัปโหลดไม่สำเร็จ" } : { ok: true, path };
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
