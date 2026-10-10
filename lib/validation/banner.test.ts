import { test } from "node:test";
import assert from "node:assert/strict";
import { announcementBarSchema, bannerSchema, isSafeLink, stripLocalePrefix } from "./banner";

test("links: site paths and http(s) only", () => {
  for (const ok of ["/shop", "/th/product/x?y=1", "https://remii.cc/en", "http://example.com"]) assert.equal(isSafeLink(ok), true, ok);
  for (const bad of ["//evil.com", "/\\evil.com", "javascript:alert(1)", "data:text/html,x", "shop", "ftp://x"]) {
    assert.equal(isSafeLink(bad), false, bad);
  }
});

test("internal links lose a stored locale prefix", () => {
  assert.equal(stripLocalePrefix("/th/shop"), "/shop");
  assert.equal(stripLocalePrefix("/en"), "/");
  assert.equal(stripLocalePrefix("/shop"), "/shop");
  assert.equal(stripLocalePrefix("/thai-brushes"), "/thai-brushes");
});

const banner = {
  titleTH: "หัวข้อ",
  titleEN: "Title",
  descriptionTH: "",
  descriptionEN: "",
  ctaTH: "",
  ctaEN: "",
  link: "",
  theme: "PINK",
  imageFocusX: "50",
  imageFocusY: "50",
  imageZoom: "100",
  bgColor: "",
  fadeDirection: "LEFT",
  fadeStrength: "100",
  tintImage: true,
  textBlur: "50",
  fullBlur: false,
  startAt: "",
  endAt: "",
  isActive: true,
};

test("banner: a button needs a link, and end must follow start", () => {
  assert.equal(bannerSchema.safeParse(banner).success, true);
  assert.equal(bannerSchema.safeParse({ ...banner, ctaTH: "ดู" }).success, false);
  assert.equal(bannerSchema.safeParse({ ...banner, ctaTH: "ดู", link: "/shop" }).success, true);
  assert.equal(bannerSchema.safeParse({ ...banner, startAt: "2026-10-10T10:00", endAt: "2026-10-10T09:00" }).success, false);
  assert.equal(bannerSchema.safeParse({ ...banner, theme: "RED" }).success, false);
  assert.equal(bannerSchema.safeParse({ ...banner, imageFocusY: "101" }).success, false);
  assert.equal(bannerSchema.safeParse({ ...banner, imageZoom: "99" }).success, false);
  assert.equal(bannerSchema.safeParse({ ...banner, imageZoom: "250" }).success, true);
  assert.equal(bannerSchema.safeParse({ ...banner, bgColor: "#ABCDEF" }).data?.bgColor, "#abcdef");
  assert.equal(bannerSchema.safeParse({ ...banner, bgColor: "red" }).success, false);
  assert.equal(bannerSchema.safeParse({ ...banner, fadeDirection: "DIAGONAL" }).success, false);
  assert.equal(bannerSchema.safeParse({ ...banner, fadeStrength: "101" }).success, false);
});

test("announcement bar: needs Thai text before it can be shown", () => {
  assert.equal(announcementBarSchema.safeParse({ enabled: true, textTH: "", textEN: "", link: "" }).success, false);
  assert.equal(announcementBarSchema.safeParse({ enabled: false, textTH: "", textEN: "", link: "" }).success, true);
  const ok = announcementBarSchema.parse({ enabled: true, textTH: " ปิดปรับปรุง ", textEN: "", link: "" });
  assert.deepEqual(ok, { enabled: true, textTH: "ปิดปรับปรุง", textEN: null, link: null, scroll: false });
});

test("banner image keys are tied to their banner", async () => {
  const { isBannerImagePath, newBannerImagePath } = await import("../banners/paths");
  const id = "0199c1a2-0000-7000-8000-000000000001";
  const key = newBannerImagePath(id, "Art.PNG");
  assert.match(key, /^banners\/0199c1a2-0000-7000-8000-000000000001\/[0-9a-f-]{36}\.png$/);
  assert.equal(isBannerImagePath(id, key), true);
  assert.equal(isBannerImagePath("0199c1a2-0000-7000-8000-000000000002", key), false);
  assert.equal(isBannerImagePath(id, `../${key}`), false);
});

test("stored links resolve to router paths or new-tab URLs, never anything else", async () => {
  const { resolveLink } = await import("../banners/display");
  assert.deepEqual(resolveLink("/th/shop?sort=best-selling"), { href: "/shop?sort=best-selling", external: false });
  assert.deepEqual(resolveLink("https://x.dev/a"), { href: "https://x.dev/a", external: true });
  assert.equal(resolveLink("javascript:alert(1)"), null);
  assert.equal(resolveLink(null), null);
});

test("banner state follows the live rule", async () => {
  const { bannerState } = await import("../banners/rules");
  const now = new Date("2026-10-10T12:00:00Z");
  const at = (h: number) => new Date(now.getTime() + h * 3_600_000);
  assert.equal(bannerState({ isActive: true, startAt: null, endAt: null }, now), "LIVE");
  assert.equal(bannerState({ isActive: false, startAt: null, endAt: null }, now), "OFF");
  assert.equal(bannerState({ isActive: true, startAt: at(1), endAt: null }, now), "SCHEDULED");
  assert.equal(bannerState({ isActive: true, startAt: null, endAt: now }, now), "ENDED");
  assert.equal(bannerState({ isActive: true, startAt: at(-1), endAt: at(1) }, now), "LIVE");
});
