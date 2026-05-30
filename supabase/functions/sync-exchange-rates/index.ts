// sync-exchange-rates: daily ingestion of foreign-exchange rates into public.exchange_rates.
//
// Invoked on a daily schedule via pg_cron + pg_net (see the schedule migration), and
// manually for backfills. Runs with the service role (bypasses RLS) to upsert rates.
//
// Rate model: rates are stored against a single PIVOT currency (USD) — one row per
// quote currency: (base_currency='USD', quote_currency=X, rate=X-per-1-USD, rate_date).
// Any cross-rate A->B is derived in the app as rate(USD->B) / rate(USD->A). Storing one
// pivot keeps the table O(currencies x days).
//
// Provider: openexchangerates if OPENEXCHANGERATES_APP_ID is set (paid/SLA upgrade path),
// otherwise the free open.er-api.com. Both are USD-base with broad coverage INCLUDING
// Gulf/pegged currencies (OMR, SAR, AED, ...) that ECB/Frankfurter omit. Rate gaps on
// weekends/holidays are handled at lookup time (most-recent rate <= date), not here.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const PROJECT_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const OXR_APP_ID = Deno.env.get("OPENEXCHANGERATES_APP_ID") ?? "";

const PIVOT = "USD";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ProviderResult {
  date: string; // YYYY-MM-DD
  provider: string;
  rates: Record<string, number>; // quote currency -> units per 1 USD
}

async function fetchUsdRates(): Promise<ProviderResult> {
  if (OXR_APP_ID) {
    const res = await fetch(
      `https://openexchangerates.org/api/latest.json?app_id=${OXR_APP_ID}&base=USD`,
    );
    if (!res.ok) throw new Error(`openexchangerates HTTP ${res.status}`);
    const j = await res.json();
    return {
      date: new Date((j.timestamp ?? Date.now() / 1000) * 1000).toISOString().slice(0, 10),
      provider: "openexchangerates",
      rates: j.rates ?? {},
    };
  }
  const res = await fetch("https://open.er-api.com/v6/latest/USD");
  if (!res.ok) throw new Error(`open.er-api HTTP ${res.status}`);
  const j = await res.json();
  if (j.result !== "success") throw new Error(`open.er-api result=${j.result}`);
  return {
    date: new Date((j.time_last_update_unix ?? Date.now() / 1000) * 1000).toISOString().slice(0, 10),
    provider: "er-api",
    rates: j.rates ?? {},
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  try {
    const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY);

    // The currencies we maintain rates for = all active reference currencies.
    const { data: currencies, error: ccyErr } = await supabase
      .from("master_currency_codes")
      .select("code")
      .eq("is_active", true);
    if (ccyErr) throw ccyErr;
    const wanted = new Set((currencies ?? []).map((c) => c.code as string));

    const { date, provider, rates } = await fetchUsdRates();
    if (!date || Object.keys(rates).length === 0) {
      throw new Error("provider returned no rates");
    }

    const fetchedAt = new Date().toISOString();
    const rows: Array<Record<string, unknown>> = [];
    const missing: string[] = [];
    for (const code of wanted) {
      if (code === PIVOT) continue; // identity rate is handled in app, not stored
      const r = rates[code];
      if (typeof r === "number" && r > 0) {
        rows.push({
          base_currency: PIVOT,
          quote_currency: code,
          rate: r,
          rate_date: date,
          source: "provider",
          provider,
          fetched_at: fetchedAt,
        });
      } else {
        missing.push(code); // provider has no rate for this currency today
      }
    }

    let upserted = 0;
    if (rows.length > 0) {
      const { error: upErr } = await supabase
        .from("exchange_rates")
        .upsert(rows, { onConflict: "base_currency,quote_currency,rate_date,source" });
      if (upErr) throw upErr;
      upserted = rows.length;
    }

    return new Response(
      JSON.stringify({ ok: true, date, provider, upserted, missing }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});
