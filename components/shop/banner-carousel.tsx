"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { BannerCard, type BannerCardData } from "@/components/shop/banner-card";
import { cn } from "@/lib/utils";

export type CarouselBanner = BannerCardData & {
  /** Site path (no locale) or an absolute http(s) URL; null = the card is not a link. */
  href: string | null;
  external: boolean;
};

const AUTOPLAY_MS = 5000;
const SPRING = 190;
const SIDE_SCALE = 0.07;
const SIDE_FADE = 0.22;

const wrapIn = (n: number) => (x: number) => x - n * Math.round(x / n);
const modIn = (n: number) => (x: number) => ((x % n) + n) % n;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Home-page banner carousel (client request, UAT round 3; motion follows the approved
 * `template/REMI – แบนเนอร์หน้าแรก` mock): the current card in the middle, a peek of the cards on
 * either side, an endless loop, drag/swipe with momentum, arrows, dots and a 5 s autoplay that
 * pauses on hover, focus and reduced motion. Positions are written straight to the DOM each frame,
 * so the animation never re-renders React.
 */
export function BannerCarousel({ banners }: { banners: CarouselBanner[] }) {
  const t = useTranslations("home.banner");
  const count = banners.length;
  // Two cards cannot fill both sides of the loop; show them twice (dots still count two).
  const slides = count === 2 ? [...banners, ...banners] : banners;
  const n = slides.length;

  const viewportRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const goRef = useRef<(target: number) => void>(() => {});
  const targetRef = useRef(0);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || n < 2) return;
    const wrap = wrapIn(n);
    const mod = modIn(n);
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let pos = 0;
    let target = 0;
    let vel = 0;
    let step = 0;
    let raf = 0;
    let last = 0;
    let shown = -1;
    let timer: ReturnType<typeof setInterval> | undefined;
    let wheelTimer: ReturnType<typeof setTimeout> | undefined;
    let paused = false;
    // Drag state.
    let startX: number | null = null;
    let startY = 0;
    let lastX = 0;
    let lastT = 0;
    let vx = 0;
    let startPos = 0;
    let dragging = false;

    const measure = () => {
      const first = cardRefs.current[0];
      step = first ? first.offsetWidth + clamp(window.innerWidth * 0.016, 12, 24) : 0;
    };

    const render = () => {
      cardRefs.current.forEach((card, k) => {
        if (!card) return;
        const d = wrap(k - pos);
        const a = Math.abs(d);
        const f = Math.min(a, 1);
        card.style.transform = `translate3d(${d * step}px,0,0) scale(${1 - SIDE_SCALE * f})`;
        card.style.opacity = String(1 - SIDE_FADE * f);
        card.style.zIndex = String(100 - Math.round(a * 10));
        card.style.visibility = a > 1.8 ? "hidden" : "visible";
      });
      const now = mod(Math.round(pos));
      if (now !== shown) {
        shown = now;
        cardRefs.current.forEach((card, k) => {
          if (!card) return;
          // Only the centre card is reachable by keyboard and screen readers.
          card.inert = k !== now;
        });
        setCurrent(now);
      }
    };

    const tick = (time: number) => {
      const dt = Math.min(0.032, (time - last) / 1000);
      last = time;
      vel += ((target - pos) * SPRING - vel * 2 * Math.sqrt(SPRING)) * dt;
      pos += vel * dt;
      if (Math.abs(target - pos) < 0.0004 && Math.abs(vel) < 0.01) {
        pos = target;
        vel = 0;
        const shift = Math.round(pos / n) * n;
        pos -= shift;
        target -= shift;
        targetRef.current = target;
        render();
        raf = 0;
        return;
      }
      render();
      raf = requestAnimationFrame(tick);
    };

    const restart = () => {
      clearInterval(timer);
      if (!calm && !paused) timer = setInterval(() => go(Math.round(target) + 1), AUTOPLAY_MS);
    };

    const go = (to: number) => {
      target = to;
      targetRef.current = to;
      if (calm) {
        pos = target;
        render();
      } else if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
      restart();
    };
    goRef.current = go;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button > 0) return;
      startX = lastX = e.clientX;
      startY = e.clientY;
      lastT = e.timeStamp;
      vx = 0;
      dragging = false;
      startPos = pos;
      clearInterval(timer);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (startX === null) return;
      if (!dragging && Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) > 6) {
        // Mostly vertical: let the page scroll instead.
        if (Math.abs(e.clientY - startY) > Math.abs(e.clientX - startX)) {
          startX = null;
          restart();
          return;
        }
        dragging = true;
        target = pos;
        vel = 0;
        viewport.dataset.dragging = "true";
        viewport.setPointerCapture(e.pointerId);
      }
      if (!dragging || step === 0) return;
      const dt = e.timeStamp - lastT;
      if (dt > 0) vx = 0.7 * vx + 0.3 * ((e.clientX - lastX) / dt);
      pos = target = startPos - (e.clientX - startX) / step;
      lastX = e.clientX;
      lastT = e.timeStamp;
      render();
    };
    const onPointerEnd = () => {
      if (startX === null) return;
      const wasDragging = dragging;
      startX = null;
      dragging = false;
      if (!wasDragging) {
        restart();
        return;
      }
      // Swallow the click that ends a drag so a dragged card does not open its link.
      viewport.dataset.justDragged = "true";
      setTimeout(() => delete viewport.dataset.justDragged, 0);
      delete viewport.dataset.dragging;
      const base = Math.round(startPos);
      vel = clamp((-vx * 1000) / (step || 1), -14, 14);
      go(clamp(Math.round(pos + vel * 0.15), base - 2, base + 2));
    };
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || step === 0) return;
      e.preventDefault();
      vel = 0;
      pos += e.deltaX / step;
      target = pos;
      render();
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => go(Math.round(pos)), 110);
    };
    const pause = () => {
      paused = true;
      clearInterval(timer);
    };
    const resume = () => {
      paused = false;
      if (startX === null) restart();
    };
    const onResize = () => {
      measure();
      render();
    };

    viewport.addEventListener("pointerdown", onPointerDown);
    viewport.addEventListener("pointermove", onPointerMove);
    viewport.addEventListener("pointerup", onPointerEnd);
    viewport.addEventListener("pointercancel", onPointerEnd);
    viewport.addEventListener("wheel", onWheel, { passive: false });
    viewport.addEventListener("mouseenter", pause);
    viewport.addEventListener("mouseleave", resume);
    viewport.addEventListener("focusin", pause);
    viewport.addEventListener("focusout", resume);
    window.addEventListener("resize", onResize);

    measure();
    render();
    restart();

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(timer);
      clearTimeout(wheelTimer);
      viewport.removeEventListener("pointerdown", onPointerDown);
      viewport.removeEventListener("pointermove", onPointerMove);
      viewport.removeEventListener("pointerup", onPointerEnd);
      viewport.removeEventListener("pointercancel", onPointerEnd);
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("mouseenter", pause);
      viewport.removeEventListener("mouseleave", resume);
      viewport.removeEventListener("focusin", pause);
      viewport.removeEventListener("focusout", resume);
      window.removeEventListener("resize", onResize);
    };
  }, [n]);

  if (count === 0) return null;

  const wrap = wrapIn(n);
  const step = (delta: number) => goRef.current(Math.round(targetRef.current) + delta);
  const goToCard = (k: number) => {
    const from = Math.round(targetRef.current);
    goRef.current(from + wrap(k - from));
  };
  const activeDot = current % count;

  return (
    <section
      aria-roledescription="carousel"
      aria-label={t("carouselLabel")}
      className="banner-carousel group/carousel relative"
      onKeyDown={(e) => {
        if (n < 2) return;
        if (e.key === "ArrowLeft") step(-1);
        if (e.key === "ArrowRight") step(1);
      }}
    >
      <div
        ref={viewportRef}
        className="relative touch-pan-y overflow-hidden select-none data-[dragging=true]:cursor-grabbing"
        style={{ height: "calc(var(--banner-h) + 1.5rem)" }}
        onClickCapture={(e) => {
          if (viewportRef.current?.dataset.justDragged) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        <div className="absolute inset-x-0 top-3">
          {slides.map((banner, k) => (
            <div
              key={`${banner.id}-${k}`}
              ref={(el) => {
                cardRefs.current[k] = el;
              }}
              role="group"
              aria-roledescription="slide"
              aria-label={t("slideLabel", { index: (k % count) + 1, total: count })}
              className="absolute top-0 left-1/2 overflow-hidden rounded-[clamp(1.25rem,2.6vw,2.25rem)] shadow-[0_0_0_1px_rgba(60,30,60,0.06)] will-change-transform [backface-visibility:hidden]"
              style={{
                width: "var(--banner-w)",
                height: "var(--banner-h)",
                marginLeft: "calc(var(--banner-w) / -2)",
                // Before hydration only the first card shows, centred.
                visibility: k === 0 ? "visible" : "hidden",
              }}
              onClick={(e) => {
                // A side card moves to the centre instead of opening its link.
                if (k !== current && n > 1) {
                  e.preventDefault();
                  goToCard(k);
                }
              }}
            >
              <CardLink banner={banner}>
                <BannerCard banner={banner} priority={k === 0} />
              </CardLink>
            </div>
          ))}
        </div>
      </div>

      {count > 1 && (
        <>
          <CarouselArrow side="left" label={t("previous")} onClick={() => step(-1)} />
          <CarouselArrow side="right" label={t("next")} onClick={() => step(1)} />
          <div className="mt-3 flex justify-center gap-1.5">
            {banners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                aria-label={t("goTo", { index: i + 1 })}
                aria-current={i === activeDot}
                onClick={() => goToCard(i)}
                className={cn(
                  "h-1.5 w-1.5 rounded-full bg-muted-foreground/35 transition-[width,background-color] duration-500 ease-[cubic-bezier(.3,.7,.2,1)]",
                  i === activeDot && "w-5.5 bg-foreground",
                )}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function CardLink({ banner, children }: { banner: CarouselBanner; children: ReactNode }) {
  const className = "block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset";
  if (!banner.href) return <div className="h-full w-full">{children}</div>;
  if (banner.external) {
    return (
      <a href={banner.href} target="_blank" rel="noopener noreferrer" draggable={false} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={banner.href} draggable={false} className={className}>
      {children}
    </Link>
  );
}

function CarouselArrow({ side, label, onClick }: { side: "left" | "right"; label: string; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "absolute top-[calc((var(--banner-h)+1.5rem)/2)] z-[200] hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-background/80 text-foreground shadow-[0_1px_10px_rgba(40,20,40,0.14)] backdrop-blur-md transition-opacity sm:grid",
        "opacity-0 group-hover/carousel:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100",
        side === "left"
          ? "left-[max(0.75rem,calc(50%-var(--banner-w)/2-1.375rem))]"
          : "right-[max(0.75rem,calc(50%-var(--banner-w)/2-1.375rem))]",
      )}
    >
      <Icon className="size-5" aria-hidden />
    </button>
  );
}
