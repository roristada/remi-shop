import { getLocale, getTranslations } from "next-intl/server";
import { LogOut } from "lucide-react";
import { logout } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";

export async function LogoutButton() {
  const [t, locale] = await Promise.all([getTranslations("auth"), getLocale()]);
  return (
    <form action={logout}>
      <input type="hidden" name="locale" value={locale} />
      <Button type="submit" variant="ghost" className="w-full justify-start rounded-xl text-muted-foreground">
        <LogOut aria-hidden />
        {t("logout")}
      </Button>
    </form>
  );
}
