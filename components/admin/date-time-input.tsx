"use client";

import { useId, useState } from "react";
import { th } from "react-day-picker/locale";
import { CalendarDays, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

// Value format matches <input type="datetime-local">: "YYYY-MM-DDTHH:mm", Bangkok wall-clock.
// The server parses it (lib/datetime.ts); the browser's own timezone is never involved.

type Parts = { y: number; m: number; d: number; hh: number; mm: number };

const pad = (n: number) => String(n).padStart(2, "0");
const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));
// 5-minute steps plus :59 for end-of-day. Any other saved minute is added on the fly.
const MINUTES = [...Array.from({ length: 12 }, (_, i) => pad(i * 5)), "59"];

function parse(value: string): Parts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  return { y: +m[1], m: +m[2], d: +m[3], hh: +m[4], mm: +m[5] };
}

function format(p: Parts): string {
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.hh)}:${pad(p.mm)}`;
}

// Business dates are near-term: last year through five years ahead.
const THIS_YEAR = new Date().getFullYear();
const YEAR_RANGE = { start: new Date(THIS_YEAR - 1, 0), end: new Date(THIS_YEAR + 5, 11) };

const MONTHS_TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function label(p: Parts): string {
  return `${p.d} ${MONTHS_TH[p.m - 1]} ${p.y} · ${pad(p.hh)}:${pad(p.mm)} น.`;
}

export function DateTimeInput({
  label: fieldLabel,
  name,
  defaultValue = "",
  error,
  hint,
  defaultTime = "00:00",
}: {
  label: string;
  name: string;
  defaultValue?: string;
  error?: string;
  hint?: string;
  /** Time used when a date is first picked (e.g. "23:59" for end dates). */
  defaultTime?: string;
}) {
  const id = useId();
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const parts = parse(value);
  const minutes = parts && !MINUTES.includes(pad(parts.mm)) ? [...MINUTES, pad(parts.mm)].sort() : MINUTES;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  const update = (patch: Partial<Parts>) => {
    const [dh, dm] = defaultTime.split(":").map(Number);
    const base: Parts = parts ?? { y: 0, m: 0, d: 0, hh: dh, mm: dm };
    setValue(format({ ...base, ...patch }));
  };

  // Calendar works with local-midnight Dates; only the y/m/d parts are read back.
  const selected = parts ? new Date(parts.y, parts.m - 1, parts.d) : undefined;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{fieldLabel}</Label>
      <input type="hidden" name={name} value={value} />
      <div className="flex gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              id={id}
              type="button"
              variant="outline"
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy}
              className={cn(
                "h-10 flex-1 justify-start rounded-xl px-3 font-normal",
                !parts && "text-muted-foreground",
              )}
            >
              <CalendarDays aria-hidden />
              {parts ? label(parts) : "เลือกวันและเวลา"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              locale={th}
              selected={selected}
              defaultMonth={selected}
              captionLayout="dropdown"
              startMonth={YEAR_RANGE.start}
              endMonth={YEAR_RANGE.end}
              onSelect={(date) => {
                if (!date) return;
                update({ y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() });
              }}
            />
            <div className="flex items-center gap-2 border-t p-3">
              <span className="text-sm text-muted-foreground">เวลา</span>
              <Select
                value={parts ? pad(parts.hh) : ""}
                onValueChange={(v) => update({ hh: Number(v) })}
                disabled={!parts}
              >
                <SelectTrigger aria-label="ชั่วโมง" className="w-20">
                  <SelectValue placeholder="--" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {HOURS.map((h) => (
                    <SelectItem key={h} value={h}>
                      {h}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span aria-hidden>:</span>
              <Select
                value={parts ? pad(parts.mm) : ""}
                onValueChange={(v) => update({ mm: Number(v) })}
                disabled={!parts}
              >
                <SelectTrigger aria-label="นาที" className="w-20">
                  <SelectValue placeholder="--" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {minutes.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">น. (เวลาไทย)</span>
              <Button type="button" size="sm" className="ml-auto" onClick={() => setOpen(false)}>
                ตกลง
              </Button>
            </div>
          </PopoverContent>
        </Popover>
        {parts && (
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            aria-label={`ล้าง${fieldLabel}`}
            onClick={() => setValue("")}
            className="h-10 rounded-xl"
          >
            <X />
          </Button>
        )}
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
