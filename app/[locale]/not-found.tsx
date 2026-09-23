import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const t = useTranslations("common.state");
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <p className="text-5xl font-bold text-brand-strong">404</p>
      <h1 className="text-xl font-semibold">{t("notFound")}</h1>
      <Button asChild className="rounded-full">
        <Link href="/">{t("backHome")}</Link>
      </Button>
    </div>
  );
}
