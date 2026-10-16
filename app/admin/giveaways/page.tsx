import Link from "next/link";
import { Gift, ImageOff, Pencil, Plus } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { listAdminGiveaways } from "@/lib/giveaways/admin-queries";
import { giveawayPhase, GIVEAWAY_PHASE_LABEL_TH, type GiveawayPhase } from "@/lib/giveaways/rules";
import { formatBangkokDateTime } from "@/lib/datetime";
import { previewImageUrl } from "@/lib/storage/public-url";
import { Button } from "@/components/ui/button";
import { PreviewImage } from "@/components/shared/preview-image";
import { cn } from "@/lib/utils";

const PHASE_STYLE: Record<GiveawayPhase, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  UPCOMING: "bg-secondary text-secondary-foreground",
  OPEN: "bg-success/15 text-success",
  CLOSED: "bg-primary/30 text-foreground",
  DRAWN: "bg-muted text-foreground",
};

export default async function AdminGiveawaysPage() {
  await requireAdmin();
  const giveaways = await listAdminGiveaways();
  const now = new Date();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">กิจกรรมแจกของ</h1>
          <p className="text-sm text-muted-foreground">ลูกค้าลงทะเบียนฟรี 1 คน 1 สิทธิ์ ปิดลงทะเบียนแล้วกดสุ่มผู้โชคดี ผู้ชนะยืนยันรับรางวัลภายใน 7 วัน</p>
        </div>
        <Button asChild className="h-10 rounded-full px-5">
          <Link href="/admin/giveaways/new">
            <Plus aria-hidden /> สร้างกิจกรรม
          </Link>
        </Button>
      </div>

      <section className="rounded-2xl border bg-card p-4 shadow-soft md:p-6">
        {giveaways.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <Gift className="size-6 text-muted-foreground" aria-hidden />
            <p className="font-medium">ยังไม่มีกิจกรรม</p>
            <p className="text-sm text-muted-foreground">สร้างกิจกรรมแรก เลือกรางวัลจากสินค้าในร้าน แล้วเผยแพร่ให้ลูกค้าลงทะเบียน</p>
          </div>
        ) : (
          <ul className="divide-y">
            {giveaways.map((g) => {
              const phase = giveawayPhase(g, now);
              return (
                <li key={g.id} className="flex flex-wrap items-center gap-4 py-3 sm:flex-nowrap">
                  <span className="relative grid aspect-[4/3] w-24 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted">
                    {g.imagePath ? (
                      <PreviewImage src={previewImageUrl(g.imagePath)} alt="" fill sizes="96px" className="object-cover" />
                    ) : (
                      <ImageOff className="size-5 text-muted-foreground" aria-hidden />
                    )}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate font-medium">{g.titleTH}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className={cn("mr-2 inline-flex rounded-full px-2 py-0.5 font-medium", PHASE_STYLE[phase])}>
                        {GIVEAWAY_PHASE_LABEL_TH[phase]}
                      </span>
                      {formatBangkokDateTime(g.startsAt)} – {formatBangkokDateTime(g.endsAt)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ลงทะเบียน {g._count.entries} คน{g.drawnAt && ` · รับรางวัลแล้ว ${g._count.winners} คน`}
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm" className="rounded-full">
                    <Link href={`/admin/giveaways/${g.id}`}>
                      <Pencil aria-hidden /> จัดการ
                    </Link>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
