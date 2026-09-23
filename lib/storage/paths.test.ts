import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeFileName } from "./paths";
import { getExtension } from "./file-types";

test("keeps the extension for non-ASCII names", () => {
  assert.equal(sanitizeFileName("แปรงสีน้ำ.brushset"), "file.brushset");
  assert.equal(sanitizeFileName("ชุด A.zip"), "A.zip");
  assert.equal(getExtension(sanitizeFileName("แปรงสีน้ำ.brushset")), "brushset");
});

test("strips paths and unsafe characters", () => {
  assert.equal(sanitizeFileName("brush pack (v2).ZIP"), "brush-pack-v2.zip");
  assert.equal(sanitizeFileName("../../etc/passwd"), "passwd");
  assert.equal(sanitizeFileName("C:\\Users\\a\\pack.zip"), "pack.zip");
  assert.equal(sanitizeFileName(".hidden"), "hidden");
  assert.equal(sanitizeFileName(""), "file");
});
