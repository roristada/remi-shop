"use client";

import { useEffect, useId, useRef, type ComponentProps, type ReactNode } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/actions/result";

type ShellProps = {
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  hideLabel?: boolean;
  children: (a11y: { id: string; "aria-invalid"?: true; "aria-describedby"?: string }) => ReactNode;
};

/** Label + control + error/hint, wired up for screen readers. Admin messages are plain Thai strings. */
export function FieldShell({ label, error, hint, className, hideLabel = false, children }: ShellProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className={cn(hideLabel && "sr-only")}>
        {label}
      </Label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
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

type Common = { label: string; error?: string; hint?: string; wrapperClassName?: string };

export function TextInput({ label, error, hint, wrapperClassName, className, ...props }: Common & ComponentProps<"input">) {
  return (
    <FieldShell label={label} error={error} hint={hint} className={wrapperClassName}>
      {(a11y) => <Input {...a11y} className={cn("h-10 rounded-xl", className)} {...props} />}
    </FieldShell>
  );
}

export function TextArea({ label, error, hint, wrapperClassName, className, ...props }: Common & ComponentProps<"textarea">) {
  return (
    <FieldShell label={label} error={error} hint={hint} className={wrapperClassName}>
      {(a11y) => <Textarea {...a11y} className={cn("min-h-24 rounded-xl", className)} {...props} />}
    </FieldShell>
  );
}

export type SelectOption = { value: string; label: string };

/**
 * Styled select (Radix). With `name` it posts with the form like a native select.
 * Radix forbids "" as an item value: leave the value empty to show the placeholder.
 */
export function SelectInput({
  label,
  error,
  hint,
  wrapperClassName,
  className,
  name,
  options,
  defaultValue,
  value,
  onValueChange,
  placeholder = "— เลือก —",
  hideLabel = false,
}: Common & {
  name?: string;
  options: SelectOption[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  hideLabel?: boolean;
}) {
  return (
    <FieldShell label={label} error={error} hint={hint} className={wrapperClassName} hideLabel={hideLabel}>
      {(a11y) => (
        <Select name={name} defaultValue={defaultValue || undefined} value={value} onValueChange={onValueChange}>
          <SelectTrigger {...a11y} className={cn("h-10! w-full rounded-xl", className)}>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent position="popper" className="max-h-72">
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FieldShell>
  );
}

export function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-soft md:p-6">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** Toasts the result of a form action once per new result. */
export function useResultToast(state: ActionResult<unknown> | null) {
  const last = useRef<typeof state>(null);
  useEffect(() => {
    if (!state || state === last.current) return;
    last.current = state;
    if (state.ok) {
      if (state.message) toast.success(state.message);
    } else {
      toast.error(state.error);
    }
  }, [state]);
}

/** Runs a one-off action and toasts its result. Returns true on success. */
export async function runWithToast(action: () => Promise<ActionResult<unknown>>): Promise<boolean> {
  try {
    const result = await action();
    if (result.ok) {
      if (result.message) toast.success(result.message);
      return true;
    }
    toast.error(result.error);
  } catch (error) {
    // redirect() inside an action surfaces as a thrown control-flow error — let Next handle it.
    if (error && typeof error === "object" && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT")) {
      throw error;
    }
    toast.error("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
  }
  return false;
}
