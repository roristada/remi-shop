import { cn } from "@/lib/utils";

// Halloween dressing (see lib/seasonal.ts). Every piece is decorative: hidden from screen readers
// and never in the way of a click.

/** Cute ghost for empty states and the 404 page. Floats gently unless motion is reduced. */
export function HalloweenGhost({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cn("seasonal-float size-20", className)}>
      <path
        d="M10 30C10 17 18 6 32 6s22 11 22 24v26l-5.5-5-5.5 5-5.5-5-5.5 5-5.5-5-5.5 5-5.5-5-5.5 5Z"
        fill="#ffffff"
        stroke="#3b2f45"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <ellipse cx="25" cy="28" rx="3" ry="4" fill="#3b2f45" />
      <ellipse cx="39" cy="28" rx="3" ry="4" fill="#3b2f45" />
      <circle cx="20.5" cy="35" r="2.5" fill="#f5bfd4" />
      <circle cx="43.5" cy="35" r="2.5" fill="#f5bfd4" />
      <ellipse cx="32" cy="37" rx="2.5" ry="3" fill="#3b2f45" />
    </svg>
  );
}

export function Pumpkin({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <path d="M15 8c0-3 1.5-5 4.5-5.5L18 8Z" fill="#5f8a3c" />
      <ellipse cx="11" cy="19" rx="7" ry="9" fill="#f4a259" stroke="#c96a1f" strokeWidth="1.2" />
      <ellipse cx="21" cy="19" rx="7" ry="9" fill="#f4a259" stroke="#c96a1f" strokeWidth="1.2" />
      <ellipse cx="16" cy="19" rx="5.5" ry="9.5" fill="#f7b26f" stroke="#c96a1f" strokeWidth="1.2" />
      <path d="M10 17l2.5-3 2.5 3ZM17 17l2.5-3 2.5 3Z" fill="#3b2f45" />
      <path d="M11 22q5 3.5 10 0q-5 1.5-10 0Z" fill="#3b2f45" />
    </svg>
  );
}

function Bat({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 24" aria-hidden className={className}>
      <path
        d="M24 8c-1.2 0-2.2.6-2.7 1.5L20.6 6l-.3 3.6C17 7.4 12.5 6.3 7 7c3 1.5 4 4 3 6.5 2-1.5 5-1.2 6 .5 1-1.6 3-2 5-1 .5 2.5 1.8 4 3 4s2.5-1.5 3-4c2-1 4-.6 5 1 1-1.7 4-2 6-.5-1-2.5 0-5 3-6.5-5.5-.7-10 .4-13.3 2.6L27.4 6l-.7 3.5C26.2 8.6 25.2 8 24 8Z"
        fill="currentColor"
      />
      <circle cx="22.6" cy="11.2" r=".9" fill="#f7b26f" />
      <circle cx="25.4" cy="11.2" r=".9" fill="#f7b26f" />
    </svg>
  );
}

/**
 * Two bats flitting in the header's empty middle (wide screens only, where there is room). They stay
 * inside the header so they never cover the announcement bar or page content below it.
 */
export function HalloweenHeaderBats() {
  return (
    <div aria-hidden className="pointer-events-none hidden flex-1 items-center justify-center gap-10 md:flex">
      <Bat className="seasonal-float w-11 -rotate-6 text-[#3b2f45] dark:text-[#c9a7e0]" />
      <Bat className="seasonal-float w-8 translate-y-1 rotate-6 text-[#3b2f45] [animation-delay:-1.6s] dark:text-[#c9a7e0]" />
    </div>
  );
}
