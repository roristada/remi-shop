import { test } from "node:test";
import assert from "node:assert/strict";
import { costSatang, matchKey, parseCostTab, parseCsv, parseSheetDate, parseSheetId, pickCost } from "./sheet";

// Shape of the client's sheet as Google's CSV export returns it (merged header, blank columns).
const HOT = [
  '"ชื่ออังกฤษ ชื่ออังกฤษ","ชื่อจีน ชื่อจีน","ราคา (หยวน) ราคา (หยวน)","",""',
  '"Small pendant","小小吊坠","1","",""',
  '"Sweet Dreams","好梦","13.4","",""',
  '"Sweet Dreams (ราคาพิเศษ)","好梦 (ราคาพิเศษ)","7.7","",""',
  '"","","","",""',
  '"ชื่ออังกฤษ","ชื่อจีน","ราคา (หยวน)","",""',
  '"Broken","坏","n/a","",""',
  '"Chibi Head4 (2)","大头4 (2)","15","",""',
].join("\n");

test("csv parser handles quotes and CRLF", () => {
  assert.deepEqual(parseCsv('a,"b ""q"", c"\r\nx,y'), [["a", 'b "q", c'], ["x", "y"]]);
});

test("tab parsing: header found, repeated header and bad prices skipped, promo detected", () => {
  const { rows, skipped } = parseCostTab("Hot (热牌)", HOT);
  assert.equal(skipped, 1);
  assert.deepEqual(rows.map((r) => [r.nameEN, r.costYuan, r.isPromo]), [
    ["Small pendant", "1", false],
    ["Sweet Dreams", "13.4", false],
    ["Sweet Dreams", "7.7", true],
    ["Chibi Head4 (2)", "15", false],
  ]);
});

test("names match across spacing and punctuation", () => {
  assert.equal(matchKey("Chibi Head 4 (2)"), matchKey("Chibi Head4 (2)"));
  assert.equal(matchKey("Don't Stop!"), "dontstop");
  assert.equal(matchKey("好梦"), "好梦");
});

test("full-price units use the normal row; the (ราคาพิเศษ) row is for discounted units (client, 2026-10-10)", () => {
  const { rows } = parseCostTab("Hot", HOT);
  const at = new Date("2026-10-10T05:00:00Z");
  assert.equal(pickCost(rows, ["Sweet Dreams"], at)?.costYuan, "13.4");
  assert.equal(pickCost(rows, ["好梦"], at)?.costYuan, "13.4");
  assert.equal(pickCost(rows, ["Sweet Dreams"], at, true)?.costYuan, "7.7");
  assert.equal(pickCost(rows, ["Small pendant"], at, true)?.costYuan, "1"); // no discount cost: normal
  assert.equal(pickCost(rows, ["Unknown"], at), null);
});

test("same name at two prices: higher = normal, lower = discount cost", () => {
  const csv = '"ชื่ออังกฤษ","ชื่อจีน","ราคา (หยวน)"\n"Lovey Icon5","x","15"\n"Lovey Icon5","x","3"';
  const { rows } = parseCostTab("Rope", csv);
  const at = new Date();
  assert.equal(pickCost(rows, ["Lovey Icon 5"], at)?.costYuan, "15");
  assert.equal(pickCost(rows, ["Lovey Icon 5"], at, true)?.costYuan, "3");
});

test("dated promo row applies to discounted units only inside its dates (end day inclusive)", () => {
  const csv = '"ชื่ออังกฤษ","ชื่อจีน","ราคา (หยวน)","เริ่มโปร","สิ้นสุดโปร"\n"A","甲","10","",""\n"A (ราคาพิเศษ)","甲","6","1/10/2026","15/10/2026"';
  const { rows } = parseCostTab("T", csv);
  assert.equal(pickCost(rows, ["A"], new Date("2026-10-15T16:00:00Z"), true)?.costYuan, "6"); // 23:00 Bangkok, last day
  assert.equal(pickCost(rows, ["A"], new Date("2026-10-15T17:30:00Z"), true)?.costYuan, "10"); // next day
  assert.equal(pickCost(rows, ["A"], new Date("2026-10-10T10:00:00Z"))?.costYuan, "10"); // full price
});

test("dates: ISO, day-first and Buddhist year", () => {
  assert.equal(parseSheetDate("2026-10-01")?.toISOString(), "2026-09-30T17:00:00.000Z");
  assert.equal(parseSheetDate("1/10/2569")?.toISOString(), "2026-09-30T17:00:00.000Z");
  assert.equal(parseSheetDate("13/13/2026"), null);
  assert.equal(parseSheetDate("31/02/2026"), null);
  assert.equal(parseSheetDate(""), null);
});

test("cost in satang and sheet id parsing", () => {
  assert.equal(costSatang("13.4", "5.1"), 6834);
  assert.equal(costSatang("9", "5.1"), 4590);
  const id = "15CgKY95NTakwCAwxV9-Lcj7YADix6Dn3etf5WKp3S6U";
  assert.equal(parseSheetId(`https://docs.google.com/spreadsheets/d/${id}/edit?gid=606322286#gid=606322286`), id);
  assert.equal(parseSheetId(id), id);
  assert.equal(parseSheetId("https://evil.example/x"), null);
});

test("tab list comes from the htmlview page, escapes decoded", async () => {
  const { parseSheetTabs } = await import("./sheet");
  const html = 'x items.push({name: "Hot (\u70ed\u724c)", pageUrl: "https://docs.google.com/spreadsheets/d/X/htmlview/sheet?headers=true&gid=606322286", gid: "606322286"}); items.push({name: "HF", pageUrl: "https://x/sheet?gid=931051236"});';
  const tabs = parseSheetTabs(html);
  assert.equal(tabs.get("Hot (热牌)"), "606322286");
  assert.equal(tabs.get("HF"), "931051236");
  assert.equal(tabs.size, 2);
});

test("variant lines use '<product> (<variant>)', else the product row; conflicts are reported", async () => {
  const { pickLineCost, conflictingRows } = await import("./sheet");
  const csv = [
    '"ชื่ออังกฤษ","ชื่อจีน","ราคา (หยวน)"',
    '"Chibi Head2","大头2","40"',
    '"Chibi Head2(1)","大头2 (1)","15"',
    '"Chibi Head4 (2)","大头4 (2)","15"',
    '"Chibi Head4 (2)","大头4 (2)","3"',
    '"Odd","x","1"',
    '"Odd","x","2"',
    '"Odd","x","3"',
  ].join("\n");
  const { rows } = parseCostTab("Rope", csv);
  const product = { nameEN: "Chibi Head 2", nameTH: "Chibi Head 2" };
  const at = new Date();
  assert.equal(pickLineCost(rows, product, { nameEN: "1", nameTH: "1" }, at)?.costYuan, "15");
  assert.equal(pickLineCost(rows, product, { nameEN: "1+2+3", nameTH: "1+2+3" }, at)?.costYuan, "40");
  assert.equal(pickLineCost(rows, product, null, at)?.costYuan, "40");
  assert.deepEqual(conflictingRows(rows), ["Rope › Odd (1 / 2 / 3 ¥)"]);
});
