import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { HalloweenGhost } from "@/components/layout/seasonal-decor";
import { activeSeason } from "@/lib/seasonal";

export default function NotFound() {
  const t = useTranslations("common");
  const halloween = activeSeason() === "halloween";
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      {halloween && <HalloweenGhost className="size-24" />}
      <p className="text-5xl font-bold text-brand-strong">404</p>
      <h1 className="text-xl font-semibold">{halloween ? t("halloween.notFound") : t("state.notFound")}</h1>
      <Button asChild className="rounded-full">
        <Link href="/">{t("state.backHome")}</Link>
      </Button>
    </div>
  );
}
