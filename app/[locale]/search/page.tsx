import { redirect } from "@/i18n/navigation";

/** Header search icon target. Search lives on /shop. */
export default async function SearchPage({ params, searchParams }: PageProps<"/[locale]/search">) {
  const { locale } = await params;
  const q = (await searchParams).q;
  const query = typeof q === "string" && q.trim() ? { q: q.trim().slice(0, 100) } : undefined;
  redirect({ href: { pathname: "/shop", query }, locale });
}
