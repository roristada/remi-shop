import { test } from "node:test";
import assert from "node:assert/strict";
import { fadeStyle, inkFor } from "./look";

test("ink follows the fill's lightness", () => {
  assert.equal(inkFor("#f6bfd4"), "#2a1f2d"); // pastel pink
  assert.equal(inkFor("#fff0b8"), "#2a1f2d"); // butter
  assert.equal(inkFor("#3a2f63"), "#ffffff"); // deep violet
  assert.equal(inkFor("#000000"), "#ffffff");
  assert.equal(inkFor("#b0426b"), "#ffffff"); // cherry
});

test("fade: direction picks the solid side, strength scales it, none/0 removes it", () => {
  const left = fadeStyle("#e4d9fb", "LEFT", 100)!;
  assert.match(left.backgroundImage, /^linear-gradient\(to right, color-mix\(in srgb, #e4d9fb 92%, transparent\) 0%/);
  assert.match(fadeStyle("#e4d9fb", "BOTTOM", 50)!.backgroundImage, /^linear-gradient\(to top, color-mix\(in srgb, #e4d9fb 46%/);
  assert.equal(fadeStyle("#e4d9fb", "NONE", 80), null);
  assert.equal(fadeStyle("#e4d9fb", "RIGHT", 0), null);
});

test("text blur strength maps to 0–16px", async () => {
  const { textBlurPx } = await import("./look");
  assert.equal(textBlurPx(0), 0);
  assert.equal(textBlurPx(50), 8);
  assert.equal(textBlurPx(100), 16);
  assert.equal(textBlurPx(250), 16);
});

test("progressive blur: weaker layers reach further right; none at 0", async () => {
  const { textBlurLayers } = await import("./look");
  const layers = textBlurLayers(100);
  assert.deepEqual(layers.map((l) => l.px), [3, 8, 16]);
  const ends = layers.map((l) => Number(/transparent (\d+)%/.exec(l.mask)![1]));
  assert.deepEqual(ends, [70, 54, 40]);
  assert.deepEqual(textBlurLayers(0), []);
  assert.deepEqual(textBlurLayers(10).map((l) => l.px), [1, 2]);
});

test("full blur: whole card, heaviest left, never sharp on the right", async () => {
  const { cardBlurLayers, textBlurLayers } = await import("./look");
  assert.deepEqual(cardBlurLayers(60, false), textBlurLayers(60));
  const on = cardBlurLayers(60, true);
  assert.equal(on[0].mask, "none");
  assert.deepEqual(on.map((l) => l.px), [3, 3, 5, 10]);
  assert.deepEqual(cardBlurLayers(0, true).map((l) => l.px), [2]);
});
