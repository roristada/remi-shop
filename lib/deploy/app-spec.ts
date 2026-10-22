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

/**
 * Looks a key up in the shell first, then each env file in order. `shellOnly` keys never fall back
 * to the files: a local `.env` holds `NEXT_PUBLIC_SITE_URL=http://localhost:3000`, which would
 * otherwise be baked into a production build without any error.
 */
export function envLookup(
  shell: Record<string, string | undefined>,
  files: Record<string, string>[],
  shellOnly: string[],
): (key: string) => string | undefined {
  return (key) => {
    if (shell[key] !== undefined || shellOnly.includes(key)) return shell[key];
    return files.find((file) => file[key] !== undefined)?.[key];
  };
}
