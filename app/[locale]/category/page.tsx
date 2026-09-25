import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronRight, Shapes } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { localized } from "@/i18n/localize";
import { listShopCategories } from "@/lib/products/storefront-queries";
import { PageHeading } from "@/components/shop/page-heading";

export async function generateMetadata({ params }: PageProps<"/[locale]/category">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "shop.meta" });
  return {
    title: t("categoriesTitle"),
    description: t("categoriesDescription"),
    alternates: { canonical: `/${locale}/category`, languages: { th: "/th/category", en: "/en/category" } },
  };
}

export default async function CategoriesPage({ params }: PageProps<"/[locale]/category">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await connection(); // Product counts depend on the current time (sale windows).
  const t = await getTranslations("shop.categories");
  const categories = await listShopCategories();

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:py-12">
      <PageHeading title={t("title")} subtitle={t("subtitle")} />
      {categories.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card px-4 py-16 text-center text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => {
            const description = localized(locale, c.descriptionTH, c.descriptionEN);
            return (
              <li key={c.id}>
                <Link
                  href={`/category/${c.slug}`}
                  className="group flex h-full items-center gap-4 rounded-2xl border bg-card p-4 shadow-soft transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="grid size-12 shrink-0 place-items-center rounded-full bg-secondary">
                    <Shapes className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{localized(locale, c.nameTH, c.nameEN)}</span>
                    {description && <span className="line-clamp-2 text-sm text-muted-foreground">{description}</span>}
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {t("productCount", { count: c._count.products })}
                    </span>
                  </span>
                  <ChevronRight
                    className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
