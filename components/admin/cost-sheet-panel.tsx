"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormSection, TextInput, useResultToast } from "@/components/admin/form-controls";
import type { ActionResult } from "@/lib/actions/result";
import { syncCosts, updateCostSettings } from "@/lib/costs/actions";
import type { CostSyncReport } from "@/lib/costs/service";

type Props = {
  sheetUrl: string;
  rate: string;
  syncedAt: string | null;
};

/** Cost sheet link, exchange rate and the manual "pull from the sheet" button. */
export function CostSheetPanel({ sheetUrl, rate, syncedAt }: Props) {
  const router = useRouter();
  const [state, setState] = useState<ActionResult | null>(null);
  const [report, setReport] = useState<CostSyncReport | null>(null);
  const [saving, startSave] = useTransition();
  const [syncing, startSync] = useTransition();
  useResultToast(state);
  const err = (name: string) => (state && !state.ok ? state.fieldErrors?.[name] : undefined);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startSave(async () => {
      setState(await updateCostSettings(state, formData));
      router.refresh();
    });
  }

  function sync() {
    startSync(async () => {
      const result = await syncCosts();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setReport(result.data);
      toast.success(result.message ?? "ดึงข้อมูลแล้ว");
      router.refresh();
    });
  }

  return (
    <FormSection
      title="ข้อมูลต้นทุนจาก Google Sheet"
      description="แต่ละแท็บของชีตตั้งชื่อตรงกับชื่อโฟลเดอร์ ระบบจับคู่สินค้าจากชื่ออังกฤษหรือชื่อจีน ต้นทุนของออเดอร์ถูกบันทึกตอนชำระเงินสำเร็จ แก้ชีตหรือเรทภายหลังไม่ย้อนไปเปลี่ยนออเดอร์เก่า"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={sync} disabled={syncing} aria-busy={syncing} className="h-10 rounded-full px-5">
          {syncing ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />} ดึงข้อมูลจาก Sheet
        </Button>
        <span className="text-sm text-muted-foreground">{syncedAt ? `ดึงล่าสุด ${syncedAt}` : "ยังไม่เคยดึงข้อมูล"}</span>
      </div>
      {report && (
        <ul className="space-y-0.5 rounded-xl bg-muted/60 px-4 py-3 text-sm">
          <li>
            อ่าน {report.tabsRead} แท็บ ได้ {report.rows.toLocaleString("th-TH")} แถว
            {report.skippedRows > 0 && ` · ข้าม ${report.skippedRows} แถว (ราคาไม่ใช่ตัวเลข)`}
          </li>
          <li>เติมต้นทุนให้รายการในออเดอร์ที่ชำระแล้ว {report.filledLines.toLocaleString("th-TH")} รายการ</li>
          <li>สินค้าที่ยังไม่พบต้นทุน {report.unmatchedProducts.toLocaleString("th-TH")} รายการ (ดูรายชื่อด้านล่าง)</li>
          {report.missingTabs.length > 0 && <li className="text-warning">ไม่พบแท็บของโฟลเดอร์: {report.missingTabs.join(", ")}</li>}
          {report.conflicts.length > 0 && (
            <li className="text-warning">ชื่อเดียวกันมีมากกว่า 2 ราคา (ควรแก้ในชีต): {report.conflicts.join(", ")}</li>
          )}
        </ul>
      )}
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end" noValidate>
        <TextInput label="ลิงก์ Google Sheet (แชร์แบบ “ทุกคนที่มีลิงก์ดูได้”)" name="sheet" defaultValue={sheetUrl} error={err("sheet")} />
        <TextInput label="เรท (บาท / 1 หยวน)" name="rate" inputMode="decimal" defaultValue={rate} error={err("rate")} />
        <Button type="submit" variant="outline" disabled={saving} aria-busy={saving} className="h-10 rounded-full px-5">
          {saving && <Loader2 className="animate-spin" aria-hidden />} บันทึก
        </Button>
      </form>
    </FormSection>
  );
}
