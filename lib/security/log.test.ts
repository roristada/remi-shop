import { test } from "node:test";
import assert from "node:assert/strict";
import { clientMeta, isProbePath, maskIp } from "./log";

test("flags common scanner paths", () => {
  for (const p of ["/.env", "/.git/config", "/wp-admin/", "/wp-login.php", "/th/wp-content/x", "/index.php", "/phpmyadmin", "/backup.sql"]) {
    assert.equal(isProbePath(p), true, p);
  }
});

test("leaves real app paths alone", () => {
  for (const p of ["/", "/th/shop", "/en/products/watercolor-brush", "/admin/orders", "/api/download/abc", "/th/environment-pack"]) {
    assert.equal(isProbePath(p), false, p);
  }
});

test("masks IPv4 to /24 and IPv6 to /48", () => {
  assert.equal(maskIp("203.0.113.77"), "203.0.113.0/24");
  assert.equal(maskIp("203.0.113.77, 10.0.0.1"), "203.0.113.0/24");
  assert.equal(maskIp("2001:db8:abcd:12::1"), "2001:db8:abcd::/48");
  assert.equal(maskIp(null), null);
  assert.equal(maskIp("garbage"), null);
});

test("reads Netlify client headers", () => {
  const meta = clientMeta(new Headers({ "x-nf-client-connection-ip": "198.51.100.9", "x-country": "TH", "user-agent": "curl/8" }));
  assert.deepEqual(meta, { ip: "198.51.100.0/24", country: "TH", ua: "curl/8" });
});
