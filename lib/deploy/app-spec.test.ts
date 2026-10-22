import { test } from "node:test";
import assert from "node:assert/strict";
import { envLookup, renderAppSpec } from "./app-spec";

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

test("envLookup: shell first, then files in order", () => {
  const lookup = envLookup({ A: "shell" }, [{ A: "local", B: "local" }, { B: "base", C: "base" }], []);
  assert.deepEqual([lookup("A"), lookup("B"), lookup("C"), lookup("D")], ["shell", "local", "base", undefined]);
});

test("envLookup: shell-only keys never fall back to .env files", () => {
  const lookup = envLookup({}, [{ NEXT_PUBLIC_SITE_URL: "http://localhost:3000" }], ["NEXT_PUBLIC_SITE_URL"]);
  assert.equal(lookup("NEXT_PUBLIC_SITE_URL"), undefined);
  assert.throws(() => renderAppSpec("value: ${NEXT_PUBLIC_SITE_URL}", lookup), /NEXT_PUBLIC_SITE_URL/);
});
