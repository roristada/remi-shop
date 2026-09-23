import { test } from "node:test";
import assert from "node:assert/strict";
import { checkFileMeta, checkFileSignature, DIGITAL_FILE_TYPES, IMAGE_FILE_TYPES } from "./file-types";

const bytes = (...b: number[]) => new Uint8Array(b);
const text = (s: string) => new TextEncoder().encode(s);

test("meta: extension allowlist and size", () => {
  assert.equal(checkFileMeta(DIGITAL_FILE_TYPES, "pack.zip", 1000), null);
  assert.equal(checkFileMeta(DIGITAL_FILE_TYPES, "PACK.BRUSHSET", 1000), null);
  assert.equal(checkFileMeta(DIGITAL_FILE_TYPES, "virus.exe", 1000), "unsupported_type");
  assert.equal(checkFileMeta(DIGITAL_FILE_TYPES, "noext", 1000), "unsupported_type");
  assert.equal(checkFileMeta(DIGITAL_FILE_TYPES, "pack.zip", 0), "empty");
  assert.equal(checkFileMeta(DIGITAL_FILE_TYPES, "pack.zip", 5 * 1024 * 1024 + 1), "too_large");
  assert.equal(checkFileMeta(IMAGE_FILE_TYPES, "cover.svg", 1000), "unsupported_type");
});

test("signature: known formats must match", () => {
  assert.equal(checkFileSignature(DIGITAL_FILE_TYPES, "a.zip", bytes(0x50, 0x4b, 0x03, 0x04, 0)), null);
  assert.equal(checkFileSignature(DIGITAL_FILE_TYPES, "a.zip", text("hello")), "signature_mismatch");
  assert.equal(
    checkFileSignature(IMAGE_FILE_TYPES, "a.webp", text("RIFF\x10\x00\x00\x00WEBPVP8 ")),
    null,
  );
  assert.equal(checkFileSignature(IMAGE_FILE_TYPES, "a.png", bytes(0xff, 0xd8, 0xff)), "signature_mismatch");
});

test("signature: executables and HTML are rejected even for opaque formats", () => {
  assert.equal(checkFileSignature(DIGITAL_FILE_TYPES, "brush.abr", bytes(0x00, 0x06, 0x00, 0x02)), null);
  assert.equal(checkFileSignature(DIGITAL_FILE_TYPES, "brush.abr", text("MZ\x90\x00")), "signature_mismatch");
  assert.equal(checkFileSignature(DIGITAL_FILE_TYPES, "x.svg", text("  <!DOCTYPE html><p>")), "signature_mismatch");
  assert.equal(checkFileSignature(DIGITAL_FILE_TYPES, "x.cube", text("#!/bin/sh")), "signature_mismatch");
  assert.equal(checkFileSignature(DIGITAL_FILE_TYPES, "x.cube", text("TITLE \"Warm\"\nLUT_3D_SIZE 33")), null);
});
