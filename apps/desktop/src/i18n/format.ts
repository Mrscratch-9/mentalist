import type { UiLang } from "./strings";

const LOCALES: Record<UiLang, string> = { es: "es-MX", en: "en-US" };

export const localeOf = (lang: UiLang): string => LOCALES[lang];

export const formatNumber = (lang: UiLang, n: number): string => new Intl.NumberFormat(localeOf(lang)).format(n);

/** Long date for an ISO `YYYY-MM-DD` (read as UTC so the day never shifts); anything else is returned as given. */
export function formatDate(lang: UiLang, iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(localeOf(lang), { dateStyle: "long", timeZone: "UTC" }).format(d);
}
