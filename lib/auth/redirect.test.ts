import { test } from "node:test";
import assert from "node:assert/strict";
import { absoluteUrl } from "./redirect";

function withSiteUrl(value: string | undefined, fn: () => void) {
  const before = process.env.NEXT_PUBLIC_SITE_URL;
  if (value === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = value;
  try {
    fn();
  } finally {
    if (before === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = before;
  }
}

test("absoluteUrl: builds on the public site URL, never the server's own host", () => {
  withSiteUrl("https://remii.cc", () => {
    assert.equal(absoluteUrl("/th/forgot-password?error=link_invalid").href, "https://remii.cc/th/forgot-password?error=link_invalid");
  });
});

test("absoluteUrl: a trailing slash on the site URL does not double up", () => {
  withSiteUrl("https://remii.cc/", () => {
    assert.equal(absoluteUrl("/th/login?next=%2Fth%2Fdownloads").href, "https://remii.cc/th/login?next=%2Fth%2Fdownloads");
  });
});

test("absoluteUrl: falls back to localhost:3000 when the site URL is unset", () => {
  withSiteUrl(undefined, () => {
    assert.equal(absoluteUrl("/th/account").href, "http://localhost:3000/th/account");
  });
});
