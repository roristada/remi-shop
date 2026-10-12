import { test } from "node:test";
import assert from "node:assert/strict";
import { diffAnswers, legacyColumns, parseFieldOptions, resolveAnswers, type FormFieldDef } from "./form-fields";

const field = (over: Partial<FormFieldDef>): FormFieldDef => ({
  id: "f",
  key: null,
  labelTH: "ป้าย",
  labelEN: "Label",
  type: "TEXT",
  isRequired: false,
  options: [],
  ...over,
});

const opts = [
  { id: "a", th: "เชิงพาณิชย์", en: "Commercial" },
  { id: "b", th: "สื่อ", en: "" },
  { id: "c", th: "โฆษณา", en: "Ads" },
];

test("text answers are trimmed, required and length-checked", () => {
  const fields = [field({ id: "n", key: "buyerName", isRequired: true }), field({ id: "e", type: "EMAIL" }), field({ id: "x", type: "TEXTAREA" })];
  assert.deepEqual(resolveAnswers(fields, { n: "  ", e: "bad" }), { ok: false, errors: { "answers.n": "required", "answers.e": "invalid_email" } });
  const r = resolveAnswers(fields, { n: " ก ", e: "a@b.co", x: "" });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.deepEqual(r.answers.map((a) => [a.fieldId, a.values, a.sortOrder]), [["n", ["ก"], 0], ["e", ["a@b.co"], 1]]);
  }
  assert.deepEqual(resolveAnswers([field({ id: "t" })], { t: "x".repeat(201) }), { ok: false, errors: { "answers.t": "too_long" } });
});

test("choices must be options of the field; checkbox keeps the admin's order", () => {
  const radio = field({ id: "r", type: "RADIO", options: opts, isRequired: true });
  const box = field({ id: "c", type: "CHECKBOX", options: opts });
  assert.deepEqual(resolveAnswers([radio], { r: "zzz" }), { ok: false, errors: { "answers.r": "invalid_choice" } });
  assert.deepEqual(resolveAnswers([radio], { r: ["a", "b"] }), { ok: false, errors: { "answers.r": "invalid_choice" } });
  assert.deepEqual(resolveAnswers([radio], {}), { ok: false, errors: { "answers.r": "required" } });
  const r = resolveAnswers([radio, box], { r: "b", c: ["c", "a", "a"] });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.deepEqual(r.answers[0].values, ["สื่อ"]);
    assert.deepEqual(r.answers[0].valuesEN, ["สื่อ"]); // no English label → Thai
    assert.deepEqual(r.answers[1].values, ["เชิงพาณิชย์", "โฆษณา"]);
  }
});

test("non-object input and unknown keys are ignored", () => {
  assert.deepEqual(resolveAnswers([field({ id: "a" })], "nope"), { ok: true, answers: [] });
  assert.deepEqual(resolveAnswers([field({ id: "a" })], { other: "x" }), { ok: true, answers: [] });
});

test("legacy columns come from built-in keys only", () => {
  const cols = legacyColumns([
    { key: "artistName", type: "TEXT", values: ["Mei"] },
    { key: "platform", type: "CHECKBOX", values: ["Etsy", "Shopee"] },
    { key: "buyerContact", type: "FILE", values: ["card.png"] },
    { key: null, type: "TEXT", values: ["custom"] },
  ]);
  assert.equal(cols.artistName, "Mei");
  assert.equal(cols.platform, "Etsy, Shopee");
  assert.equal(cols.buyerContact, null);
  assert.equal(cols.buyerName, null);
});

test("options parse defensively", () => {
  assert.deepEqual(parseFieldOptions([{ id: "a", th: " x ", en: "" }]), [{ id: "a", th: "x", en: "" }]);
  assert.deepEqual(parseFieldOptions("[]"), []);
  assert.deepEqual(parseFieldOptions([{ id: "", th: "x", en: "" }]), []);
});

test("diff lists changed, added and cleared answers", () => {
  const before = [
    { fieldId: "a", labelTH: "A", labelEN: "A", values: ["1"] },
    { fieldId: "b", labelTH: "B", labelEN: "B", values: ["x"] },
  ];
  const after = [
    { fieldId: "a", labelTH: "A", labelEN: "A", values: ["1"] },
    { fieldId: "c", labelTH: "C", labelEN: "C", values: ["new"] },
  ];
  assert.deepEqual(diffAnswers(before, after), [
    { labelTH: "B", labelEN: "B", before: "x", after: "" },
    { labelTH: "C", labelEN: "C", before: "", after: "new" },
  ]);
});

test("stored answers map back to form values", async () => {
  const { answerValuesFor } = await import("./form-fields");
  const fields = [field({ id: "t" }), field({ id: "c", type: "CHECKBOX", options: opts }), field({ id: "d", type: "DROPDOWN", options: opts })];
  assert.deepEqual(
    answerValuesFor(fields, [
      { fieldId: "t", values: ["hi"] },
      { fieldId: "c", values: ["โฆษณา", "เชิงพาณิชย์"] },
      { fieldId: "d", values: ["ลบไปแล้ว"] },
      { fieldId: null, values: ["x"] },
    ]),
    { t: "hi", c: ["a", "c"] },
  );
});

test("URL answers need an http(s) link; a missing scheme means https", async () => {
  const { resolveAnswers: resolve } = await import("./form-fields");
  const url = field({ id: "u", type: "URL" });
  const r = resolve([url], { u: " example.com/shop " });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.answers[0].values, ["https://example.com/shop"]);
  for (const bad of ["javascript:alert(1)", "ftp://example.com", "not a link", "https://localhost"]) {
    assert.deepEqual(resolve([url], { u: bad }), { ok: false, errors: { "answers.u": "invalid_url" } }, bad);
  }
});

test("FILE answers keep the key separately and must be the customer's own upload", async () => {
  const { resolveAnswers: resolve } = await import("./form-fields");
  const file = field({ id: "f", type: "FILE", isRequired: true });
  const own = (p: string) => p.startsWith("me/");
  assert.deepEqual(resolve([file], {}, own), { ok: false, errors: { "answers.f": "required" } });
  assert.deepEqual(resolve([file], { f: "me/x.pdf" }, own), { ok: false, errors: { "answers.f": "invalid_file" } });
  assert.deepEqual(resolve([file], { f: { path: "other/x.pdf", name: "x.pdf" } }, own), { ok: false, errors: { "answers.f": "invalid_file" } });
  const r = resolve([file], { f: { path: "me/x.pdf", name: " plan.pdf " } }, own);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual([r.answers[0].values, r.answers[0].filePath], [["plan.pdf"], "me/x.pdf"]);
});

test("stored FILE answers come back as path + name for editing", async () => {
  const { answerValuesFor } = await import("./form-fields");
  const file = field({ id: "f", type: "FILE" });
  assert.deepEqual(answerValuesFor([file], [{ fieldId: "f", values: ["a.pdf"], filePath: "me/a.pdf" }]), { f: { path: "me/a.pdf", name: "a.pdf" } });
});

test("answers move to the other usage type's form by built-in key or same question", async () => {
  const { carryAnswers } = await import("./form-fields");
  const from = [
    { id: "a1", key: "buyerName", labelTH: "ชื่อ", type: "TEXT" as const },
    { id: "a2", key: null, labelTH: "จำนวนผลิต", type: "TEXT" as const },
    { id: "a3", key: null, labelTH: "ไฟล์", type: "FILE" as const },
  ];
  const to = [
    { id: "b1", key: "buyerName", labelTH: "ชื่อผู้ซื้อ", type: "TEXT" as const },
    { id: "b2", key: null, labelTH: "จำนวนผลิต", type: "TEXT" as const },
    { id: "b3", key: null, labelTH: "ไฟล์", type: "FILE" as const },
    { id: "b4", key: null, labelTH: "อื่น", type: "TEXT" as const },
  ];
  const out = carryAnswers(from, to, { a1: "Mali", a2: "100", a3: { path: "me/x.pdf", name: "x.pdf" }, b4: "kept" });
  assert.equal(out.b1, "Mali");
  assert.equal(out.b2, "100");
  assert.equal(out.b3, undefined);
  assert.equal(out.b4, "kept");
});
