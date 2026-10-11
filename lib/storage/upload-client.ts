import { createClient } from "@/lib/supabase/client";
import type { SignedUpload } from "@/lib/storage/product-storage";

/**
 * Browser side of `createSignedUpload`: sends the file's bytes to the issued target. The server
 * still has to verify and record the object afterwards. Returns whether the upload succeeded;
 * `onError` receives a short reason (HTTP status or storage message) for diagnostics.
 */
export async function putSignedUpload(
  upload: SignedUpload,
  file: Blob,
  contentType: string,
  onError?: (reason: string) => void,
): Promise<boolean> {
  if ("url" in upload) {
    // Presigned PUT (preview images on R2): send exactly the headers it was signed with.
    const res = await fetch(upload.url, {
      method: "PUT",
      // The server's headers (incl. the content type it chose) win over the browser's guess.
      headers: { "content-type": contentType, ...upload.headers },
      body: file,
    }).catch((e: unknown) => {
      onError?.(`network: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    });
    if (res && !res.ok) onError?.(`http ${res.status}`);
    return res?.ok ?? false;
  }
  const { error } = await createClient()
    .storage.from(upload.bucket)
    .uploadToSignedUrl(upload.path, upload.token, file, { contentType });
  if (error) onError?.(`storage: ${error.message}`);
  return !error;
}
