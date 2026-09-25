"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Loader2, QrCode, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormSection, TextArea, TextInput, runWithToast, useResultToast } from "@/components/admin/form-controls";
import { useDirectUpload } from "@/components/admin/use-direct-upload";
import type { ActionResult } from "@/lib/actions/result";
import { confirmQrUpload, removeQrImage, requestQrUpload, updatePaymentSettings } from "@/lib/payments/settings-actions";
import { acceptAttribute, IMAGE_FILE_TYPES } from "@/lib/storage/file-types";

type Values = {
  promptPayName: string;
  promptPayNumber: string;
  instructionsTH: string;
  instructionsEN: string;
  qrImageUrl: string | null;
};

export function PaymentSettingsForm({ values }: { values: Values }) {
  const router = useRouter();
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const { upload, uploading } = useDirectUpload(requestQrUpload, confirmQrUpload);
  useResultToast(state);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => setState(await updatePaymentSettings(state, formData)));
  }

  const err = (name: string) => (state && !state.ok ? state.fieldErrors?.[name] : undefined);

  return (
    <div className="space-y-6">
      <FormSection title="QR PromptPay" description="ลูกค้าจะเห็นรูปนี้ในหน้าคำสั่งซื้อที่รอชำระเงิน (JPG, PNG, WEBP ไม่เกิน 5 MB)">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative grid size-40 place-items-center overflow-hidden rounded-xl border bg-white">
            {values.qrImageUrl ? (
              <Image src={values.qrImageUrl} alt="QR PromptPay ปัจจุบัน" fill sizes="160px" className="object-contain p-2" />
            ) : (
              <QrCode className="size-8 text-muted-foreground" aria-hidden />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input
              ref={fileRef}
              type="file"
              accept={acceptAttribute(IMAGE_FILE_TYPES)}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={async (e) => {
                const files = e.target.files;
                if (files?.length && (await upload([files[0]]))) router.refresh();
                e.target.value = "";
              }}
            />
            <Button type="button" variant="outline" className="rounded-full" disabled={Boolean(uploading)} onClick={() => fileRef.current?.click()}>
              {uploading ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
              {values.qrImageUrl ? "เปลี่ยนรูป QR" : "อัปโหลดรูป QR"}
            </Button>
            {values.qrImageUrl && (
              <Button
                type="button"
                variant="ghost"
                className="rounded-full text-destructive"
                onClick={async () => {
                  if (await runWithToast(removeQrImage)) router.refresh();
                }}
              >
                <Trash2 aria-hidden /> ลบรูป QR
              </Button>
            )}
          </div>
        </div>
      </FormSection>

      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        <FormSection title="บัญชีรับเงิน" description="แสดงคู่กับ QR ให้ลูกค้าตรวจสอบก่อนโอน">
          <div className="grid gap-4 md:grid-cols-2">
            <TextInput label="ชื่อบัญชี" name="promptPayName" defaultValue={values.promptPayName} maxLength={100} error={err("promptPayName")} />
            <TextInput
              label="หมายเลข PromptPay"
              name="promptPayNumber"
              defaultValue={values.promptPayNumber}
              inputMode="numeric"
              maxLength={20}
              hint="เบอร์โทร 10 หลัก, เลขประจำตัว 13 หลัก หรือ e-Wallet 15 หลัก"
              error={err("promptPayNumber")}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <TextArea label="คำแนะนำการชำระเงิน (TH)" name="instructionsTH" defaultValue={values.instructionsTH} rows={4} maxLength={1000} error={err("instructionsTH")} />
            <TextArea label="คำแนะนำการชำระเงิน (EN)" name="instructionsEN" defaultValue={values.instructionsEN} rows={4} maxLength={1000} error={err("instructionsEN")} />
          </div>
        </FormSection>
        <div className="flex justify-end">
          <Button type="submit" className="h-10 rounded-full px-6" disabled={pending} aria-busy={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden />} บันทึก
          </Button>
        </div>
      </form>
    </div>
  );
}
