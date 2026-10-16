import "server-only";
import { prisma } from "@/lib/prisma/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { AdminOrderFilters } from "@/lib/orders/export";
import { lineWithoutFilesWhere } from "@/lib/products/delivery";

export const ADMIN_ORDERS_PAGE_SIZE = 20;
/** Hard cap for one CSV download; narrow the date range for more. */
export const ORDER_EXPORT_LIMIT = 5000;

/** Orders with a line (or a license) for a product in any of the folders; "none" = a product in no folder. */
function folderWhere(folders: string[]): Prisma.OrderWhereInput {
  const ids = folders.filter((f) => f !== "none");
  const product: Prisma.ProductWhereInput = {
    OR: [...(ids.length > 0 ? [{ folderId: { in: ids } }] : []), ...(folders.includes("none") ? [{ folderId: null }] : [])],
  };
  return { OR: [{ items: { some: { product } } }, { licenseRequest: { product } }] };
}

function orderWhere(f: AdminOrderFilters): Prisma.OrderWhereInput {
  const and: Prisma.OrderWhereInput[] = [];
  if (f.delivery) and.push({ items: { some: lineWithoutFilesWhere() } });
  if (f.folders.length > 0) and.push(folderWhere(f.folders));
  // Under AND so it narrows a picked status list instead of replacing it.
  if (f.delivery === "emailPending") and.push({ status: "COMPLETED", filesEmailedAt: null });
  return {
    ...(f.statuses.length > 0 ? { status: { in: f.statuses } } : {}),
    ...(f.delivery ? { kind: "PRODUCT" as const } : {}),
    ...(and.length > 0 ? { AND: and } : {}),
    ...(f.delivery === "emailSent" ? { filesEmailedAt: { not: null } } : {}),
    ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
    ...(f.q
      ? {
          OR: [
            { orderNumber: { contains: f.q, mode: "insensitive" } },
            { user: { email: { contains: f.q, mode: "insensitive" } } },
            { items: { some: { productNameTHSnapshot: { contains: f.q, mode: "insensitive" } } } },
            { items: { some: { productNameENSnapshot: { contains: f.q, mode: "insensitive" } } } },
            { licenseRequest: { productNameTHSnapshot: { contains: f.q, mode: "insensitive" } } },
            { licenseRequest: { productNameENSnapshot: { contains: f.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
}

const ORDER_ROW_SELECT = {
  id: true,
  orderNumber: true,
  kind: true,
  status: true,
  total: true,
  createdAt: true,
  paidAt: true,
  filesEmailedAt: true,
  user: { select: { email: true, displayName: true } },
  adminNote: { select: { body: true } },
  items: { orderBy: { id: "asc" }, select: { productNameTHSnapshot: true, variantNameTHSnapshot: true, finalPrice: true, cost: true } },
  // LICENSE orders have no items; the request's usage types are what was paid for.
  licenseRequest: {
    select: {
      productNameTHSnapshot: true,
      items: { orderBy: { id: "asc" }, select: { nameTHSnapshot: true, price: true } },
    },
  },
} satisfies Prisma.OrderSelect;

export type AdminOrderRow = Prisma.OrderGetPayload<{ select: typeof ORDER_ROW_SELECT }>;

const THUMB_SELECT = {
  orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
  take: 1,
  select: { imagePath: true, cardPath: true },
} satisfies Prisma.Product$imagesArgs;

/** The list row plus what the order summary popup shows; the CSV export keeps the lean select. */
const ORDER_LIST_SELECT = {
  ...ORDER_ROW_SELECT,
  subtotal: true,
  discount: true,
  items: {
    orderBy: { id: "asc" },
    select: {
      id: true,
      productId: true,
      addedWithProductId: true,
      productNameTHSnapshot: true,
      variantNameTHSnapshot: true,
      unitPrice: true,
      discount: true,
      finalPrice: true,
      cost: true,
      variantId: true,
      product: {
        select: {
          images: THUMB_SELECT,
          // Whether the line has a file yet; without one the store emails it.
          versions: { where: { isLatest: true }, take: 1, select: { files: { select: { variantId: true } } } },
        },
      },
    },
  },
  licenseRequest: {
    select: {
      productNameTHSnapshot: true,
      product: { select: { images: THUMB_SELECT } },
      items: { orderBy: { id: "asc" }, select: { id: true, nameTHSnapshot: true, price: true } },
    },
  },
} satisfies Prisma.OrderSelect;

export type AdminOrderListRow = Prisma.OrderGetPayload<{ select: typeof ORDER_LIST_SELECT }>;

export async function listAdminOrders(f: AdminOrderFilters) {
  const where = orderWhere(f);
  const [total, rows] = await prisma.$transaction([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (f.page - 1) * ADMIN_ORDERS_PAGE_SIZE,
      take: ADMIN_ORDERS_PAGE_SIZE,
      select: ORDER_LIST_SELECT,
    }),
  ]);
  return { rows, total, pageCount: Math.max(1, Math.ceil(total / ADMIN_ORDERS_PAGE_SIZE)) };
}

/** Newest first, at most ORDER_EXPORT_LIMIT orders. */
export async function listOrdersForExport(f: AdminOrderFilters) {
  return prisma.order.findMany({
    where: orderWhere(f),
    orderBy: { createdAt: "desc" },
    take: ORDER_EXPORT_LIMIT,
    select: ORDER_ROW_SELECT,
  });
}

/** What an order is for, one line per product (or per license usage type). */
/** `cost`: recorded cost of a product line (null = not recorded yet); license lines have none (undefined). */
export function orderLines(o: AdminOrderRow): { name: string; price: Prisma.Decimal; cost?: Prisma.Decimal | null }[] {
  if (o.licenseRequest) {
    const product = o.licenseRequest.productNameTHSnapshot;
    return o.licenseRequest.items.map((i) => ({ name: `${product} — License: ${i.nameTHSnapshot}`, price: i.price }));
  }
  return o.items.map((i) => ({
    name: i.variantNameTHSnapshot ? `${i.productNameTHSnapshot} (${i.variantNameTHSnapshot})` : i.productNameTHSnapshot,
    price: i.finalPrice,
    cost: i.cost,
  }));
}
