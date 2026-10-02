"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { FileList, type FileListItem } from "./file-list";

type Selection = { selectedId: string | null; select: (variantId: string | null) => void };

const SelectedVariantContext = createContext<Selection | null>(null);

/**
 * Shares the variant picked in the purchase panel with the rest of the product page, so the
 * file list shows what that choice actually includes. Display only; the server decides access.
 */
export function SelectedVariantProvider({ initialId, children }: { initialId: string | null; children: ReactNode }) {
  const [selectedId, select] = useState(initialId);
  return <SelectedVariantContext.Provider value={{ selectedId, select }}>{children}</SelectedVariantContext.Provider>;
}

export function useSelectedVariant(): Selection | null {
  return useContext(SelectedVariantContext);
}

/** `variantId` null = every buyer gets the file. */
export type VariantFile = FileListItem & { variantId: string | null };

/** Shared files plus the chosen variant's own; every file (with its variant name) when nothing is chosen. */
export function VariantFileList({ files }: { files: VariantFile[] }) {
  const selectedId = useSelectedVariant()?.selectedId ?? null;
  const shown = selectedId
    ? files.filter((f) => f.variantId === null || f.variantId === selectedId).map((f) => ({ ...f, variantName: null }))
    : files;
  if (shown.length === 0) return null;
  return <FileList files={shown} />;
}
