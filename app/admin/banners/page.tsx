import Link from "next/link";
import { GalleryHorizontal, Pencil, Plus } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { getAnnouncementBarSettings, listAdminBanners, MAX_LIVE_BANNERS } from "@/lib/banners/queries";
import { bannerState, BANNER_STATE_LABEL_TH, type BannerState } from "@/lib/banners/rules";
import { formatBangkokDateTime } from "@/lib/datetime";
import { previewImageUrl } from "@/lib/storage/public-url";
import { Button } from "@/components/ui/button";
import { AnnouncementBarForm } from "@/components/admin/announcement-bar-form";
import { BannerRowActions } from "@/components/admin/banner-row-actions";
import { BannerCard } from "@/components/shop/banner-card";
import { cn } from "@/lib/utils";

const STATE_STYLE: Record<BannerState, string> = {
  LIVE: "bg-success/15 text-success",
  SCHEDULED: "bg-secondary text-secondary-foreground",
  ENDED: "bg-muted text-muted-foreground",
  OFF: "bg-muted text-muted-foreground",
};

export default async function AdminBannersPage() {
  await requireAdmin();
  const [banners, bar] = await Promise.all([listAdminBanners(), getAnnouncementBarSettings()]);
  const now = new Date();
  const liveCount = banners.filter((b) => bannerState(b, now) === "LIVE").length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">แบนเนอร์และประกาศ</h1>
        <p className="text-sm text-muted-foreground">แถบประกาศและแบนเนอร์โปรโมชันแบบเลื่อนบนหน้าแรก</p>
      </div>

      <AnnouncementBarForm values={bar} />

      <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-soft md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">แบนเนอร์โปรโมชัน</h2>
            <p className="text-sm text-muted-foreground">
              แสดงเรียงตามลำดับนี้ สูงสุด {MAX_LIVE_BANNERS} ใบพร้อมกัน · ตอนนี้แสดงอยู่ {liveCount} ใบ
              {liveCount === 0 && " (หน้าแรกจะแสดงส่วนหัวแบบเดิมแทน)"}
            </p>
          </div>
          <Button asChild className="h-10 rounded-full px-5">
            <Link href="/admin/banners/new">
              <Plus aria-hidden /> สร้างแบนเนอร์
            </Link>
          </Button>
        </div>

        {banners.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed px-4 py-12 text-center">
            <GalleryHorizontal className="size-6 text-muted-foreground" aria-hidden />
            <p className="font-medium">ยังไม่มีแบนเนอร์</p>
            <p className="text-sm text-muted-foreground">สร้างแบนเนอร์แรกเพื่อแสดงเป็นการ์ดเลื่อนบนหน้าแรก</p>
          </div>
        ) : (
          <ul className="divide-y">
            {banners.map((b, i) => {
              const state = bannerState(b, now);
              return (
                <li key={b.id} className="flex flex-wrap items-center gap-4 py-3 sm:flex-nowrap">
                  <div className="w-44 shrink-0 overflow-hidden rounded-xl" style={{ aspectRatio: "920 / 340" }}>
                    <BannerCard
                      className="pointer-events-none [&_p]:text-[0.7rem]! [&_span]:hidden"
                      banner={{
                        id: b.id,
                        title: b.titleTH,
                        tag: null,
                        cta: null,
                        theme: b.theme,
                        imageUrl: b.imagePath ? previewImageUrl(b.imagePath) : null,
                        focusX: b.imageFocusX,
                        focusY: b.imageFocusY,
                      }}
                    />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate font-medium">{b.titleTH.replace(/\s*\n\s*/g, " ")}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className={cn("mr-2 inline-flex rounded-full px-2 py-0.5 font-medium", STATE_STYLE[state])}>
                        {BANNER_STATE_LABEL_TH[state]}
                      </span>
                      {b.startAt || b.endAt
                        ? `${b.startAt ? formatBangkokDateTime(b.startAt) : "ทันที"} – ${b.endAt ? formatBangkokDateTime(b.endAt) : "ไม่มีกำหนด"}`
                        : "ไม่มีกำหนดเวลา"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <BannerRowActions id={b.id} title={b.titleTH} first={i === 0} last={i === banners.length - 1} />
                    <Button asChild variant="outline" size="sm" className="rounded-full">
                      <Link href={`/admin/banners/${b.id}`}>
                        <Pencil aria-hidden /> แก้ไข
                      </Link>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
