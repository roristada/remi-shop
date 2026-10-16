"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { SelectOption } from "@/components/admin/form-controls";
import { cn } from "@/lib/utils";

/**
 * A list filter that takes several values. Inside a GET form it submits one `name=value` per pick
 * (`?status=A&status=B`); nothing picked means "all". The server re-validates every value.
 */
export function MultiSelectFilter({
  name,
  label,
  allLabel,
  options,
  defaultValue = [],
  className,
}: {
  name: string;
  /** Field name, also used in the summary ("สถานะ: 2 รายการ"). */
  label: string;
  /** Trigger text when nothing is picked, e.g. "ทุกสถานะ". */
  allLabel: string;
  options: SelectOption[];
  defaultValue?: string[];
  className?: string;
}) {
  const id = useId();
  const [selected, setSelected] = useState<string[]>(() => defaultValue.filter((v) => options.some((o) => o.value === v)));
  const summary =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? allLabel)
        : `${label}: ${selected.length} รายการ`;

  function toggle(value: string, on: boolean) {
    // Kept in option order so the URL is stable whatever the click order.
    setSelected((prev) => options.map((o) => o.value).filter((v) => (v === value ? on : prev.includes(v))));
  }

  return (
    <div className={className}>
      {selected.map((v) => (
        <input key={v} type="hidden" name={name} value={v} />
      ))}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            aria-label={selected.length > 1 ? summary : `${label}: ${summary}`}
            className={cn(
              "h-10 w-full justify-between gap-2 rounded-xl px-3 font-normal",
              selected.length > 0 && "border-primary bg-secondary/40",
            )}
          >
            <span className="truncate">{summary}</span>
            <ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-1.5">
          <fieldset>
            <legend className="sr-only">{label}</legend>
            <ul className="max-h-72 overflow-y-auto">
              {options.map((o) => {
                const optionId = `${id}-${o.value}`;
                return (
                  <li key={o.value}>
                    <label
                      htmlFor={optionId}
                      className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm hover:bg-muted"
                    >
                      <Checkbox
                        id={optionId}
                        checked={selected.includes(o.value)}
                        onCheckedChange={(v) => toggle(o.value, v === true)}
                      />
                      <span className="min-w-0 flex-1">{o.label}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
          <div className="mt-1 flex items-center justify-between border-t px-1 pt-1.5">
            <span className="text-xs text-muted-foreground">
              {selected.length === 0 ? "ไม่เลือก = ทั้งหมด" : `เลือก ${selected.length} รายการ`}
            </span>
            <Button type="button" variant="ghost" size="sm" disabled={selected.length === 0} onClick={() => setSelected([])}>
              ล้าง
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
