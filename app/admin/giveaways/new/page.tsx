import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { listPrizeCandidates } from "@/lib/giveaways/admin-queries";
import { EMPTY_GIVEAWAY, GiveawayForm } from "@/components/admin/giveaway-form";

export default async function NewGiveawayPage() {
  await requireAdmin();
  const candidates = await listPrizeCandidates();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/admin/giveaways" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> กิจกรรมแจกของ
      </Link>
      <h1 className="text-2xl font-bold">สร้างกิจกรรม</h1>
      <GiveawayForm giveawayId={null} values={EMPTY_GIVEAWAY} candidates={candidates} locked={false} />
    </div>
  );
}
