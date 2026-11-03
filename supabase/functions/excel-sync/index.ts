// KOM27 Einsatzplanung – VA-Kalender automatisch von SharePoint abholen (Supabase Edge Function "excel-sync")
// Läuft stündlich über den Zeitplan in der Datenbank (Kopfzeile x-kom27-cron) oder auf Knopfdruck durch den Master.
// Holt die Excel über den freigegebenen Link „Jeder mit dem Link kann anzeigen“, merkt sich die neueste Version
// und schickt dem Master eine Push-Mitteilung, wenn sich die Datei geändert hat. Übernommen wird sie im Master.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
type DB = ReturnType<typeof createClient>;

// Datei über den Freigabe-Link laden. SharePoint leitet dabei mehrfach weiter und setzt
// unterwegs ein Sitzungs-Cookie für den Gastzugriff – das wird hier mitgeführt.
async function download(shareUrl: string): Promise<Uint8Array> {
  const u0 = new URL(shareUrl);
  if (u0.protocol !== "https:" || !u0.hostname.endsWith(".sharepoint.com")) throw new Error("Nur SharePoint-Links sind erlaubt");
  u0.searchParams.set("download", "1");
  let url = u0.href;
  const jar = new Map<string, string>();
  for (let i = 0; i < 10; i++) {
    const r = await fetch(url, { redirect: "manual", headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), "user-agent": "KOM27-Einsatzplanung/1.0" } });
    for (const c of r.headers.getSetCookie?.() ?? []) { const kv = c.split(";")[0]; const p = kv.indexOf("="); if (p > 0) jar.set(kv.slice(0, p).trim(), kv.slice(p + 1)); }
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) { url = new URL(r.headers.get("location")!, url).href; await r.body?.cancel(); continue; }
    if (!r.ok) { await r.body?.cancel(); throw new Error(`SharePoint antwortet mit ${r.status}`); }
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error("Keine Excel-Datei erhalten – der Link ist evtl. abgelaufen oder verlangt eine Anmeldung");
    return buf;
  }
  throw new Error("Zu viele Weiterleitungen");
}
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
function b64(u: Uint8Array) { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); }

async function pushAdmins(db: DB, title: string, body: string) {
  const { data: k } = await db.from("push_config").select("public_key, private_key").eq("id", 1).maybeSingle();
  if (!k) return 0;
  const { data: ad } = await db.from("admins").select("email");
  const emails = (ad ?? []).map((r) => String(r.email).toLowerCase());
  if (!emails.length) return 0;
  const { data: subs } = await db.from("push_subscriptions").select("*").in("email", emails);
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "mailto:kom27@example.com", k.public_key, k.private_key);
  let sent = 0;
  for (const s of subs ?? []) {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title, body, tag: "excel-sync", url: "./" }), { TTL: 86400, urgency: "normal" }); sent++; }
    catch (e) { const c = (e as { statusCode?: number }).statusCode; if (c === 404 || c === 410) await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint); }
  }
  return sent;
}

async function sync(db: DB) {
  const now = new Date().toISOString();
  const { data: cfg } = await db.from("excel_sync").select("share_url, hash").eq("id", 1).maybeSingle();
  if (!cfg?.share_url) return { error: "Kein SharePoint-Link hinterlegt" };
  try {
    const buf = await download(cfg.share_url);
    const hash = hex(await crypto.subtle.digest("SHA-256", buf));
    if (hash === cfg.hash) { await db.from("excel_sync").update({ last_try: now, last_error: null }).eq("id", 1); return { changed: false, hash }; }
    await db.from("excel_file").upsert({ id: 1, hash, b64: b64(buf), fetched_at: now });
    await db.from("excel_sync").update({ hash, fetched_at: now, changed_at: now, last_try: now, last_error: null }).eq("id", 1);
    const first = !cfg.hash;
    if (!first) await pushAdmins(db, "📥 VA-Kalender geändert", "Auf SharePoint gibt es eine neue Version – in der App mit einem Klick übernehmen.");
    return { changed: true, hash, bytes: buf.length };
  } catch (e) {
    await db.from("excel_sync").update({ last_try: now, last_error: String((e as Error).message ?? e) }).eq("id", 1);
    return { error: String((e as Error).message ?? e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const cronHdr = req.headers.get("x-kom27-cron");
    if (cronHdr) { // Aufruf vom Zeitplan: nur mit dem Geheimwort aus der Datenbank
      const { data: c } = await db.from("cron_config").select("secret").eq("id", 1).maybeSingle();
      if (!c?.secret || c.secret !== cronHdr) return json({ error: "nicht erlaubt" }, 403);
      return json(await sync(db));
    }
    const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: u } = await asUser.auth.getUser();
    if (!u?.user) return json({ error: "nicht angemeldet" }, 401);
    const { data: isAdmin } = await asUser.rpc("is_admin");
    if (!isAdmin) return json({ error: "nur Master" }, 403);
    return json(await sync(db));
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
