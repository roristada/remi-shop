import { getTranslations } from "next-intl/server";
import {
  AtSign,
  Camera,
  Globe,
  Mail,
  MessageCircle,
  MessagesSquare,
  Music,
  Phone,
  Play,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ContactChannelType } from "@/lib/generated/prisma/enums";
import { contactHref } from "@/lib/contacts/rules";
import type { ContactChannelView } from "@/lib/contacts/queries";
import { cn } from "@/lib/utils";

/** Generic icons: the icon set has no brand logos, so the type name is always shown next to it. */
const ICONS: Record<ContactChannelType, LucideIcon> = {
  LINE: MessageCircle,
  FACEBOOK: Users,
  INSTAGRAM: Camera,
  X: AtSign,
  TIKTOK: Music,
  YOUTUBE: Play,
  DISCORD: MessagesSquare,
  EMAIL: Mail,
  PHONE: Phone,
  WEBSITE: Globe,
};

/** Web links open in a new tab; mailto/tel stay in place. */
function linkProps(c: ContactChannelView) {
  const external = c.type !== "EMAIL" && c.type !== "PHONE";
  return { href: contactHref(c.type, c.value), ...(external && { target: "_blank", rel: "noopener noreferrer" }), external };
}

/** Compact list for the footer. */
export async function ContactLinksCompact({ channels }: { channels: ContactChannelView[] }) {
  const t = await getTranslations("common.contact");
  return (
    <ul className="space-y-2">
      {channels.map((c) => {
        const Icon = ICONS[c.type];
        const { external, ...props } = linkProps(c);
        return (
          <li key={c.id}>
            <a {...props} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="sr-only">{t(`types.${c.type}`)}: </span>
              <span className="break-all">{c.label}</span>
              {external && <span className="sr-only"> {t("opensInNewTab")}</span>}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/** Card grid for the contact page. */
export async function ContactLinkCards({ channels, className }: { channels: ContactChannelView[]; className?: string }) {
  const t = await getTranslations("common.contact");
  return (
    <ul className={cn("grid gap-3 sm:grid-cols-2", className)}>
      {channels.map((c) => {
        const Icon = ICONS[c.type];
        const { external, ...props } = linkProps(c);
        return (
          <li key={c.id}>
            <a
              {...props}
              className="flex h-full items-center gap-4 rounded-2xl border bg-card p-4 shadow-soft transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-xs text-muted-foreground">{t(`types.${c.type}`)}</span>
                <span className="block font-medium break-all">{c.label}</span>
              </span>
              {external && <span className="sr-only">{t("opensInNewTab")}</span>}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
