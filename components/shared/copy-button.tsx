"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  value: string;
  /** Accessible name, e.g. "Copy amount". */
  label: string;
  copiedLabel: string;
};

const RESET_MS = 2000;

/** Copies `value` to the clipboard and confirms inline (announced to screen readers). */
export function CopyButton({ value, label, copiedLabel }: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), RESET_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard can be blocked (insecure context, permissions); the value stays visible to copy by hand.
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xl"
      className="shrink-0 rounded-full"
      aria-label={copied ? copiedLabel : label}
      onClick={onCopy}
    >
      {copied ? <Check className="text-success" aria-hidden /> : <Copy aria-hidden />}
      <span role="status" className="sr-only">
        {copied ? copiedLabel : ""}
      </span>
    </Button>
  );
}
