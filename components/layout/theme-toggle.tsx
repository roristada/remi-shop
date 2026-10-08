"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { THEME_CHOICES, THEME_STORAGE_KEY, type ThemeChoice } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { usePointerMenuFocus } from "./use-pointer-menu-focus";

const ICONS = { light: Sun, dark: Moon, system: Monitor } as const;

function readChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

function apply(choice: ThemeChoice) {
  const dark = choice === "dark" || (choice === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

/** Same-tab changes (the storage event only fires in other tabs). */
const CHANGE_EVENT = "themechange";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** Current choice plus a setter that saves and applies it; "system" follows OS changes live. */
function useTheme() {
  // null on the server: it cannot know this browser's choice.
  const choice = useSyncExternalStore<ThemeChoice | null>(subscribe, readChoice, () => null);

  // Another tab changed it: follow along.
  useEffect(() => {
    if (choice) apply(choice);
  }, [choice]);

  useEffect(() => {
    if (choice !== "system") return;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [choice]);

  const select = useCallback((next: ThemeChoice) => {
    try {
      if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private mode: the theme still applies for this page view.
    }
    apply(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { choice, select };
}

/** Header button: sun/moon icon with a light / dark / system menu, like the language switcher. */
export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations("common.theme");
  const { choice, select } = useTheme();
  const menuFocus = usePointerMenuFocus();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xl" className={cn("rounded-full", className)} aria-label={t("label")}>
          {/* Icons follow the applied class, so they are right before the choice is read. */}
          <Sun className="dark:hidden" />
          <Moon className="hidden dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" {...menuFocus}>
        <DropdownMenuRadioGroup value={choice ?? ""} onValueChange={(v) => select(v as ThemeChoice)}>
          {THEME_CHOICES.map((c) => {
            const Icon = ICONS[c];
            return (
              <DropdownMenuRadioItem key={c} value={c}>
                <Icon aria-hidden /> {t(c)}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The same choice as three pills, for the phone menu sheet. */
export function ThemeChoices() {
  const t = useTranslations("common.theme");
  const { choice, select } = useTheme();

  return (
    <div role="radiogroup" aria-label={t("label")} className="flex flex-wrap gap-2">
      {THEME_CHOICES.map((c) => {
        const Icon = ICONS[c];
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={choice === c}
            onClick={() => select(c)}
            className="inline-flex h-11 items-center gap-1.5 rounded-full border px-4 text-sm aria-checked:border-foreground aria-checked:bg-foreground aria-checked:text-background"
          >
            <Icon className="size-4" aria-hidden /> {t(c)}
          </button>
        );
      })}
    </div>
  );
}
