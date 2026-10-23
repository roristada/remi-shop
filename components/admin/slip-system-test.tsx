"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Circle, FlaskConical, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { checkSlipOkConnection, requestTestSlipUpload, verifyTestSlipUpload } from "@/lib/payments/admin-actions";
import { putSignedUpload } from "@/lib/storage/upload-client";

type StepState = { status: "idle" | "running" | "passed" | "failed"; detail?: string };

const STEPS = [
  { key: "request", label: "เซิร์ฟเวอร์ขอลิงก์อัปโหลด (คีย์ Supabase)" },
  { key: "upload", label: "เบราว์เซอร์อัปโหลดไฟล์ขึ้น Storage" },
  { key: "verify", label: "เซิร์ฟเวอร์อ่านไฟล์กลับและลบไฟล์ทดสอบ" },
  { key: "slipok", label: "คีย์ SlipOK ใช้งานได้" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];
type Steps = Record<StepKey, StepState>;

const IDLE: Steps = {
  request: { status: "idle" },
  upload: { status: "idle" },
  verify: { status: "idle" },
  slipok: { status: "idle" },
};
const UNEXPECTED: StepState = { status: "failed", detail: "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง" };

/**
 * Admin self-test of the slip path: the same upload a customer does (without an order) and a
 * SlipOK key check that sends no slip. The upload stops at its first failed step; SlipOK is
 * checked either way, so one run answers both.
 */
export function SlipSystemTest() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [steps, setSteps] = useState<Steps>(IDLE);
  const [running, setRunning] = useState(false);

  const set = (key: StepKey, state: StepState) => setSteps((s) => ({ ...s, [key]: state }));

  async function runUpload(f: File) {
    set("request", { status: "running" });
    const target = await requestTestSlipUpload({ fileName: f.name, size: f.size });
    if (!target.ok) return set("request", { status: "failed", detail: target.error });
    set("request", { status: "passed" });

    set("upload", { status: "running" });
    let reason = "";
    const uploaded = await putSignedUpload(target.data, f, f.type || "application/octet-stream", (r) => (reason = r));
    if (!uploaded) return set("upload", { status: "failed", detail: `อัปโหลดไม่สำเร็จ (${reason || "ไม่ทราบสาเหตุ"})` });
    set("upload", { status: "passed" });

    set("verify", { status: "running" });
    const verified = await verifyTestSlipUpload({ path: target.data.path, fileName: f.name });
    set("verify", verified.ok ? { status: "passed" } : { status: "failed", detail: verified.error });
  }

  async function runSlipOk() {
    set("slipok", { status: "running" });
    const res = await checkSlipOkConnection();
    if (!res.ok) return set("slipok", { status: "failed", detail: res.error });
    const { quota, overQuota } = res.data;
    const over = overQuota > 0 ? ` (ใช้เกิน ${overQuota.toLocaleString("th-TH")})` : "";
    set("slipok", { status: "passed", detail: `เหลือโควตา ${quota.toLocaleString("th-TH")} ครั้ง${over}` });
  }

  async function run() {
    if (!file) return;
    setRunning(true);
    setSteps(IDLE);
    await Promise.all([
      runUpload(file).catch(() => set("verify", UNEXPECTED)),
      runSlipOk().catch(() => set("slipok", UNEXPECTED)),
    ]);
    setRunning(false);
  }

  const states = Object.values(steps);
  const finished = !running && states.some((s) => s.status !== "idle");
  const allPassed = states.every((s) => s.status === "passed");

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) return;
        setFile(null);
        setSteps(IDLE);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="rounded-full">
          <FlaskConical aria-hidden />
          ทดสอบระบบสลิป
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>ทดสอบระบบสลิป</DialogTitle>
          <DialogDescription>
            อัปโหลดรูปอะไรก็ได้ (JPG, PNG, WEBP ไม่เกิน 5 MB) ผ่านเส้นทางเดียวกับลูกค้า แล้วเช็คคีย์ SlipOK
            ไม่สร้างคำสั่งซื้อ ไม่ส่งสลิปไป SlipOK และไม่ใช้โควตา
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setSteps(IDLE);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            disabled={running}
            onClick={() => inputRef.current?.click()}
          >
            เลือกรูป
          </Button>
          <span className="min-w-0 truncate text-sm text-muted-foreground">{file ? file.name : "ยังไม่ได้เลือกไฟล์"}</span>
        </div>

        <ol className="space-y-3" aria-live="polite">
          {STEPS.map(({ key, label }) => (
            <StepRow key={key} label={label} state={steps[key]} />
          ))}
        </ol>

        {finished && (
          <p className={allPassed ? "text-sm font-medium text-green-700" : "text-sm font-medium text-destructive"}>
            {allPassed ? "ผ่านทุกขั้น ลูกค้าอัปโหลดสลิปและตรวจอัตโนมัติได้" : "มีขั้นที่ไม่ผ่าน ดูรายละเอียดด้านบน"}
          </p>
        )}

        <Button className="rounded-full" disabled={!file || running} aria-busy={running} onClick={run}>
          {running && <Loader2 className="animate-spin" aria-hidden />}
          {running ? "กำลังทดสอบ…" : "เริ่มทดสอบ"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

const ICONS = {
  idle: <Circle className="size-5 text-muted-foreground" aria-hidden />,
  running: <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />,
  passed: <CheckCircle2 className="size-5 text-green-600" aria-hidden />,
  failed: <XCircle className="size-5 text-destructive" aria-hidden />,
};
const STATUS_TEXT = { idle: "", running: "กำลังตรวจ", passed: "ผ่าน", failed: "ไม่ผ่าน" };

function StepRow({ label, state }: { label: string; state: StepState }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 shrink-0">{ICONS[state.status]}</span>
      <div className="min-w-0 text-sm">
        <p>
          {label}
          {STATUS_TEXT[state.status] && <span className="sr-only"> : {STATUS_TEXT[state.status]}</span>}
        </p>
        {state.detail && (
          <p className={state.status === "failed" ? "text-destructive" : "text-muted-foreground"}>{state.detail}</p>
        )}
      </div>
    </li>
  );
}
