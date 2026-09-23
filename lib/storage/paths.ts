const UNSAFE = /[^a-zA-Z0-9._-]+/g;

function clean(part: string): string {
  return part.replace(UNSAFE, "-").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "");
}

/**
 * Makes a user-supplied filename safe for use as a storage object key segment.
 * The extension is kept even when the base name has no ASCII characters
 * (e.g. Thai names: "แปรงสีน้ำ.brushset" → "file.brushset").
 */
export function sanitizeFileName(name: string): string {
  const base = name.normalize("NFKD").split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  const stem = clean(dot > 0 ? base.slice(0, dot) : base).slice(0, 100) || "file";
  const ext = dot > 0 ? clean(base.slice(dot + 1)).toLowerCase().slice(0, 20) : "";
  return ext ? `${stem}.${ext}` : stem;
}
