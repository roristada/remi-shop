"use client";

import NextLink from "next/link";
import { useCallback, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Link } from "@/i18n/navigation";
import { patchHeaderState, useHeaderState } from "@/components/layout/header-state";
import { intlLocale, localized } from "@/i18n/localize";
import { formatBangkokDateTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import {
  loadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationView,
} from "@/lib/notifications/actions";
import { UNREAD_BADGE_MAX } from "@/lib/notifications/rules";

/**
 * Navbar bell with an unread badge. Hidden for guests. The count comes from the shared header
 * state (see header-state.ts); the list loads when the popover opens, so pages pay nothing until it is used.
 */
export function NotificationBell({ className, hasSession = true }: { className?: string; hasSession?: boolean }) {
  const t = useTranslations("notifications");
  const unread = useHeaderState(hasSession)?.unread ?? null;
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationView[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loading, startLoading] = useTransition();

  const load = useCallback((before?: string) => {
    startLoading(async () => {
      try {
        const page = await loadNotifications(before);
        setItems((prev) => (before && prev ? [...prev, ...page.items] : page.items));
        setHasMore(page.hasMore);
        setFailed(false);
      } catch {
        setFailed(true);
      }
    });
  }, []);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) load();
  }

  function onItemClick(n: NotificationView) {
    setOpen(false);
    if (n.read) return;
    setItems((prev) => prev?.map((i) => (i.id === n.id ? { ...i, read: true } : i)) ?? prev);
    if (unread) patchHeaderState({ unread: unread - 1 });
    void markNotificationRead(n.id);
  }

  function onMarkAll() {
    setItems((prev) => prev?.map((i) => ({ ...i, read: true })) ?? prev);
    patchHeaderState({ unread: 0 });
    void markAllNotificationsRead();
  }

  if (unread === null) return null;
  const label = unread > 0 ? t("labelUnread", { count: unread }) : t("label");

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-xl" className={cn("relative rounded-full", className)} aria-label={label}>
          <Bell />
          {unread > 0 && (
            <span
              aria-hidden
              className="absolute top-1 right-1 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-brand-strong px-1 text-[0.6875rem] leading-none font-semibold text-brand-strong-foreground tabular-nums"
            >
              {unread > UNREAD_BADGE_MAX ? `${UNREAD_BADGE_MAX}+` : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(22rem,calc(100vw-2rem))] gap-0 rounded-2xl p-0">
        <div className="flex min-h-12 items-center justify-between gap-2 border-b px-4 py-2">
          <p className="font-semibold">{t("title")}</p>
          {items?.some((i) => !i.read) && (
            <Button variant="ghost" size="sm" className="h-8 rounded-full text-xs" onClick={onMarkAll}>
              <CheckCheck aria-hidden /> {t("markAll")}
            </Button>
          )}
        </div>
        <div className="max-h-[min(26rem,70vh)] overflow-y-auto">
          {items === null ? (
            failed ? (
              <ErrorState onRetry={() => load()} />
            ) : (
              <div className="grid place-items-center py-10" role="status">
                <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
                <span className="sr-only">{t("title")}</span>
              </div>
            )
          ) : items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <li key={n.id}>
                  <NotificationRow notification={n} onClick={() => onItemClick(n)} />
                </li>
              ))}
            </ul>
          )}
          {items !== null && failed && <ErrorState onRetry={() => load(items.at(-1)?.id)} />}
          {hasMore && items && !failed && (
            <div className="border-t p-2">
              <Button
                variant="ghost"
                className="h-9 w-full rounded-xl text-sm"
                disabled={loading}
                onClick={() => load(items.at(-1)?.id)}
              >
                {loading && <Loader2 className="animate-spin" aria-hidden />} {t("loadMore")}
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("notifications");
  return (
    <div className="space-y-2 px-4 py-6 text-center text-sm" role="alert">
      <p>{t("error")}</p>
      <Button variant="outline" size="sm" className="rounded-full" onClick={onRetry}>
        {t("retry")}
      </Button>
    </div>
  );
}

function NotificationRow({ notification: n, onClick }: { notification: NotificationView; onClick: () => void }) {
  const t = useTranslations("notifications");
  const locale = useLocale();
  const product = localized(locale, n.params.productNameTH ?? "", n.params.productNameEN ?? "");
  const key = n.type === "PRODUCT_UPDATED" && n.params.update === "files" ? "PRODUCT_FILES_UPDATED" : n.type;
  const message = t(`types.${key}`, {
    product,
    version: n.params.versionNumber ?? "",
    orderNumber: n.params.orderNumber ?? "",
  });

  const body = (
    <>
      <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", !n.read && "bg-brand-strong")} />
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className={cn("block text-sm", !n.read && "font-medium")}>
          {!n.read && <span className="sr-only">{t("unread")}: </span>}
          {message}
        </span>
        {n.params.reason && (
          <span className="line-clamp-2 block text-xs text-muted-foreground">{t("reason", { reason: n.params.reason })}</span>
        )}
        <span className="block text-xs text-muted-foreground">
          {formatBangkokDateTime(new Date(n.createdAt), intlLocale(locale).date)}
        </span>
      </span>
    </>
  );
  const rowClass = "flex gap-3 px-4 py-3 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none";

  return n.target.localized ? (
    <Link href={n.target.path} onClick={onClick} className={rowClass}>
      {body}
    </Link>
  ) : (
    <NextLink href={n.target.path} onClick={onClick} className={rowClass}>
      {body}
    </NextLink>
  );
}
