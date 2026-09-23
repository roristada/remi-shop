import { getTranslations, setRequestLocale } from "next-intl/server";
import { Brush, Layers, Palette, Sparkles } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");

  return (
    <>
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_20%_10%,var(--secondary),transparent),radial-gradient(50%_45%_at_85%_20%,var(--accent),transparent)]"
        />
        <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-20 text-center sm:py-28">
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <Sparkles className="size-3.5 text-brand-strong" aria-hidden />
            {t("hero.eyebrow")}
          </span>
          <h1 className="max-w-2xl text-3xl leading-tight font-bold text-balance sm:text-5xl">
            {t("hero.title")}
          </h1>
          <p className="max-w-xl text-base text-pretty text-muted-foreground sm:text-lg">
            {t("hero.subtitle")}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="h-11 rounded-full px-6 shadow-soft">
              <Link href="/shop">{t("hero.cta")}</Link>
            </Button>
            <Button asChild size="lg" variant="secondary" className="h-11 rounded-full px-6">
              <Link href="/category">{t("hero.secondary")}</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[Brush, Layers, Palette, Sparkles].map((Icon, i) => (
            <div
              key={i}
              className="flex aspect-[4/3] flex-col items-center justify-center gap-3 rounded-2xl border bg-card shadow-soft"
            >
              <span className="grid size-12 place-items-center rounded-full bg-secondary">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="text-sm text-muted-foreground">{t("comingSoon")}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
