import { test } from "node:test";
import assert from "node:assert/strict";
import { isPromptPayId, promptPayPayload } from "./promptpay";

// Reference payloads produced by the promptpay-qr npm package (dtinth/promptpay-qr).
test("promptPayPayload matches reference payloads", () => {
  assert.equal(
    promptPayPayload("081-234-5678", 422),
    "00020101021229370016A000000677010111011300668123456785802TH530376454044.2263045D49",
  );
  assert.equal(
    promptPayPayload("0812345678", 125_000),
    "00020101021229370016A000000677010111011300668123456785802TH530376454071250.0063040256",
  );
  assert.equal(
    promptPayPayload("1234567890123", 9_950),
    "00020101021229370016A000000677010111021312345678901235802TH5303764540599.5063041234",
  );
  assert.equal(
    promptPayPayload("012345678901234", 1),
    "00020101021229390016A00000067701011103150123456789012345802TH530376454040.016304EFEA",
  );
});

test("promptPayPayload rejects bad input", () => {
  assert.throws(() => promptPayPayload("12345", 100));
  assert.throws(() => promptPayPayload("0812345678", 0));
  assert.throws(() => promptPayPayload("0812345678", 10.5));
});

test("isPromptPayId", () => {
  assert.equal(isPromptPayId("081 234 5678"), true);
  assert.equal(isPromptPayId("1234567890123"), true);
  assert.equal(isPromptPayId("08123"), false);
});
