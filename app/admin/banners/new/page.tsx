import { requireAdmin } from "@/lib/auth/guards";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { BannerForm, EMPTY_BANNER } from "@/components/admin/banner-form";

export default async function NewBannerPage() {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/admin/banners" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> แบนเนอร์และประกาศ
      </Link>
      <h1 className="text-2xl font-bold">สร้างแบนเนอร์</h1>
      <BannerForm bannerId={null} values={EMPTY_BANNER} />
    </div>
  );
}
