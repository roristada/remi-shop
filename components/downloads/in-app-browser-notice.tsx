"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Copy, ExternalLink, TriangleAlert } from "lucide-react";

// Facebook/Messenger/Instagram/LINE in-app browsers. Facebook's appends `fbclid` to the signed
// file URL, which breaks its signature (R2 answers SignatureDoesNotMatch); the others handle
// file downloads unreliably too.
const IN_APP_UA = /FBAN|FBAV|FB_IAB|FBIOS|Messenger|Instagram|\bLine\//i;

const subscribe = () => () => {};
const detect = () => IN_APP_UA.test(navigator.userAgent);
const isAndroid = () => /Android/i.test(navigator.userAgent);

/** Asks customers browsing inside a social app to reopen the page in a real browser before downloading. */
export function InAppBrowserNotice() {
  const t = useTranslations("downloads.inAppBrowser");
  const inApp = useSyncExternalStore(subscribe, detect, () => false);
  const android = useSyncExternalStore(subscribe, isAndroid, () => false);
  const [copied, setCopied] = useState(false);

  if (!inApp) return null;

  function openInChrome() {
    const { host, pathname, search } = window.location;
    window.location.href = `intent://${host}${pathname}${search}#Intent;scheme=https;package=com.android.chrome;end`;
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div role="alert" className="space-y-3 rounded-3xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 sm:p-5">
      <p className="flex items-start gap-2 font-medium">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t("title")}
      </p>
      <p>{android ? t("hintAndroid") : t("hintIos")}</p>
      <div className="flex flex-wrap gap-2">
        {android && (
          <button
            type="button"
            onClick={openInChrome}
            className="flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 font-medium text-primary-foreground transition-colors hover:bg-primary/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ExternalLink className="size-4" aria-hidden />
            {t("openInChrome")}
          </button>
        )}
        <button
          type="button"
          onClick={copyLink}
          className="flex h-9 items-center gap-1.5 rounded-full border border-amber-300 bg-background px-4 font-medium transition-colors hover:bg-amber-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Copy className="size-4" aria-hidden />
          <span aria-live="polite">{copied ? t("copied") : t("copyLink")}</span>
        </button>
      </div>
    </div>
  );
}
