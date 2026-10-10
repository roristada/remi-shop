"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TextArea, TextInput } from "@/components/admin/form-controls";
import { requestLicenseChanges } from "@/lib/licenses/admin-actions";
import { LICENSE_MESSAGE_MAX } from "@/lib/licenses/rules";
import type { FieldErrors } from "@/lib/validation/auth";

const QUICK_MESSAGES = [
  "กรุณาแนบรูปผลงานที่ใช้สินค้านี้",
  "ข้อมูลช่องทางติดต่อไม่ครบ กรุณาระบุเพิ่ม",
  "กรุณาระบุรายละเอียดการใช้งานเพิ่มเติม เช่น จำนวนที่ผลิต",
] as const;

type Props = {
  requestId: string;
  /** Current total as typed baht ("500" / "499.50"). */
  currentTotal: string;
  currentTotalLabel: string;
  /** Questions (and the artwork) the admin can flag. */
  fields: { id: string; label: string }[];
};

/**
 * "Send back to the customer": optionally a new price (with an optional reason) and/or a request
 * for more details (an optional message plus the fields to fix). Nothing is mandatory except one
 * actual change; the server decides the next status.
 */
export function LicenseSendBackDialog({ requestId, currentTotal, currentTotalLabel, fields }: Props) {
  const router = useRouter();
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState("");
  const [flagged, setFlagged] = useState<ReadonlySet<string>>(new Set());
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, startTransition] = useTransition();

  function submit(form: FormData) {
    startTransition(async () => {
      const result = await requestLicenseChanges(requestId, {
        newTotal: price.trim() === currentTotal ? "" : price,
        priceReason: String(form.get("priceReason") ?? ""),
        message,
        fieldIds: [...flagged],
      });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.fieldErrors?.form ?? result.error);
        return;
      }
      toast.success("ส่งกลับให้ลูกค้าแล้ว");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !pending && setOpen(v)}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-10 rounded-full px-5">
          <Undo2 aria-hidden /> แก้ราคา / ขอข้อมูลเพิ่ม
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>ส่งกลับให้ลูกค้า</DialogTitle>
          <DialogDescription>
            แก้ราคา และ/หรือ ขอข้อมูลเพิ่ม ใส่อย่างใดอย่างหนึ่งก็ได้ ลูกค้าจะเห็นราคาเดิม ราคาใหม่ และข้อความนี้ แล้วส่งกลับมาให้พิจารณาอีกครั้ง
          </DialogDescription>
        </DialogHeader>
        <form
          id={`${ids}-form`}
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit(new FormData(e.currentTarget));
          }}
        >
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">ราคา</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextInput
                label="ราคาใหม่ (บาท)"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder={currentTotal}
                hint={`ราคาปัจจุบัน ${currentTotalLabel} · เว้นว่าง = ไม่แก้ราคา`}
                error={errors.newTotal}
              />
              <TextInput label="เหตุผลที่แก้ราคา (ไม่บังคับ)" name="priceReason" maxLength={LICENSE_MESSAGE_MAX} error={errors.priceReason} />
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">ข้อมูลที่ต้องการเพิ่มหรือแก้ไข (ไม่บังคับ)</legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {fields.map((f) => (
                <label key={f.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
                  <input
                    type="checkbox"
                    className="size-4 accent-brand-strong"
                    checked={flagged.has(f.id)}
                    onChange={(e) =>
                      setFlagged((s) => {
                        const next = new Set(s);
                        if (e.target.checked) next.add(f.id);
                        else next.delete(f.id);
                        return next;
                      })
                    }
                  />
                  {f.label}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_MESSAGES.map((m) => (
                <Button key={m} type="button" variant="secondary" size="sm" className="h-auto rounded-full py-1 text-left whitespace-normal" onClick={() => setMessage(m)}>
                  {m}
                </Button>
              ))}
            </div>
            <TextArea
              label="ข้อความถึงลูกค้า (ไม่บังคับ)"
              rows={3}
              maxLength={LICENSE_MESSAGE_MAX}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              error={errors.message}
            />
          </fieldset>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            ยกเลิก
          </Button>
          <Button type="submit" form={`${ids}-form`} disabled={pending} aria-busy={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden />} ส่งกลับให้ลูกค้า
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
