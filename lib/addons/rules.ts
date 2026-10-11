// Pure add-on rules (no DB).
import type { LineProblem } from "@/lib/orders/rules";

/** Add-ons one product can offer. */
export const MAX_ADDONS = 12;

/** Main products one add-on-only product can be sold with. */
export const MAX_ADDON_MAINS = 50;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Distinct, well-formed ids, never the product itself, at most `max`, in the given order. */
export function cleanAddonIds(productId: string, ids: unknown, max: number = MAX_ADDONS): string[] | null {
  if (!Array.isArray(ids)) return null;
  const out: string[] = [];
  for (const id of ids) {
    if (typeof id !== "string" || !UUID.test(id)) return null;
    if (id === productId || out.includes(id)) continue;
    out.push(id);
  }
  return out.length > max ? null : out;
}

/**
 * Which main product an order line is bought as an add-on of: the cart's link when that main is in
 * the same order; else, for an add-on-only product, a main in the order or one the customer owns.
 */
export function pickAddonMain(
  line: { productId: string; addedWithProductId: string | null },
  orderProductIds: ReadonlySet<string>,
  ctx: AddonOnlyContext,
): string | null {
  if (line.addedWithProductId && orderProductIds.has(line.addedWithProductId)) return line.addedWithProductId;
  const mains = ctx.mainsByAddon.get(line.productId);
  if (!mains) return null;
  return mains.find((m) => orderProductIds.has(m)) ?? mains.find((m) => ctx.ownedMainIds.has(m)) ?? null;
}

type AddonNoteLine = { productId: string; productNameTHSnapshot: string; addedWithProductId: string | null };

/** Admin note for an order line bought as an add-on ("Add-on ของ …"), or null for a normal line. */
export function addonNoteTH(line: AddonNoteLine, orderLines: AddonNoteLine[]): string | null {
  if (!line.addedWithProductId) return null;
  const main = orderLines.find((l) => l.productId === line.addedWithProductId);
  return main ? `Add-on ของ ${main.productNameTHSnapshot}` : "Add-on (ลูกค้ามีสินค้าหลักอยู่แล้ว)";
}

/** Products that offer each add-on-only product (`addonId → main product ids`), and the mains the customer owns. */
export type AddonOnlyContext = {
  mainsByAddon: ReadonlyMap<string, readonly string[]>;
  ownedMainIds: ReadonlySet<string>;
};

/**
 * An add-on-only line can be bought only together with a product that offers it (another line
 * of the same cart / order that is itself buyable) or when the customer already owns one.
 * Other lines are returned as they are; failing add-on lines get the NEEDS_MAIN problem.
 */
export function applyAddonOnlyRule<L extends { productId: string; problem: LineProblem | null }>(lines: L[], ctx: AddonOnlyContext): L[] {
  const buyableMains = new Set(lines.filter((l) => l.problem === null && !ctx.mainsByAddon.has(l.productId)).map((l) => l.productId));
  return lines.map((l) => {
    const mains = ctx.mainsByAddon.get(l.productId);
    if (!mains || l.problem !== null) return l;
    return mains.some((m) => buyableMains.has(m) || ctx.ownedMainIds.has(m)) ? l : { ...l, problem: "NEEDS_MAIN" as const };
  });
}
