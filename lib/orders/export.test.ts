import { test } from "node:test";
import assert from "node:assert/strict";
import { csvCell, parseAdminOrderFilters, toCsv } from "./export";

test("csvCell quotes separators, quotes and newlines", () => {
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell("a,b"), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell("line1\nline2"), '"line1\nline2"');
});

test("csvCell neutralizes spreadsheet formulas", () => {
  assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvCell("+66812345678"), "'+66812345678");
  assert.equal(csvCell("@cmd"), "'@cmd");
  // Numbers are written as numbers, not text.
  assert.equal(csvCell(-35.5), "-35.5");
});

test("toCsv starts with a BOM and uses CRLF rows", () => {
  const csv = toCsv(["a", "b"], [["1", "2"]]);
  assert.equal(csv, "\uFEFFa,b\r\n1,2\r\n");
});

test("parseAdminOrderFilters reads Bangkok day bounds and ignores junk", () => {
  const f = parseAdminOrderFilters({ status: "COMPLETED", q: "  RS26 ", from: "2026-09-01", to: "2026-09-30", page: "2" });
  assert.equal(f.status, "COMPLETED");
  assert.equal(f.q, "RS26");
  assert.equal(f.from?.toISOString(), "2026-08-31T17:00:00.000Z");
  assert.equal(f.to?.toISOString(), "2026-09-30T16:59:59.999Z");
  assert.equal(f.page, 2);

  const bad = parseAdminOrderFilters({ status: "HACKED", from: "yesterday", page: "-4" });
  assert.equal(bad.status, undefined);
  assert.equal(bad.from, undefined);
  assert.equal(bad.page, 1);
});
