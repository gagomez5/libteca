// Crea un checkout de Lemon Squeezy (hosted, con redirect) para que un usuario
// autenticado haga upgrade a Premium, y devuelve la URL para redirigir al navegador.
//
// Deploy via el Supabase Dashboard (Functions -> New function -> pegar este archivo)
// o `supabase functions deploy create-checkout`. Requiere este secret (Dashboard ->
// Edge Functions -> Secrets, NUNCA en el repo): LEMONSQUEEZY_API_KEY.
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY se inyectan solas.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// IDs de Lemon Squeezy (producto "Bruukion Premium", store de Guillermo).
// No son secretos, se dejan hardcodeados igual que SUPABASE_URL en js/db.js.
const STORE_ID = "465111";
const PLAN_VARIANTS: Record<string, string> = {
  monthly: "2088736",
  annual: "2088737",
  lifetime: "2088738",
};

const REDIRECT_URL = "https://bruukion.com/?upgraded=1";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let plan: unknown;
  try {
    const body = await req.json();
    plan = body?.plan;
  } catch {
    return json({ error: "invalid_body" }, 400);
  }
  if (typeof plan !== "string" || !PLAN_VARIANTS[plan]) {
    return json({ error: "invalid_plan" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const authHeader = req.headers.get("authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "unauthorized" }, 401);
  const { data: userData } = await admin.auth.getUser(jwt);
  if (!userData || !userData.user) return json({ error: "unauthorized" }, 401);
  const userId = userData.user.id;
  const email = userData.user.email || undefined;

  const apiKey = Deno.env.get("LEMONSQUEEZY_API_KEY")!;

  const lsRes = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
    },
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          checkout_data: {
            email: email,
            custom: { supabase_user_id: userId },
          },
          product_options: {
            redirect_url: REDIRECT_URL,
          },
        },
        relationships: {
          store: { data: { type: "stores", id: STORE_ID } },
          variant: { data: { type: "variants", id: PLAN_VARIANTS[plan] } },
        },
      },
    }),
  });

  if (!lsRes.ok) {
    return json({ error: "lemonsqueezy_error" }, 502);
  }
  const lsBody = await lsRes.json();
  const url = lsBody?.data?.attributes?.url;
  if (!url) return json({ error: "lemonsqueezy_error" }, 502);

  return json({ url }, 200);
});
