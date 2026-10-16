import { permanentRedirect } from "next/navigation";

// The category list now lives on the home page; old links land on that section.
export default async function CategoriesPage({ params }: PageProps<"/[locale]/category">) {
  const { locale } = await params;
  permanentRedirect(`/${locale}#categories`);
}
