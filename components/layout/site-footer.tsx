import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { listContactChannels } from "@/lib/contacts/queries";
import { ContactLinksCompact } from "@/components/shop/contact-links";

export async function SiteFooter() {
  const t = await getTranslations("common");
  // Renders on every page: a database hiccup hides the contact column instead of failing the page.
  const channels = await listContactChannels().catch((error: unknown) => {
    console.error("Footer contact channels failed", { error });
    return [];
  });
  const year = new Date().getFullYear();

  const groups = [
    {
      title: t("footer.shop"),
      links: [
        { href: "/shop", label: t("nav.shop") },
        { href: "/category", label: t("nav.categories") },
      ],
    },
    // Help (FAQ, about) and legal (terms, privacy, refund) columns return
    // once those pages exist; linking them now leads to 404s.
  ];

  return (
    <footer className="border-t bg-muted/40">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 md:grid-cols-4">
        <div className="space-y-2">
          <p className="font-bold">{t("brand")}</p>
          <p className="text-sm text-muted-foreground">{t("footer.tagline")}</p>
        </div>
        {groups.map((g) => (
          <div key={g.title} className="space-y-3">
            <p className="text-sm font-semibold">{g.title}</p>
            <ul className="space-y-2">
              {g.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-muted-foreground hover:text-foreground">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {channels.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-semibold">
              <Link href="/contact" className="hover:underline">
                {t("footer.contact")}
              </Link>
            </p>
            <ContactLinksCompact channels={channels} />
          </div>
        )}
      </div>
      <div className="border-t py-4 text-center text-xs text-muted-foreground">
        © {year} {t("brand")}. {t("footer.rights")}.
      </div>
    </footer>
  );
}
