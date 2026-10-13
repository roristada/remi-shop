import { test } from "node:test";
import assert from "node:assert/strict";
import { contactChannelsSchema, contactHref, contactValueError } from "./rules";

test("contactValueError accepts only links of the right kind", () => {
  assert.equal(contactValueError("LINE", "https://lin.ee/abc"), null);
  assert.equal(contactValueError("FACEBOOK", "facebook.com/page"), "ต้องเป็นลิงก์ที่ขึ้นต้นด้วย https://");
  // Script and other schemes never become links.
  assert.notEqual(contactValueError("WEBSITE", "javascript:alert(1)"), null);
  assert.notEqual(contactValueError("WEBSITE", "data:text/html,hi"), null);
  assert.equal(contactValueError("EMAIL", "shop@example.com"), null);
  assert.notEqual(contactValueError("EMAIL", "https://example.com"), null);
  assert.equal(contactValueError("PHONE", "081-234 5678"), null);
  assert.equal(contactValueError("PHONE", "+66812345678"), null);
  assert.notEqual(contactValueError("PHONE", "call me"), null);
});

test("contactHref", () => {
  assert.equal(contactHref("EMAIL", "shop@example.com"), "mailto:shop@example.com");
  assert.equal(contactHref("PHONE", "081-234 5678"), "tel:0812345678");
  assert.equal(contactHref("INSTAGRAM", "https://instagram.com/remii"), "https://instagram.com/remii");
});

test("contactChannelsSchema trims, keeps order and reports the failing row", () => {
  const ok = contactChannelsSchema.safeParse([
    { type: "LINE", label: " @remii ", value: " https://lin.ee/abc " },
    { type: "EMAIL", label: "Email", value: "shop@example.com" },
  ]);
  assert.ok(ok.success);
  assert.deepEqual(ok.data[0], { type: "LINE", label: "@remii", value: "https://lin.ee/abc" });

  const bad = contactChannelsSchema.safeParse([
    { type: "LINE", label: "ok", value: "https://lin.ee/abc" },
    { type: "WEBSITE", label: "x", value: "javascript:alert(1)" },
  ]);
  assert.ok(!bad.success);
  assert.deepEqual(bad.error.issues[0].path, [1, "value"]);
  assert.ok(!contactChannelsSchema.safeParse([{ type: "SMS", label: "a", value: "b" }]).success);
});
