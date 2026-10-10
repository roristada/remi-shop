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
    { key: "artistName", values: ["Mei"] },
    { key: "platform", values: ["Etsy", "Shopee"] },
    { key: null, values: ["custom"] },
  ]);
  assert.equal(cols.artistName, "Mei");
  assert.equal(cols.platform, "Etsy, Shopee");
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
