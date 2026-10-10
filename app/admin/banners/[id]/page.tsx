import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guards";
import { getAdminBanner } from "@/lib/banners/queries";
import { idSchema } from "@/lib/validation/product";
import { toBangkokDateTimeLocal } from "@/lib/datetime";
import { previewImageUrl } from "@/lib/storage/public-url";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { BannerForm } from "@/components/admin/banner-form";

export default async function EditBannerPage({ params }: PageProps<"/admin/banners/[id]">) {
  await requireAdmin();
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const b = await getAdminBanner(id);
  if (!b) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/admin/banners" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> แบนเนอร์และประกาศ
      </Link>
      <h1 className="text-2xl font-bold">แก้ไขแบนเนอร์</h1>
      <BannerForm
        // Remount after a save or image change so the form shows what is stored.
        key={b.updatedAt.toISOString()}
        bannerId={b.id}
        values={{
          titleTH: b.titleTH,
          titleEN: b.titleEN,
          descriptionTH: b.descriptionTH ?? "",
          descriptionEN: b.descriptionEN ?? "",
          ctaTH: b.ctaTH ?? "",
          ctaEN: b.ctaEN ?? "",
          link: b.link ?? "",
          theme: b.theme,
          imageFocusX: b.imageFocusX,
          imageFocusY: b.imageFocusY,
          startAt: toBangkokDateTimeLocal(b.startAt),
          endAt: toBangkokDateTimeLocal(b.endAt),
          isActive: b.isActive,
          imageUrl: b.imagePath ? previewImageUrl(b.imagePath) : null,
        }}
      />
    </div>
  );
}
