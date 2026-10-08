-- Units sold per product, for the "best selling" sort and the cards' "sold" label. Additive only.
ALTER TABLE "products" ADD COLUMN "sold_count" INTEGER NOT NULL DEFAULT 0;

-- Backfill from orders completed so far: one per order line of a completed product order.
UPDATE "products" AS p SET "sold_count" = s.n
FROM (
  SELECT oi."product_id", COUNT(*)::int AS n
  FROM "order_items" AS oi
  JOIN "orders" AS o ON o."id" = oi."order_id"
  WHERE o."status" = 'COMPLETED' AND o."kind" = 'PRODUCT'
  GROUP BY oi."product_id"
) AS s
WHERE p."id" = s."product_id";
