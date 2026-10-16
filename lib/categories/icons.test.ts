import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORY_ICON_KEYS, CATEGORY_ICON_LABEL_TH, guessIconKey, isCategoryIconKey, resolveIconKey } from "./icons";

test("guessIconKey keeps the current categories' icons", () => {
  assert.equal(guessIconKey("brushes"), "brush");
  assert.equal(guessIconKey("bases"), "base");
  assert.equal(guessIconKey("graphic-templates"), "template");
  assert.equal(guessIconKey("stickers-emotes"), "sticker");
  assert.equal(guessIconKey("assets"), "assets");
});

test("guessIconKey: new kinds, specific words before the pack catch-all", () => {
  assert.equal(guessIconKey("paper-textures"), "texture");
  assert.equal(guessIconKey("fonts"), "font");
  assert.equal(guessIconKey("color-palettes"), "palette");
  assert.equal(guessIconKey("brush-pack"), "brush");
  assert.equal(guessIconKey("starter-pack"), "bundle");
  assert.equal(guessIconKey("3d-models"), "model");
  assert.equal(guessIconKey("misc"), "file");
});

test("resolveIconKey prefers a valid admin pick", () => {
  assert.equal(resolveIconKey("font", "brushes"), "font");
  assert.equal(resolveIconKey("nope", "brushes"), "brush");
  assert.equal(resolveIconKey(null, "misc"), "file");
  assert.equal(isCategoryIconKey("<script>"), false);
});

test("every icon has an admin label", () => {
  for (const key of CATEGORY_ICON_KEYS) assert.ok(CATEGORY_ICON_LABEL_TH[key]);
});
