// Pure add-on rules (no DB).

/** Add-ons one product can offer. */
export const MAX_ADDONS = 12;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Distinct, well-formed ids, never the product itself, at most MAX_ADDONS, in the given order. */
export function cleanAddonIds(productId: string, ids: unknown): string[] | null {
  if (!Array.isArray(ids)) return null;
  const out: string[] = [];
  for (const id of ids) {
    if (typeof id !== "string" || !UUID.test(id)) return null;
    if (id === productId || out.includes(id)) continue;
    out.push(id);
  }
  return out.length > MAX_ADDONS ? null : out;
}
