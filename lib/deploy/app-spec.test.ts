import { test } from "node:test";
import assert from "node:assert/strict";
import { renderAppSpec } from "./app-spec";

const from = (vars: Record<string, string>) => (key: string) => vars[key];

test("fills placeholders with quoted values", () => {
  const out = renderAppSpec("branch: ${DEPLOY_BRANCH}\nvalue: ${A_KEY}", from({ DEPLOY_BRANCH: "master", A_KEY: "x" }));
  assert.equal(out, 'branch: "master"\nvalue: "x"');
});

test("quotes values so special characters survive", () => {
  const out = renderAppSpec("value: ${EMAIL_FROM}\nsecret: ${PW}", from({ EMAIL_FROM: "REMII <noreply@remii.cc>", PW: 'a"b #c: d' }));
  assert.equal(out, 'value: "REMII <noreply@remii.cc>"\nsecret: "a\\"b #c: d"');
});

test("throws listing every missing key once", () => {
  assert.throws(() => renderAppSpec("${A} ${B} ${A}", from({})), /Missing values for: A, B$/);
});

test("treats an empty value as missing", () => {
  assert.throws(() => renderAppSpec("value: ${SLIPOK_API_KEY}", from({ SLIPOK_API_KEY: "" })), /SLIPOK_API_KEY/);
});

test("leaves text without placeholders alone", () => {
  assert.equal(renderAppSpec("name: remi-shop\n", from({})), "name: remi-shop\n");
});
