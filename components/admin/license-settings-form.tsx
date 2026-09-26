"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormSection, TextInput, useResultToast } from "@/components/admin/form-controls";
import type { ActionResult } from "@/lib/actions/result";
import { updateLicenseSettings } from "@/lib/licenses/admin-actions";
import { LICENSE_PAYMENT_DAYS_MAX, LICENSE_PAYMENT_DAYS_MIN } from "@/lib/licenses/rules";

export function LicenseSettingsForm({ licensePaymentDays }: { licensePaymentDays: number }) {
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  useResultToast(state);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => setState(await updateLicenseSettings(state, formData)));
  }

  return (
    <FormSection
      title="Commercial license"
      description="เวลาที่ลูกค้ามีให้ชำระเงินหลังอนุมัติคำขอ ถ้าไม่แนบสลิปภายในเวลานี้ คำสั่งซื้อจะถูกยกเลิก ใช้กับคำขอที่อนุมัติหลังบันทึกเท่านั้น"
    >
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3" noValidate>
        <TextInput
          label="ชำระเงินภายใน (วัน)"
          name="licensePaymentDays"
          type="number"
          min={LICENSE_PAYMENT_DAYS_MIN}
          max={LICENSE_PAYMENT_DAYS_MAX}
          defaultValue={licensePaymentDays}
          wrapperClassName="w-44"
          error={state && !state.ok ? state.fieldErrors?.licensePaymentDays : undefined}
        />
        <Button type="submit" disabled={pending} aria-busy={pending} className="h-10 rounded-full px-5">
          {pending && <Loader2 className="animate-spin" aria-hidden />} บันทึก
        </Button>
      </form>
    </FormSection>
  );
}
