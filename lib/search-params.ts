// Query-string helpers for filters that take several values (`?status=A&status=B`).

export type SearchParams = Record<string, string | string[] | undefined>;

/** A key's single value; a repeated key counts as no value. */
export function oneParam(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Every value of a (possibly repeated) key that `accept` allows, deduplicated and capped at `max`. */
export function manyParam<T extends string>(
  value: string | string[] | undefined,
  accept: (v: string) => v is T,
  max = 50,
): T[] {
  const values = value === undefined ? [] : Array.isArray(value) ? value : [value];
  return [...new Set(values.filter(accept))].slice(0, max);
}

/** `URLSearchParams` as a record that keeps repeated keys (Object.fromEntries keeps only the last). */
export function toSearchParams(params: URLSearchParams): SearchParams {
  const out: SearchParams = {};
  for (const key of new Set(params.keys())) {
    const all = params.getAll(key);
    out[key] = all.length > 1 ? all : all[0];
  }
  return out;
}

/** Record → query string (no leading "?"); empty values are dropped and arrays repeat the key. */
export function toQueryString(params: Record<string, string | readonly string[] | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (!value) continue;
    if (typeof value === "string") qs.set(key, value);
    else for (const v of value) qs.append(key, v);
  }
  return qs.toString();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (v: string): v is string => UUID.test(v);
