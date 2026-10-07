"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Download as DownloadIcon, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

/** A selectable product (or order line) with the file ids "download all" fetches for it. */
export type BulkItem = { id: string; fileIds: string[] };

type Selection = {
  enabled: boolean;
  selected: ReadonlySet<string>;
  toggle: (id: string, on: boolean) => void;
};

const BulkSelectionContext = createContext<Selection | null>(null);

// Gap between files: browsers drop downloads started too close together.
const STAGGER_MS = 800;
// The signed URL lives for minutes; the frame only has to start the download.
const FRAME_TTL_MS = 60_000;

type DownloadResponse = { success: true; data: { url: string } } | { success: false; error: { code: string } };

/** Starts a browser download without leaving the page (the signed URL answers as an attachment). */
function startDownload(url: string) {
  const frame = document.createElement("iframe");
  frame.hidden = true;
  frame.src = url;
  document.body.appendChild(frame);
  setTimeout(() => frame.remove(), FRAME_TTL_MS);
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Selection state plus the "download all" toolbar (shown once there is more than one file). Each file is fetched
 * through /api/download (`format=json`), which re-authorizes it exactly like a single click, and
 * downloaded as its own file — no archive.
 */
export function BulkDownloadProvider({
  items,
  locale,
  children,
}: {
  items: BulkItem[];
  locale: string;
  children: ReactNode;
}) {
  const t = useTranslations("downloads.bulk");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ ok: number; failed: number } | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const downloadable = items.filter((p) => p.fileIds.length > 0);
  const enabled = downloadable.reduce((n, p) => n + p.fileIds.length, 0) > 1;
  const allSelected = downloadable.length > 0 && downloadable.every((p) => selected.has(p.id));
  const targets = selected.size > 0 ? downloadable.filter((p) => selected.has(p.id)) : downloadable;
  const fileIds = targets.flatMap((p) => p.fileIds);
  const busy = progress !== null;

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function downloadAll() {
    if (busy || fileIds.length === 0) return;
    setResult(null);
    let ok = 0;
    let failed = 0;
    for (const [i, id] of fileIds.entries()) {
      if (!mounted.current) return;
      setProgress({ done: i, total: fileIds.length });
      try {
        const res = await fetch(`/api/download/${id}?locale=${locale}&format=json`, { cache: "no-store" });
        const body = (await res.json()) as DownloadResponse;
        if (body.success) {
          startDownload(body.data.url);
          ok++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
      if (i < fileIds.length - 1) await wait(STAGGER_MS);
    }
    if (!mounted.current) return;
    setProgress(null);
    setResult({ ok, failed });
  }

  return (
    <BulkSelectionContext.Provider value={{ enabled, selected, toggle }}>
      {enabled && (
        <div className="space-y-2 rounded-3xl border bg-background/80 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={allSelected}
                disabled={busy}
                onCheckedChange={(v) => setSelected(v === true ? new Set(downloadable.map((p) => p.id)) : new Set())}
              />
              {t("selectAll")}
            </label>
            <button
              type="button"
              onClick={downloadAll}
              disabled={busy || fileIds.length === 0}
              aria-busy={busy}
              className="flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <DownloadIcon className="size-4" aria-hidden />}
              {selected.size > 0 ? t("downloadSelected", { count: targets.length }) : t("downloadAll")}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">{t("hint")}</p>
          <p aria-live="polite" className="text-sm empty:hidden">
            {progress
              ? t("progress", { done: progress.done + 1, total: progress.total })
              : result && (
                  <>
                    {result.ok > 0 && <span>{t("done", { count: result.ok })} </span>}
                    {result.failed > 0 && <span className="text-destructive">{t("failed", { count: result.failed })}</span>}
                  </>
                )}
          </p>
        </div>
      )}
      {children}
    </BulkSelectionContext.Provider>
  );
}

/** Per-item checkbox; hidden when the item has nothing left to download or the toolbar is off. */
export function BulkSelectCheckbox({ id, label, disabled }: { id: string; label: string; disabled?: boolean }) {
  const ctx = useContext(BulkSelectionContext);
  if (!ctx?.enabled || disabled) return null;
  return (
    <Checkbox
      aria-label={label}
      checked={ctx.selected.has(id)}
      onCheckedChange={(v) => ctx.toggle(id, v === true)}
    />
  );
}
