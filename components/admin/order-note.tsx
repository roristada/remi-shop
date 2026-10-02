"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { runWithToast } from "@/components/admin/form-controls";
import { saveOrderAdminNote } from "@/lib/orders/admin-note-actions";
import { cn } from "@/lib/utils";

/**
 * The owner's internal note on one order, edited in place. Never shown to the customer
 * (stored in its own table with no customer access).
 */
export function OrderNote({ orderId, note, className }: { orderId: string; note: string | null; className?: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(note ?? "");
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      if (!(await runWithToast(() => saveOrderAdminNote(orderId, value)))) return;
      setEditing(false);
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn(
          "flex w-full items-start gap-1.5 rounded-lg px-2 py-1 text-left text-xs hover:bg-muted",
          note ? "bg-warning/10 text-foreground" : "text-muted-foreground",
          className,
        )}
      >
        <NotebookPen className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span className="line-clamp-3 whitespace-pre-line">{note || "เพิ่มหมายเหตุภายใน"}</span>
      </button>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={2000}
        rows={3}
        autoFocus
        aria-label="หมายเหตุภายใน (ลูกค้าไม่เห็น)"
        placeholder="หมายเหตุภายใน — ลูกค้าไม่เห็น"
        className="rounded-xl text-sm"
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save();
        }}
      />
      <div className="flex gap-2">
        <Button size="sm" className="rounded-full" disabled={pending} onClick={save}>
          {pending && <Loader2 className="animate-spin" aria-hidden />} บันทึก
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="rounded-full"
          disabled={pending}
          onClick={() => {
            setValue(note ?? "");
            setEditing(false);
          }}
        >
          ยกเลิก
        </Button>
      </div>
    </div>
  );
}
