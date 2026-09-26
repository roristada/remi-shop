import Image from "next/image";
import { Link } from "@/i18n/navigation";
import type { ProductCardData } from "@/lib/products/storefront-queries";

// Fanned-out preview tiles, like brush swatches pinned to a board. Final transforms per slot.
const SLOTS = [
  "left-[4%] top-[14%] -rotate-[7deg] [--from:-2deg]",
  "left-[30%] top-[4%] rotate-[2deg] [--from:0deg] z-10",
  "left-[54%] top-[18%] rotate-[9deg] [--from:3deg]",
] as const;

// Painted placeholders when there are fewer than three products with images.
const PLACEHOLDERS = [
  "bg-[radial-gradient(120%_90%_at_20%_10%,#f5bfd4,transparent_60%),radial-gradient(90%_80%_at_90%_90%,#def1f6,transparent_60%)] bg-card",
  "bg-[linear-gradient(135deg,#def1f6_0%,#fefeff_55%,#f5bfd4_100%)]",
  "bg-[repeating-linear-gradient(115deg,#fcebf2_0_10px,#fefeff_10px_22px)]",
] as const;

// Real previews fill the front (middle) slot first, then the sides.
const FILL_ORDER = [1, 0, 2] as const;

export function SwatchStack({ products, caption }: { products: ProductCardData[]; caption?: string }) {
  const withImages = products.filter((p) => p.image).slice(0, 3);
  const bySlot = FILL_ORDER.reduce<(ProductCardData | undefined)[]>((acc, slot, rank) => {
    acc[slot] = withImages[rank];
    return acc;
  }, []);
  return (
    <div className="relative aspect-[5/4] w-full rounded-[2rem] bg-secondary">
      {/* The one Charmonman line the whole page gets (DESIGN.md § The One Script Line Rule) — a
          hand-written aside pinned to the art itself, never a kicker sitting above the h1. */}
      {caption && (
        <span
          aria-hidden
          className="swatch-in absolute -bottom-3 left-[6%] z-20 -rotate-3 rounded-full bg-background px-4 py-1 font-script text-2xl text-foreground shadow-soft [--from:-8deg]"
          style={{ animationDelay: "480ms" }}
        >
          {caption}
        </span>
      )}
      {SLOTS.map((slot, i) => {
        const p = bySlot[i];
        const tile = `swatch-in absolute aspect-[4/5] w-[42%] overflow-hidden rounded-2xl border-4 border-background shadow-[0_18px_40px_-18px_rgb(51_51_51/0.35)] ${slot}`;
        const delay = { animationDelay: `${120 + i * 90}ms` };
        if (!p?.image) return <div key={i} aria-hidden className={`${tile} ${PLACEHOLDERS[i]}`} style={delay} />;
        return (
          <Link
            key={p.id}
            href={`/product/${p.slug}`}
            className={`${tile} transition-transform duration-300 hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none`}
            style={delay}
          >
            <Image
              src={p.image.url}
              alt={p.name}
              fill
              sizes="(min-width: 1024px) 240px, 40vw"
              loading="eager"
              fetchPriority={i === 1 ? "high" : "auto"}
              className="object-cover"
            />
          </Link>
        );
      })}
    </div>
  );
}
