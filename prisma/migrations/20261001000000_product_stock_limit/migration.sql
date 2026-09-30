-- Optional per-product stock (UAT "1/1" on the card). NULL = unlimited, so existing products are unchanged.
ALTER TABLE "products" ADD COLUMN "stock_limit" INTEGER;
ALTER TABLE "products" ADD CONSTRAINT "products_stock_limit_check" CHECK ("stock_limit" IS NULL OR "stock_limit" >= 0);
