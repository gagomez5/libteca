// Gestiona la suscripción Premium de un usuario autenticado: cancelar (con reembolso
// automático si aplica la garantía de 14 días, o diferido hasta fin de período si no),
// reactivar una cancelación pendiente, y crear un checkout de upgrade (mensual→anual,
// mensual→lifetime a precio completo, anual→lifetime pagando solo la diferencia
// prorateada del período actual). Reemplaza el viejo link a "Gestionar suscripción" que
// redirigía al portal hospedado de Lemon Squeezy (obligaba a un login separado).
//
// Deploy via el Supabase Dashboard (Functions -> New function -> pegar este archivo).
// Requiere Authorization: Bearer <supabase JWT> del usuario (Verify JWT debe quedar ON,
// a diferencia de ls-webhook). Usa el secret LEMONSQUEEZY_API_KEY ya existente a nivel
// de proyecto (compartido con create-checkout, no hace falta configurarlo de nuevo).
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY se inyectan solas.
//
// IMPORTANTE: `subscriptions` es escrita normalmente solo por ls-webhook (ver su
// comentario de cabecera). Esta función es la única excepción deliberada: escribe
// directo tras cancelar/reembolsar/reactivar/dar de baja, para que el usuario tenga
// confirmación inmediata en vez de esperar a que llegue el webhook — usa el mismo
// upsert/update que ls-webhook, así que si el webhook llega después y reaplica el mismo
// estado es un no-op idempotente e inofensivo. La acción "upgrade" es la única que NO
// escribe nada: crea un checkout hospedado y deja que ls-webhook procese el pago exactamente
// igual que una compra nueva (incluyendo cancelar la suscripción vieja, ver su código).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Deben coincidir con create-checkout/index.ts y ls-webhook/index.ts (sin módulo
// compartido entre Edge Functions en este repo).
const STORE_ID = "465111";
const PLAN_VARIANTS: Record<string, string> = {
  monthly: "2088736",
  annual: "2088737",
  lifetime: "2088738",
};
const PLAN_PRICE_CENTS: Record<string, number> = {
  monthly: 199,
  annual: 1999,
  lifetime: 4999,
};
const REDIRECT_URL = "https://bruukion.com/?upgraded=1";

const REFUND_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const ANNUAL_PERIOD_DAYS = 365;
const MIN_CHARGE_CENTS = 50; // piso defensivo para custom_price; verificar el mínimo real de Lemon Squeezy

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function lsHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/vnd.api+json",
    "Content-Type": "application/vnd.api+json",
  };
}
async function lsGet(path: string, apiKey: string) {
  const res = await fetch(`https://api.lemonsqueezy.com/v1${path}`, { headers: lsHeaders(apiKey) });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, body };
}
async function lsPost(path: string, apiKey: string, payload: unknown) {
  const res = await fetch(`https://api.lemonsqueezy.com/v1${path}`, {
    method: "POST",
    headers: lsHeaders(apiKey),
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, body };
}
async function lsPatch(path: string, apiKey: string, payload: unknown) {
  const res = await fetch(`https://api.lemonsqueezy.com/v1${path}`, {
    method: "PATCH",
    headers: lsHeaders(apiKey),
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, body };
}

function withinWindow(iso: string | null | undefined): boolean {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() <= REFUND_WINDOW_MS;
}

async function getLifetimeCharge(orderId: string, apiKey: string) {
  const { ok, body } = await lsGet(`/orders/${orderId}`, apiKey);
  if (!ok || !body?.data) return null;
  return { createdAt: body.data.attributes.created_at as string, totalCents: body.data.attributes.total as number };
}

// La lista no está garantizada ordenada por la API, así que se ordena acá antes de
// tomar la más reciente (la política de reembolso aplica a "cualquier cargo, incluida
// una renovación" — no solo al cargo inicial de la suscripción).
async function getLatestInvoice(subId: string, apiKey: string) {
  const { ok, body } = await lsGet(`/subscription-invoices?filter[subscription_id]=${subId}`, apiKey);
  if (!ok || !Array.isArray(body?.data) || body.data.length === 0) return null;
  const sorted = body.data.slice().sort((a: any, b: any) =>
    new Date(b.attributes.created_at).getTime() - new Date(a.attributes.created_at).getTime());
  const latest = sorted[0];
  return {
    id: latest.id as string,
    createdAt: latest.attributes.created_at as string,
    totalCents: latest.attributes.total as number,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_body" }, 400);
  }
  const action = body?.action;
  const validActions = ["preview_cancel", "cancel", "reactivate", "preview_upgrade", "upgrade", "downgrade_lifetime"];
  if (typeof action !== "string" || validActions.indexOf(action) === -1) {
    return json({ error: "invalid_action" }, 400);
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

  const apiKey = Deno.env.get("LEMONSQUEEZY_API_KEY")!;

  const { data: sub } = await admin.from("subscriptions").select("*").eq("user_id", userId).maybeSingle();
  if (!sub) return json({ ok: false, error: "no_subscription" }, 200);

  async function writeRefunded() {
    await admin.from("subscriptions").update({ status: "refunded", updated_at: new Date().toISOString() }).eq("user_id", userId);
    await admin.from("profile").upsert({ user_id: userId, role: "free" });
  }
  async function writeCancelled() {
    await admin.from("subscriptions").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("user_id", userId);
    // profile.role NO se toca acá: el usuario conserva Premium hasta que expire de verdad.
  }
  async function writeActive() {
    await admin.from("subscriptions").update({ status: "active", updated_at: new Date().toISOString() }).eq("user_id", userId);
  }
  async function writeDowngraded() {
    await admin.from("subscriptions").update({ status: "downgraded", updated_at: new Date().toISOString() }).eq("user_id", userId);
    await admin.from("profile").upsert({ user_id: userId, role: "free" });
  }

  // ---------------- preview_cancel ----------------
  if (action === "preview_cancel") {
    if (sub.plan === "lifetime") {
      const charge = sub.ls_order_id ? await getLifetimeCharge(sub.ls_order_id, apiKey) : null;
      if (!charge) return json({ ok: false, error: "lemonsqueezy_error" }, 502);
      const eligible = withinWindow(charge.createdAt);
      return json({
        ok: true, plan: "lifetime", refund_eligible: eligible, charge_date: charge.createdAt,
        refund_amount_cents: eligible ? charge.totalCents : undefined,
      }, 200);
    }
    const invoice = sub.ls_subscription_id ? await getLatestInvoice(sub.ls_subscription_id, apiKey) : null;
    if (!invoice) return json({ ok: false, error: "lemonsqueezy_error" }, 502);
    const eligible = withinWindow(invoice.createdAt);
    return json({
      ok: true, plan: sub.plan, refund_eligible: eligible, charge_date: invoice.createdAt,
      refund_amount_cents: eligible ? invoice.totalCents : undefined,
      period_end: eligible ? undefined : sub.current_period_end,
    }, 200);
  }

  // ---------------- cancel ----------------
  if (action === "cancel") {
    if (sub.plan === "lifetime") {
      const charge = sub.ls_order_id ? await getLifetimeCharge(sub.ls_order_id, apiKey) : null;
      if (!charge) return json({ ok: false, error: "lemonsqueezy_error" }, 502);
      if (!withinWindow(charge.createdAt)) return json({ ok: false, error: "not_eligible", use: "downgrade_lifetime" }, 200);
      const refundRes = await lsPost(`/orders/${sub.ls_order_id}/refund`, apiKey, {});
      if (!refundRes.ok) return json({ ok: false, error: "lemonsqueezy_error" }, 502);
      await writeRefunded();
      return json({ ok: true, outcome: "refunded", refund_amount_cents: charge.totalCents, new_role: "free" }, 200);
    }

    if (!sub.ls_subscription_id) return json({ ok: false, error: "no_subscription" }, 200);
    const invoice = await getLatestInvoice(sub.ls_subscription_id, apiKey);
    if (!invoice) return json({ ok: false, error: "lemonsqueezy_error" }, 502);

    if (withinWindow(invoice.createdAt)) {
      const refundRes = await lsPost(`/subscription-invoices/${invoice.id}/refund`, apiKey, {});
      if (!refundRes.ok) return json({ ok: false, error: "lemonsqueezy_error" }, 502);
      const cancelRes = await lsPatch(`/subscriptions/${sub.ls_subscription_id}`, apiKey, {
        data: { type: "subscriptions", id: sub.ls_subscription_id, attributes: { cancelled: true } },
      });
      // El dinero ya se reembolsó (lo importante); si el cancel falla, solo lo logueamos
      // para no dejar una suscripción reembolsada renovándose de nuevo sin que se note.
      if (!cancelRes.ok) console.error("cancel-after-refund PATCH failed", sub.ls_subscription_id);
      await writeRefunded();
      return json({ ok: true, outcome: "refunded", refund_amount_cents: invoice.totalCents, new_role: "free" }, 200);
    }

    const cancelRes = await lsPatch(`/subscriptions/${sub.ls_subscription_id}`, apiKey, {
      data: { type: "subscriptions", id: sub.ls_subscription_id, attributes: { cancelled: true } },
    });
    if (!cancelRes.ok) return json({ ok: false, error: "lemonsqueezy_error" }, 502);
    await writeCancelled();
    return json({ ok: true, outcome: "deferred", period_end: sub.current_period_end, new_role: "premium" }, 200);
  }

  // ---------------- reactivate ----------------
  if (action === "reactivate") {
    if (sub.plan === "lifetime" || !sub.ls_subscription_id) return json({ ok: false, error: "not_eligible" }, 200);
    const { ok, body: lsBody } = await lsGet(`/subscriptions/${sub.ls_subscription_id}`, apiKey);
    if (!ok) return json({ ok: false, error: "lemonsqueezy_error" }, 502);
    const attrs = lsBody?.data?.attributes;
    const endsAt = attrs?.ends_at;
    const stillCancellable = attrs?.status === "cancelled" && (!endsAt || new Date(endsAt).getTime() > Date.now());
    if (!stillCancellable) return json({ ok: false, error: "not_eligible" }, 200);
    const resumeRes = await lsPatch(`/subscriptions/${sub.ls_subscription_id}`, apiKey, {
      data: { type: "subscriptions", id: sub.ls_subscription_id, attributes: { cancelled: false } },
    });
    if (!resumeRes.ok) return json({ ok: false, error: "lemonsqueezy_error" }, 502);
    await writeActive();
    return json({ ok: true, status: "active" }, 200);
  }

  // ---------------- preview_upgrade / upgrade ----------------
  if (action === "preview_upgrade" || action === "upgrade") {
    const targetPlan = body?.target_plan;
    if (targetPlan !== "annual" && targetPlan !== "lifetime") return json({ error: "invalid_body" }, 400);
    const allowed =
      (sub.plan === "monthly" && (targetPlan === "annual" || targetPlan === "lifetime")) ||
      (sub.plan === "annual" && targetPlan === "lifetime");
    if (!allowed) return json({ ok: false, error: "invalid_upgrade_path" }, 200);

    let amountCents = PLAN_PRICE_CENTS[targetPlan];
    let prorationApplied = false;
    let remainingDays = 0, unusedValueCents = 0, periodEndIso: string | null = null;

    if (sub.plan === "annual" && targetPlan === "lifetime") {
      periodEndIso = sub.current_period_end;
      if (!periodEndIso) return json({ ok: false, error: "lemonsqueezy_error" }, 502);
      // Prorateo basado SIEMPRE en el current_period_end más reciente (el que Lemon
      // Squeezy actualiza en cada renovación) — nunca en la fecha de alta original, para
      // no acumular valor de años anteriores ya consumidos.
      const periodEndMs = new Date(periodEndIso).getTime();
      remainingDays = Math.max(0, (periodEndMs - Date.now()) / 86400000);
      unusedValueCents = Math.round(PLAN_PRICE_CENTS.annual * (remainingDays / ANNUAL_PERIOD_DAYS));
      amountCents = Math.max(MIN_CHARGE_CENTS, PLAN_PRICE_CENTS.lifetime - unusedValueCents);
      prorationApplied = true;
    }

    if (action === "preview_upgrade") {
      return json({
        ok: true, target_plan: targetPlan, amount_cents: amountCents, proration_applied: prorationApplied,
        remaining_days: prorationApplied ? Math.round(remainingDays) : undefined,
        unused_value_cents: prorationApplied ? unusedValueCents : undefined,
        period_end: prorationApplied ? periodEndIso : undefined,
      }, 200);
    }

    const checkoutAttrs: any = {
      checkout_data: {
        custom: { supabase_user_id: userId, upgrade_from_subscription_id: sub.ls_subscription_id || "" },
      },
      product_options: { redirect_url: REDIRECT_URL },
    };
    if (prorationApplied) checkoutAttrs.checkout_data.custom_price = amountCents;

    const { ok, body: lsBody } = await lsPost("/checkouts", apiKey, {
      data: {
        type: "checkouts",
        attributes: checkoutAttrs,
        relationships: {
          store: { data: { type: "stores", id: STORE_ID } },
          variant: { data: { type: "variants", id: PLAN_VARIANTS[targetPlan] } },
        },
      },
    });
    const url = lsBody?.data?.attributes?.url;
    if (!ok || !url) return json({ error: "lemonsqueezy_error" }, 502);
    return json({ ok: true, checkout_url: url }, 200);
  }

  // ---------------- downgrade_lifetime ----------------
  if (action === "downgrade_lifetime") {
    if (sub.plan !== "lifetime") return json({ ok: false, error: "not_eligible" }, 200);
    if (body?.acknowledge !== true) return json({ error: "invalid_body" }, 400);
    const charge = sub.ls_order_id ? await getLifetimeCharge(sub.ls_order_id, apiKey) : null;
    if (charge && withinWindow(charge.createdAt)) return json({ ok: false, error: "not_eligible", use: "cancel" }, 200);
    await writeDowngraded();
    return json({ ok: true, new_role: "free" }, 200);
  }

  return json({ error: "invalid_action" }, 400);
});
