import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import {
  countDrawCandidates,
  getAdminGiveaway,
  listGiveawayEntries,
  listGiveawayWinners,
  listPrizeCandidates,
} from "@/lib/giveaways/admin-queries";
import { entrantName, giveawayPhase, GIVEAWAY_PHASE_LABEL_TH, openSlots, winnerState, type WinnerState } from "@/lib/giveaways/rules";
import { idSchema } from "@/lib/validation/product";
import { oneParam } from "@/lib/search-params";
import { formatBangkokDateTime, toBangkokDateTimeLocal } from "@/lib/datetime";
import { formatTHB, toHundredths } from "@/lib/pricing/calculate";
import { previewImageUrl } from "@/lib/storage/public-url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/shared/pagination";
import { GiveawayForm } from "@/components/admin/giveaway-form";
import { GiveawayDeleteButton } from "@/components/admin/giveaway-delete-button";
import { DisqualifyToggle, DrawButton } from "@/components/admin/giveaway-draw-controls";
import { cn } from "@/lib/utils";

const WINNER_STYLE: Record<WinnerState, string> = {
  PENDING: "bg-secondary text-secondary-foreground",
  CLAIMED: "bg-success/15 text-success",
  EXPIRED: "bg-destructive/10 text-destructive",
  FORFEITED: "bg-muted text-muted-foreground",
};
const WINNER_LABEL: Record<WinnerState, string> = {
  PENDING: "รอยืนยันรับ",
  CLAIMED: "รับแล้ว",
  EXPIRED: "หมดเวลา · สุ่มแทนได้",
  FORFEITED: "สละสิทธิ์ (สุ่มแทนแล้ว)",
};

export default async function EditGiveawayPage({ params, searchParams }: PageProps<"/admin/giveaways/[id]">) {
  await requireAdmin();
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const sp = await searchParams;
  const q = oneParam(sp.q)?.trim().slice(0, 100) || undefined;
  const page = Math.max(1, Math.min(10_000, Number.parseInt(oneParam(sp.page) ?? "1", 10) || 1));
  const [g, candidates, winners, entries, drawable] = await Promise.all([
    getAdminGiveaway(id),
    listPrizeCandidates(),
    listGiveawayWinners(id),
    listGiveawayEntries(id, page, q),
    countDrawCandidates(id),
  ]);
  if (!g) notFound();
  const now = new Date();
  const phase = giveawayPhase(g, now);
  const slots = g.prizes.reduce(
    (n, p) =>
      n +
      openSlots(
        p.winnerCount,
        winners.filter((w) => w.prizeId === p.id),
        now,
      ),
    0,
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/admin/giveaways" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> กิจกรรมแจกของ
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{g.titleTH}</h1>
          <p className="text-sm text-muted-foreground">
            {GIVEAWAY_PHASE_LABEL_TH[phase]} · ลงทะเบียน {g._count.entries} คน
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <a href={`/th/giveaways/${g.slug}`} target="_blank" rel="noopener">
              <ExternalLink aria-hidden /> {g.isPublished ? "ดูหน้ากิจกรรม" : "ดูตัวอย่าง"}
            </a>
          </Button>
          {!g.drawnAt && <GiveawayDeleteButton id={g.id} title={g.titleTH} entries={g._count.entries} />}
        </div>
      </div>

      {(phase === "CLOSED" || phase === "DRAWN") && (
        <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-soft md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">ผลการสุ่ม</h2>
              <p className="text-sm text-muted-foreground">
                {phase === "CLOSED"
                  ? `ปิดลงทะเบียนแล้ว · พร้อมสุ่ม ${slots} รางวัลจากผู้ลงทะเบียน ${drawable} คน`
                  : slots > 0
                    ? `มี ${slots} รางวัลที่ต้องสุ่มแทน (ผู้ชนะไม่ยืนยันรับภายใน 7 วัน)`
                    : "ผู้ชนะยืนยันรับครบแล้ว หรือยังอยู่ในเวลายืนยัน"}
              </p>
            </div>
            {(phase === "CLOSED" || slots > 0) && <DrawButton id={g.id} redraw={phase === "DRAWN"} slots={slots} candidates={drawable} />}
          </div>
          {winners.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-3 font-medium">ผู้ชนะ</th>
                    <th className="py-2 pr-3 font-medium">รางวัล</th>
                    <th className="py-2 pr-3 font-medium">สถานะ</th>
                    <th className="py-2 font-medium">ยืนยันภายใน / คำสั่งซื้อ</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {winners.map((w) => {
                    const state = winnerState(w, now);
                    const item = w.order?.items[0];
                    const substituted = item && (item.productId !== w.prize.productId || item.variantId !== w.prize.variantId);
                    return (
                      <tr key={w.id} className={cn(state === "FORFEITED" && "opacity-60")}>
                        <td className="py-2.5 pr-3">
                          <Link href={`/admin/customers/${w.entry.user.id}`} className="font-medium hover:underline">
                            {entrantName(w.entry.user.displayName, w.entry.user.email)}
                          </Link>
                          <span className="block text-xs text-muted-foreground">{w.entry.user.email}</span>
                        </td>
                        <td className="py-2.5 pr-3">
                          {w.prize.product.nameTH}
                          {w.prize.variant && <span className="text-muted-foreground"> · {w.prize.variant.nameTH}</span>}
                          <span className="block text-xs text-muted-foreground">มูลค่า {formatTHB(toHundredths(w.prizeValue))}</span>
                          {substituted && (
                            <span className="block text-xs text-brand-strong">
                              รับแทนเป็น {item.productNameTHSnapshot}
                              {item.variantNameTHSnapshot && ` · ${item.variantNameTHSnapshot}`}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", WINNER_STYLE[state])}>
                            {WINNER_LABEL[state]}
                          </span>
                        </td>
                        <td className="py-2.5 text-xs text-muted-foreground">
                          {w.order ? (
                            <Link href={`/admin/orders?q=${encodeURIComponent(w.order.orderNumber)}`} className="font-medium text-foreground hover:underline">
                              {w.order.orderNumber}
                            </Link>
                          ) : (
                            formatBangkokDateTime(w.claimDeadline)
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <GiveawayForm
        // Remount after a save or image change so the form shows what is stored.
        key={g.updatedAt.toISOString()}
        giveawayId={g.id}
        locked={g.drawnAt !== null}
        candidates={candidates}
        values={{
          slug: g.slug,
          titleTH: g.titleTH,
          titleEN: g.titleEN,
          descriptionTH: g.descriptionTH,
          descriptionEN: g.descriptionEN,
          startsAt: toBangkokDateTimeLocal(g.startsAt),
          endsAt: toBangkokDateTimeLocal(g.endsAt),
          isPublished: g.isPublished,
          imageUrl: g.imagePath ? previewImageUrl(g.imagePath) : null,
          prizes: g.prizes.map((p) => ({ productId: p.productId, variantId: p.variantId, winnerCount: p.winnerCount })),
        }}
      />

      <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-soft md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold">ผู้ลงทะเบียน</h2>
            <p className="text-sm text-muted-foreground">{g._count.entries} คน · ตัดสิทธิ์คนที่ผิดกติกาได้ก่อนสุ่ม (คนที่ถูกสุ่มแล้วเปลี่ยนไม่ได้)</p>
          </div>
          <form className="flex gap-2" role="search">
            <Input name="q" type="search" defaultValue={q} placeholder="ค้นหาอีเมลหรือชื่อ" aria-label="ค้นหาผู้ลงทะเบียน" className="h-9 w-56 rounded-xl" />
            <Button type="submit" variant="outline" size="sm" className="h-9 rounded-full">
              ค้นหา
            </Button>
          </form>
        </div>
        {entries.rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{q ? "ไม่พบผู้ลงทะเบียนที่ค้นหา" : "ยังไม่มีผู้ลงทะเบียน"}</p>
        ) : (
          <ul className="divide-y">
            {entries.rows.map((e) => {
              const name = entrantName(e.user.displayName, e.user.email);
              return (
                <li key={e.id} className={cn("flex flex-wrap items-center gap-3 py-2.5 text-sm", e.disqualifiedAt && "text-muted-foreground")}>
                  <span className="min-w-0 flex-1">
                    <Link href={`/admin/customers/${e.user.id}`} className="font-medium hover:underline">
                      {name}
                    </Link>
                    <span className="block truncate text-xs text-muted-foreground">
                      {e.user.email} · ลงทะเบียน {formatBangkokDateTime(e.createdAt)}
                    </span>
                  </span>
                  {e.winner ? (
                    <span className="rounded-full bg-primary/25 px-2 py-0.5 text-xs font-medium text-foreground">ผู้ชนะ</span>
                  ) : (
                    <>
                      {e.disqualifiedAt && <span className="rounded-full bg-muted px-2 py-0.5 text-xs">ถูกตัดสิทธิ์</span>}
                      <DisqualifyToggle entryId={e.id} disqualified={e.disqualifiedAt !== null} name={name} />
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {entries.pageCount > 1 && <Pagination page={page} pageCount={entries.pageCount} params={{ q }} basePath={`/admin/giveaways/${g.id}`} />}
      </section>
    </div>
  );
}
