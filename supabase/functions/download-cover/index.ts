// Downloads a user-supplied cover image URL server-side (no browser CORS involved)
// and stores a permanent copy in the Supabase Storage "covers" bucket.
//
// Deploy via the Supabase Dashboard (Functions -> New function -> paste this file)
// or `supabase functions deploy download-cover`. Requires no manual secrets:
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};
const MAX_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h === "::1") return true;
  const parts = h.split(".");
  if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) {
    const nums = parts.map(Number);
    const a = nums[0], b = nums[1];
    if (a === 127 || a === 0 || a === 10) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let url: unknown;
  try {
    const body = await req.json();
    url = body?.url;
  } catch {
    return json({ error: "invalid_body" }, 400);
  }
  if (typeof url !== "string" || !url) return json({ error: "missing_url" }, 400);

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return json({ error: "invalid_url" }, 400);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return json({ error: "invalid_protocol" }, 400);
  }
  if (isBlockedHost(parsed.hostname)) return json({ error: "blocked_host" }, 400);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(parsed.toString(), { redirect: "follow", signal: controller.signal });
  } catch {
    clearTimeout(timer);
    return json({ error: "fetch_failed" }, 502);
  }
  clearTimeout(timer);
  if (!res.ok) return json({ error: "fetch_failed" }, 502);

  const contentType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED_TYPES.includes(contentType)) return json({ error: "not_an_image" }, 415);

  const lenHeader = res.headers.get("content-length");
  if (lenHeader && Number(lenHeader) > MAX_BYTES) return json({ error: "too_large" }, 413);

  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength === 0) return json({ error: "empty_response" }, 415);
  if (buf.byteLength > MAX_BYTES) return json({ error: "too_large" }, 413);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  let userId = "guest";
  const authHeader = req.headers.get("authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (jwt) {
    const { data } = await admin.auth.getUser(jwt);
    if (data && data.user) userId = data.user.id;
  }

  const ext = EXT_BY_TYPE[contentType] || "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await admin.storage.from("covers").upload(path, buf, {
    contentType,
    upsert: false,
  });
  if (uploadError) return json({ error: "upload_failed" }, 500);

  const { data: pub } = admin.storage.from("covers").getPublicUrl(path);
  return json({ url: pub.publicUrl }, 200);
});
