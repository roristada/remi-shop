const UNSAFE = /[^a-zA-Z0-9._-]+/g;

/** Makes a user-supplied filename safe for use as a storage object key segment. */
export function sanitizeFileName(name: string): string {
  const base = name.normalize("NFKD").split(/[\/]/).pop() ?? "";
  const cleaned = base.replace(UNSAFE, "-").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "");
  return cleaned.slice(0, 120) || "file";
}
