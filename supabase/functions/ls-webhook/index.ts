// Recibe los webhooks de Lemon Squeezy (compra/renovación/cancelación de Premium) y
// sincroniza `profile.role` + la tabla `subscriptions`.
//
// Deploy via el Supabase Dashboard (Functions -> New function -> pegar este archivo)
// o `supabase functions deploy ls-webhook`. Requiere estos secrets (Dashboard ->
// Edge Functions -> Secrets, NUNCA en el repo): LEMONSQUEEZY_WEBHOOK_SECRET (el
// signing secret que se genera al crear el Webhook en Lemon Squeezy, Fase 0).
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY se inyectan solas.
//
// Configurar en Lemon Squeezy (Settings -> Webhooks) para que apunte a esta URL,
// suscripto a los eventos: order_created, subscription_created, subscription_updated,
// subscription_cancelled, subscription_expired, order_refunded, subscription_payment_refunded.
//
// IMPORTANTE: en el Dashboard de Supabase, esta función necesita el toggle
// "Verify JWT" en OFF (Edge Functions -> ls-webhook -> Settings). Lemon Squeezy
// nunca manda un JWT de Supabase, manda su propia firma en X-Signature (que sí
// se verifica acá abajo) — con "Verify JWT" en ON, Supabase rechaza el request
// ANTES de que este código llegue a correr, y el webhook nunca actualiza nada.
// Ese toggle a veces se reactiva solo al re-desplegar la función: revisarlo de
// nuevo después de cualquier edición futura.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Debe coincidir con PLAN_VARIANTS de create-checkout/index.ts (mismos variant_id).
const VARIANT_TO_PLAN: Record<string, "monthly" | "annual" | "lifetime"> = {
  "2088736": "monthly",
  "2088737": "annual",
  "2088738": "lifetime",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const rawBody = await req.text();
  const signature = req.headers.get("x-signature") || "";
  const secret = Deno.env.get("LEMONSQUEEZY_WEBHOOK_SECRET")!;
  const expectedSignature = await hmacHex(secret, rawBody);
  if (!signature || !timingSafeEqual(signature, expectedSignature)) {
    return json({ error: "invalid_signature" }, 401);
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  const eventName = req.headers.get("x-event-name") || payload?.meta?.event_name;
  const userId: string | undefined = payload?.meta?.custom_data?.supabase_user_id;
  if (!userId) return json({ ok: true, skipped: "no_user_id" }, 200);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const attrs = payload?.data?.attributes || {};

  async function grantPremium(fields: Record<string, unknown>) {
    await admin.from("subscriptions").upsert(
      { user_id: userId, updated_at: new Date().toISOString(), ...fields },
      { onConflict: "user_id" },
    );
    await admin.from("profile").upsert({ user_id: userId, role: "premium" });
  }

  // Cancelación programada: NO se revoca el acceso todavía, el usuario conserva Premium
  // hasta que la suscripción expire de verdad (política publicada en /refund §4).
  async function markCancelled() {
    await admin.from("subscriptions").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("user_id", userId);
  }

  async function revokeIfPremium(status: "expired" | "refunded") {
    await admin.from("subscriptions").update({ status, updated_at: new Date().toISOString() }).eq("user_id", userId);
    const { data: prof } = await admin.from("profile").select("role").eq("user_id", userId).maybeSingle();
    // Nunca tocar fundador/administrador: solo se revierte si sigue siendo 'premium'.
    if (prof && prof.role === "premium") {
      await admin.from("profile").upsert({ user_id: userId, role: "free" });
    }
  }

  // Tras un upgrade creado por manage-subscription (ver ese archivo), custom_data trae
  // el id de la suscripción vieja a cancelar una vez que el pago del nuevo plan aterriza.
  async function cancelOldSubscriptionIfUpgrade(apiKey: string) {
    const oldSubId = payload?.meta?.custom_data?.upgrade_from_subscription_id;
    if (!oldSubId) return;
    await fetch(`https://api.lemonsqueezy.com/v1/subscriptions/${oldSubId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/vnd.api+json", "Content-Type": "application/vnd.api+json" },
      body: JSON.stringify({ data: { type: "subscriptions", id: oldSubId, attributes: { cancelled: true } } }),
    }).catch((e) => console.error("cancelOldSubscriptionIfUpgrade failed", oldSubId, e));
  }

  const apiKey = Deno.env.get("LEMONSQUEEZY_API_KEY")!;

  if (eventName === "order_created") {
    const variantId = attrs?.first_order_item?.variant_id?.toString();
    const isLifetime = variantId && VARIANT_TO_PLAN[variantId] === "lifetime";
    if (isLifetime && attrs?.status === "paid") {
      await grantPremium({
        plan: "lifetime",
        status: "active",
        ls_order_id: payload?.data?.id,
        current_period_end: null,
        test_mode: !!payload?.meta?.test_mode,
      });
      await cancelOldSubscriptionIfUpgrade(apiKey);
    }
  } else if (eventName === "subscription_created" || eventName === "subscription_updated") {
    const variantId = attrs?.variant_id?.toString();
    const plan = variantId ? VARIANT_TO_PLAN[variantId] : undefined;
    if (plan && plan !== "lifetime" && (attrs?.status === "active" || attrs?.status === "on_trial")) {
      await grantPremium({
        plan,
        status: "active",
        ls_subscription_id: payload?.data?.id,
        ls_customer_id: attrs?.customer_id ? String(attrs.customer_id) : null,
        ls_customer_portal_url: attrs?.urls?.customer_portal || null,
        current_period_end: attrs?.renews_at || null,
        test_mode: !!payload?.meta?.test_mode,
      });
      await cancelOldSubscriptionIfUpgrade(apiKey);
    } else if (attrs?.status === "cancelled") {
      await markCancelled();
    } else if (attrs?.status === "expired") {
      await revokeIfPremium("expired");
    }
  } else if (eventName === "subscription_cancelled") {
    await markCancelled();
  } else if (eventName === "subscription_expired") {
    await revokeIfPremium("expired");
  } else if (eventName === "order_refunded") {
    if (attrs?.refunded === true) await revokeIfPremium("refunded");
  } else if (eventName === "subscription_payment_refunded") {
    // No revocar en un reembolso parcial de cortesía — solo cuando la factura quedó
    // totalmente reembolsada.
    if (attrs?.refunded === true) await revokeIfPremium("refunded");
  }

  return json({ ok: true }, 200);
});
