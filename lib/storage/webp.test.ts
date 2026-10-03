import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { optimizedPath, pickServedPath, toWebp, worthEncoding } from "./webp";

async function animatedGif(width: number, height: number, frames: number) {
  const raw = await Promise.all(
    Array.from({ length: frames }, (_, i) =>
      sharp({ create: { width, height, channels: 3, background: { r: i * 80, g: 120, b: 200 } } }).raw().toBuffer(),
    ),
  );
  return sharp(Buffer.concat(raw), { raw: { width, height: height * frames, channels: 3, pageHeight: height } })
    .gif({ delay: Array(frames).fill(150), loop: 0 })
    .toBuffer();
}

test("optimizedPath swaps the extension for the size", () => {
  assert.equal(optimizedPath("products/p/abc.gif", "card"), "products/p/abc.card.webp");
  assert.equal(optimizedPath("products/p/variants/x.png", "detail"), "products/p/variants/x.detail.webp");
});

test("toWebp keeps every frame of an animated GIF and resizes it", async () => {
  const out = await toWebp(await animatedGif(1200, 900, 3), "card");
  const meta = await sharp(out, { animated: true }).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.pages, 3);
  assert.equal(meta.width, 640);
  assert.deepEqual(meta.delay, [150, 150, 150]);
});

test("toWebp never enlarges a small image", async () => {
  const png = await sharp({ create: { width: 300, height: 200, channels: 4, background: "#fff" } }).png().toBuffer();
  const meta = await sharp(await toWebp(png, "detail")).metadata();
  assert.equal(meta.width, 300);
  assert.equal(meta.format, "webp");
});

test("pickServedPath keeps the original when the copy is not smaller", () => {
  assert.equal(pickServedPath({ path: "a.gif", bytes: 100 }, { path: "a.card.webp", bytes: 60 }), "a.card.webp");
  assert.equal(pickServedPath({ path: "a.gif", bytes: 100 }, { path: "a.card.webp", bytes: 140 }), "a.gif");
});

test("worthEncoding skips animations that are already small enough", () => {
  assert.equal(worthEncoding({ width: 900, frames: 75 }, "detail"), false);
  assert.equal(worthEncoding({ width: 900, frames: 75 }, "card"), true);
  assert.equal(worthEncoding({ width: 500, frames: 10 }, "card"), false);
  assert.equal(worthEncoding({ width: 900, frames: 1 }, "detail"), true);
});
