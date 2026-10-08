import { test } from "node:test";
import assert from "node:assert/strict";
import { bulkDownloadFileIds, canAccessFile, lineHasFiles } from "./rules";

test("canAccessFile: shared files go to every buyer of the product", () => {
  assert.equal(canAccessFile(null, new Set([null])), true);
  assert.equal(canAccessFile(null, new Set(["va"])), true);
  assert.equal(canAccessFile(null, new Set()), false);
});

test("canAccessFile: variant files only go to buyers of that variant", () => {
  assert.equal(canAccessFile("va", new Set(["va"])), true);
  assert.equal(canAccessFile("vb", new Set(["va"])), false);
  // Bought before the product had variants: shared files only.
  assert.equal(canAccessFile("va", new Set([null])), false);
});

test("lineHasFiles: shared files count for every line, variant files only for their variant", () => {
  assert.equal(lineHasFiles([], null), false);
  assert.equal(lineHasFiles([{ variantId: null }], null), true);
  assert.equal(lineHasFiles([{ variantId: null }], "va"), true);
  assert.equal(lineHasFiles([{ variantId: "va" }], "va"), true);
  assert.equal(lineHasFiles([{ variantId: "va" }], "vb"), false);
  assert.equal(lineHasFiles([{ variantId: "va" }], null), false);
});

test("bulkDownloadFileIds: latest version only, skipping files at their limit", () => {
  const versions = [
    { isLatest: false, files: [{ id: "old", downloadCount: 0 }] },
    { isLatest: true, files: [{ id: "a", downloadCount: 0 }, { id: "b", downloadCount: 5 }] },
  ];
  assert.deepEqual(bulkDownloadFileIds(versions, null), ["a", "b"]);
  assert.deepEqual(bulkDownloadFileIds(versions, 5), ["a"]);
  assert.deepEqual(bulkDownloadFileIds([], null), []);
});
