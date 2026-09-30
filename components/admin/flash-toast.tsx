"use client";

import { useEffect } from "react";
import { toast } from "sonner";

const FLASH_PARAMS = ["deleted", "created", "duplicated", "imageCopyFailed"];

/** Shows a one-time toast for redirect-based notices (e.g. `?deleted=1`), then cleans the URL. */
export function FlashToast({ message }: { message: string }) {
  useEffect(() => {
    toast.success(message, { id: message }); // id dedupes StrictMode double effects
    const url = new URL(window.location.href);
    for (const key of FLASH_PARAMS) url.searchParams.delete(key);
    window.history.replaceState(null, "", url);
  }, [message]);
  return null;
}
