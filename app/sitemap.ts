import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { publicEnv } from "@/lib/env";
import { routing } from "@/i18n/routing";
import { listShopCategories, listSitemapProducts } from "@/lib/products/storefront-queries";

function entry(path: string, lastModified?: Date): MetadataRoute.Sitemap[number] {
  const site = publicEnv.NEXT_PUBLIC_SITE_URL;
  return {
    url: `${site}/${routing.defaultLocale}${path}`,
    lastModified,
    alternates: { languages: Object.fromEntries(routing.locales.map((l) => [l, `${site}/${l}${path}`])) },
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection(); // Per request: builds may run without database access.
  const [categories, products] = await Promise.all([listShopCategories(), listSitemapProducts()]);
  return [
    entry(""),
    entry("/shop"),
    entry("/category"),
    ...categories.map((c) => entry(`/category/${c.slug}`)),
    ...products.map((p) => entry(`/product/${p.slug}`, p.updatedAt)),
  ];
}
