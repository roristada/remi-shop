/** Picks the English field for `en`, falling back to Thai when the English text is empty. */
export function localized<T extends string | null | undefined>(locale: string, th: T, en: T): T {
  if (locale === "en" && en && en.trim() !== "") return en;
  return th;
}

/** Intl locale tags for display. Thai keeps Gregorian years, matching the admin UI. */
export function intlLocale(locale: string): { number: string; date: string } {
  return locale === "en" ? { number: "en-US", date: "en-GB" } : { number: "th-TH", date: "th-TH-u-ca-gregory" };
}
