import { BadgeCheck, Languages, Lock, RefreshCw } from "lucide-react";
import { getTranslations } from "next-intl/server";

const ITEMS = [
  { key: "secureFiles", icon: Lock },
  { key: "verifiedPayment", icon: BadgeCheck },
  { key: "lifetimeUpdates", icon: RefreshCw },
  { key: "bilingual", icon: Languages },
] as const;

/** Four true capabilities, not marketing copy — every line must stay accurate to how the store actually works. */
export async function TrustBar() {
  const t = await getTranslations("home.trust");

  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 sm:gap-6">
      {ITEMS.map(({ key, icon: Icon }) => (
        <li key={key} className="flex flex-col items-center gap-2 text-center sm:flex-row sm:text-left">
          <Icon className="size-5 shrink-0 text-brand-strong" aria-hidden />
          <span className="text-sm text-foreground/85">{t(key)}</span>
        </li>
      ))}
    </ul>
  );
}
