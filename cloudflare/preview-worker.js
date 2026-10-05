/**
 * Cloudflare Worker that serves product preview images from the R2 bucket (read-only).
 * Deployed from the Cloudflare dashboard with an R2 binding named PREVIEWS; its URL is
 * NEXT_PUBLIC_PREVIEW_IMAGE_URL. Uploads do not go through here (presigned PUTs to R2 directly).
 */
/** Served type comes from the key's extension, never from stored metadata (an upload URL can be reused). */
const IMAGE_TYPES = new Map([
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["webp", "image/webp"],
  ["gif", "image/gif"],
]);

const worker = {
  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405, headers: { allow: "GET, HEAD" } });
    }

    let key;
    try {
      key = decodeURIComponent(new URL(request.url).pathname.slice(1));
    } catch {
      return new Response("Bad Request", { status: 400 });
    }
    // A single object key only; the bucket is never listed.
    if (!key || key.endsWith("/") || key.includes("..")) return new Response("Not Found", { status: 404 });

    const object =
      request.method === "HEAD"
        ? await env.PREVIEWS.head(key)
        : await env.PREVIEWS.get(key, { onlyIf: request.headers, range: request.headers });
    if (!object) return new Response("Not Found", { status: 404 });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    if (!headers.has("cache-control")) headers.set("cache-control", "public, max-age=31536000, immutable");
    // Only raster images by extension render inline; anything else downloads.
    const type = IMAGE_TYPES.get(key.split(".").pop().toLowerCase());
    if (type) {
      headers.set("content-type", type);
      headers.delete("content-disposition");
    } else {
      headers.set("content-type", "application/octet-stream");
      headers.set("content-disposition", "attachment");
    }
    headers.set("content-security-policy", "default-src 'none'; sandbox");
    headers.set("x-content-type-options", "nosniff");

    // Conditional GET matched (If-None-Match): the browser's copy is current.
    if (request.method === "GET" && !("body" in object)) return new Response(null, { status: 304, headers });

    if (request.method === "HEAD") {
      headers.set("content-length", String(object.size));
      return new Response(null, { headers });
    }

    if (request.headers.has("range") && object.range && "offset" in object.range) {
      const { offset, length } = object.range;
      const end = offset + (length ?? object.size - offset) - 1;
      headers.set("content-range", `bytes ${offset}-${end}/${object.size}`);
      return new Response(object.body, { status: 206, headers });
    }
    return new Response(object.body, { headers });
  },
};

export default worker;
