"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Eye, FilePen, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { runWithToast } from "@/components/admin/form-controls";
import { deleteProduct, setPublishStatus } from "@/lib/products/admin-actions";
import type { PublishStatus } from "@/lib/generated/prisma/enums";

export function PublishControls({
  productId,
  publishStatus,
  hasOrders,
}: {
  productId: string;
  publishStatus: PublishStatus;
  hasOrders: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const change = (target: PublishStatus) =>
    startTransition(async () => {
      if (await runWithToast(() => setPublishStatus(productId, target))) router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="กำลังบันทึก" />}
      {publishStatus !== "PUBLISHED" && (
        <Button disabled={pending} onClick={() => change("PUBLISHED")} className="rounded-full">
          <Eye aria-hidden /> เผยแพร่
        </Button>
      )}
      {publishStatus !== "DRAFT" && (
        <Button variant="outline" disabled={pending} onClick={() => change("DRAFT")} className="rounded-full">
          <FilePen aria-hidden /> เปลี่ยนเป็นฉบับร่าง
        </Button>
      )}
      {publishStatus !== "DISABLED" && (
        <ConfirmDialog
          trigger={
            <Button variant="outline" disabled={pending} className="rounded-full">
              <Ban aria-hidden /> ปิดการขาย
            </Button>
          }
          title="ปิดการขายสินค้านี้?"
          description="ลูกค้าจะซื้อไม่ได้ แต่ผู้ที่ซื้อแล้วยังดาวน์โหลดได้ตามปกติ"
          confirmLabel="ปิดการขาย"
          onConfirm={async () => {
            const done = await runWithToast(() => setPublishStatus(productId, "DISABLED"));
            if (done) router.refresh();
            return done;
          }}
        />
      )}
      {!hasOrders && (
        <ConfirmDialog
          trigger={
            <Button variant="destructive" disabled={pending} className="rounded-full">
              <Trash2 aria-hidden /> ลบ
            </Button>
          }
          title="ลบสินค้าถาวร?"
          description="ข้อมูล รูปภาพ เวอร์ชัน และไฟล์ทั้งหมดจะถูกลบ และกู้คืนไม่ได้"
          confirmLabel="ลบถาวร"
          destructive
          onConfirm={() => runWithToast(() => deleteProduct(productId))}
        />
      )}
    </div>
  );
}
