-- Each usage type owns its own request form (like separate Google Forms) instead of switching
-- questions of one shared pool on and off. Every type gets its own copy of the questions it asks
-- today; answers, flagged fields and history are re-pointed at the copy of the request's type.
-- Answers to a question the type no longer asked keep their label snapshot (field_id -> NULL).

-- All or nothing: a half-copied form must never be left behind.
BEGIN;

-- 1. Old question -> its copy for each usage type that asks it.
CREATE TABLE "_license_field_copy" ("old_id" UUID NOT NULL, "usage_type_id" UUID NOT NULL, "new_id" UUID NOT NULL);

INSERT INTO "_license_field_copy" ("old_id", "usage_type_id", "new_id")
SELECT f."id", t."id", gen_random_uuid()
FROM "license_form_fields" AS f
CROSS JOIN "license_usage_types" AS t
WHERE f."applies_to_all_types"
   OR EXISTS (SELECT 1 FROM "license_form_field_usage_types" AS j WHERE j."field_id" = f."id" AND j."usage_type_id" = t."id");

-- The usage type of each request (one per request; the oldest item if an old one has several).
CREATE TABLE "_license_request_type" ("request_id" UUID PRIMARY KEY, "usage_type_id" UUID NOT NULL);

INSERT INTO "_license_request_type" ("request_id", "usage_type_id")
SELECT DISTINCT ON (i."request_id") i."request_id", i."usage_type_id"
FROM "license_request_items" AS i
ORDER BY i."request_id", i."id";

-- 2. Copy the questions (key is unique per type from here on).
DROP INDEX "license_form_fields_key_key";
DROP INDEX "license_form_fields_is_active_sort_order_idx";
ALTER TABLE "license_form_fields" ADD COLUMN "usage_type_id" UUID;

INSERT INTO "license_form_fields" ("id", "usage_type_id", "key", "label_th", "label_en", "description_th", "description_en", "type", "is_required", "is_active", "sort_order", "options", "applies_to_all_types", "created_at", "updated_at")
SELECT c."new_id", c."usage_type_id", f."key", f."label_th", f."label_en", f."description_th", f."description_en", f."type", f."is_required", f."is_active", f."sort_order", f."options", true, f."created_at", now()
FROM "_license_field_copy" AS c
JOIN "license_form_fields" AS f ON f."id" = c."old_id";

-- 3. Re-point what referenced the old questions.
UPDATE "license_request_answers" AS a
SET "field_id" = c."new_id"
FROM "_license_request_type" AS rt, "_license_field_copy" AS c
WHERE rt."request_id" = a."request_id" AND c."old_id" = a."field_id" AND c."usage_type_id" = rt."usage_type_id";

UPDATE "license_requests" AS r
SET "info_request_fields" = ARRAY(
  SELECT COALESCE(c."new_id"::text, u.x)
  FROM unnest(r."info_request_fields") WITH ORDINALITY AS u(x, n)
  LEFT JOIN "_license_field_copy" AS c ON c."old_id"::text = u.x AND c."usage_type_id" = rt."usage_type_id"
  ORDER BY u.n
)
FROM "_license_request_type" AS rt
WHERE rt."request_id" = r."id" AND cardinality(r."info_request_fields") > 0;

UPDATE "license_request_events" AS e
SET "field_ids" = ARRAY(
  SELECT COALESCE(c."new_id"::text, u.x)
  FROM unnest(e."field_ids") WITH ORDINALITY AS u(x, n)
  LEFT JOIN "_license_field_copy" AS c ON c."old_id"::text = u.x AND c."usage_type_id" = rt."usage_type_id"
  ORDER BY u.n
)
FROM "_license_request_type" AS rt
WHERE rt."request_id" = e."request_id" AND cardinality(e."field_ids") > 0;

-- 4. Drop the shared pool (answers still pointing at it fall back to their snapshot: SET NULL).
DELETE FROM "license_form_fields" WHERE "usage_type_id" IS NULL;
DROP TABLE "_license_field_copy";
DROP TABLE "_license_request_type";

ALTER TABLE "license_form_field_usage_types" DROP CONSTRAINT "license_form_field_usage_types_field_id_fkey";
ALTER TABLE "license_form_field_usage_types" DROP CONSTRAINT "license_form_field_usage_types_usage_type_id_fkey";
DROP TABLE "license_form_field_usage_types";

ALTER TABLE "license_form_fields" DROP COLUMN "applies_to_all_types",
ALTER COLUMN "usage_type_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "license_form_fields_usage_type_id_is_active_sort_order_idx" ON "license_form_fields"("usage_type_id", "is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "license_form_fields_usage_type_id_key_key" ON "license_form_fields"("usage_type_id", "key");

-- AddForeignKey
ALTER TABLE "license_form_fields" ADD CONSTRAINT "license_form_fields_usage_type_id_fkey" FOREIGN KEY ("usage_type_id") REFERENCES "license_usage_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
