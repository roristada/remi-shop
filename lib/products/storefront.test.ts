import { test } from "node:test";
import assert from "node:assert/strict";
import { hasShopFilters, parseShopFilters, schemaAvailability, shopFilterParams, shopOrderBy } from "./storefront";
import { localized } from "../../i18n/localize";

test("parseShopFilters defaults", () => {
  assert.deepEqual(parseShopFilters({}), { q: undefined, category: undefined, folder: undefined, sort: "newest", sale: false, page: 1 });
});

test("parseShopFilters accepts valid values", () => {
  const f = parseShopFilters({ q: "  brush ", category: "Brushes", sort: "price-asc", sale: "1", page: "3" });
  assert.deepEqual(f, { q: "brush", category: "brushes", folder: undefined, sort: "price-asc", sale: true, page: 3 });
});

test("parseShopFilters rejects invalid values", () => {
  const f = parseShopFilters({
    q: ["a", "b"],
    category: "../etc",
    sort: "price; drop",
    sale: "true",
    page: "-5",
  });
  assert.deepEqual(f, { q: undefined, category: undefined, folder: undefined, sort: "newest", sale: false, page: 1 });
  assert.equal(parseShopFilters({ page: "999999" }).page, 10_000);
  assert.equal(parseShopFilters({ page: "abc" }).page, 1);
  assert.equal(parseShopFilters({ q: "x".repeat(300) }).q?.length, 100);
  assert.equal(parseShopFilters({ q: "   " }).q, undefined);
});

test("shopFilterParams omits defaults", () => {
  assert.deepEqual(shopFilterParams(parseShopFilters({})), {
    q: undefined,
    category: undefined,
    folder: undefined,
    sort: undefined,
    sale: undefined,
  });
  assert.deepEqual(shopFilterParams(parseShopFilters({ sort: "name", sale: "1" })), {
    q: undefined,
    category: undefined,
    folder: undefined,
    sort: "name",
    sale: "1",
  });
});

test("shopOrderBy sorts by the locale's name", () => {
  assert.deepEqual(shopOrderBy("name", "en")[0], { nameEN: "asc" });
  assert.deepEqual(shopOrderBy("name", "th")[0], { nameTH: "asc" });
});

test("schemaAvailability", () => {
  assert.equal(schemaAvailability("ACTIVE"), "https://schema.org/InStock");
  assert.equal(schemaAvailability("ACTIVE", true), "https://schema.org/SoldOut");
  assert.equal(schemaAvailability("SCHEDULED"), "https://schema.org/PreOrder");
  assert.equal(schemaAvailability("ENDED"), "https://schema.org/Discontinued");
});

test("localized falls back to Thai", () => {
  assert.equal(localized("en", "ไทย", "English"), "English");
  assert.equal(localized("en", "ไทย", " "), "ไทย");
  assert.equal(localized("en", "ไทย", null), "ไทย");
  assert.equal(localized("th", "ไทย", "English"), "ไทย");
});

test("parseShopFilters validates the folder slug", () => {
  assert.equal(parseShopFilters({ folder: "Hot-Brand" }).folder, "hot-brand");
  assert.equal(parseShopFilters({ folder: "../x" }).folder, undefined);
  assert.equal(shopFilterParams(parseShopFilters({ folder: "zograce" })).folder, "zograce");
});

test("hasShopFilters: only the bare /shop shows folder sections", () => {
  assert.equal(hasShopFilters(parseShopFilters({})), false);
  assert.equal(hasShopFilters(parseShopFilters({ folder: "zograce" })), true);
  assert.equal(hasShopFilters(parseShopFilters({ q: "brush" })), true);
  assert.equal(hasShopFilters(parseShopFilters({ page: "2" })), true);
});
