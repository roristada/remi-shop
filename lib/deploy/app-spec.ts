/**
 * Fills `${KEY}` placeholders in the App Platform spec template. Each value is written as a YAML
 * double-quoted string (JSON strings are valid YAML), so `<`, `#`, `:` and quotes survive. Throws
 * listing every key with no value, so a deploy never goes out with an empty secret.
 */
export function renderAppSpec(template: string, lookup: (key: string) => string | undefined): string {
  const missing = new Set<string>();
  const out = template.replace(/\$\{([A-Z0-9_]+)\}/g, (_match, key: string) => {
    const value = lookup(key);
    if (!value) {
      missing.add(key);
      return "";
    }
    return JSON.stringify(value);
  });
  if (missing.size > 0) throw new Error(`Missing values for: ${[...missing].join(", ")}`);
  return out;
}
