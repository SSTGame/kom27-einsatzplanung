// KOM27 Einsatzplanung – Push-Mitteilungen verschicken (Supabase Edge Function "notify")
// Aufruf aus der Seite: supabase.functions.invoke('notify', { body: { target: 'techs'|'admins', tech_ids, title, body } })
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Schlüsselpaar für Push: wird beim ersten Aufruf erzeugt und nur in der Datenbank gespeichert
// (Tabelle push_config ist für Seitenbesucher gesperrt – nur dieser Dienst kann sie lesen).
async function vapidKeys(db: ReturnType<typeof createClient>) {
  const { data } = await db.from("push_config").select("public_key, private_key").eq("id", 1).maybeSingle();
  if (data) return data as { public_key: string; private_key: string };
  const k = webpush.generateVAPIDKeys();
  await db.from("push_config").upsert({ id: 1, public_key: k.publicKey, private_key: k.privateKey }, { onConflict: "id", ignoreDuplicates: true });
  const { data: again } = await db.from("push_config").select("public_key, private_key").eq("id", 1).single();
  return again as { public_key: string; private_key: string };
}

// Erinnerung am Vortag: wird jeden Abend vom Zeitplan in der Datenbank aufgerufen
const pad2 = (n: number) => String(n).padStart(2, "0");
function berlinDate(offsetDays: number) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  const d = new Date(Date.UTC(+p.year, +p.month - 1, +p.day + offsetDays));
  return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
}
async function runReminders(db: ReturnType<typeof createClient>, force = false) {
  const day = berlinDate(1);
  const { data: cfg } = await db.from("cron_config").select("remind_last").eq("id", 1).maybeSingle();
  if (!force && cfg?.remind_last === day) return { skipped: day };
  const { data: p } = await db.from("plan").select("data").eq("id", 1).maybeSingle();
  const d = (p?.data?.days ?? []).find((x: { date: string }) => x.date === day);
  let sent = 0, techs = 0;
  if (d && !d.cancelled && d.slots?.length) {
    const keys = d.slots.map((s: { key: string }) => s.key);
    const { data: asg } = await db.from("assignments").select("slot_key, tech_id").in("slot_key", keys).eq("status", "zugesagt");
    const byTech: Record<string, string[]> = {};
    (asg ?? []).forEach((a) => (byTech[a.tech_id] = byTech[a.tech_id] || []).push(a.slot_key));
    const ids = Object.keys(byTech);
    if (ids.length) {
      const { data: tl } = await db.from("technicians").select("id, name, email").in("id", ids);
      const keysV = await vapidKeys(db);
      webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "mailto:kom27@example.com", keysV.public_key, keysV.private_key);
      const wd = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][new Date(day + "T12:00:00Z").getUTCDay()];
      for (const t of tl ?? []) {
        if (!t.email) continue;
        const sl = d.slots.filter((s: { key: string }) => byTech[t.id].includes(s.key));
        const rooms = [...new Set(String(d.info || "").match(/(Saal \d|Seminar \d|Foyer)/g) || [])].join(", ");
        const body = sl.map((s: { zeit?: string; va?: string }) => `${(s.zeit || "Zeit folgt").replace("-", "–")} Uhr${s.va ? " · " + s.va : ""}`).join(" / ") + (rooms ? " · " + rooms : "") + " – Details in der App";
        const { data: subs } = await db.from("push_subscriptions").select("*").ilike("email", t.email);
        if (subs?.length) techs++;
        for (const s of subs ?? []) {
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title: `Morgen (${wd} ${day.slice(8, 10)}.${day.slice(5, 7)}.) KOM27 📍`, body, tag: "remind-" + day, url: "./" }), { TTL: 43200, urgency: "normal" });
            sent++;
          } catch (e) {
            const code = (e as { statusCode?: number }).statusCode;
            if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
          }
        }
      }
    }
  }
  await db.from("cron_config").update({ remind_last: day }).eq("id", 1);
  return { day, techs, sent };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const cronHdr = req.headers.get("x-kom27-cron");
    if (cronHdr) { // Aufruf vom Zeitplan: nur mit dem Geheimwort aus der Datenbank
      const db0 = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: c } = await db0.from("cron_config").select("secret").eq("id", 1).maybeSingle();
      if (!c?.secret || c.secret !== cronHdr) return json({ error: "nicht erlaubt" }, 403);
      return json(await runReminders(db0));
    }
    const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: u } = await asUser.auth.getUser();
    if (!u?.user) return json({ error: "nicht angemeldet" }, 401);
    const { data: isAdmin } = await asUser.rpc("is_admin");

    const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const keys = await vapidKeys(db);
    const input = await req.json();
    if (input.action === "key") return json({ publicKey: keys.public_key });
    if (input.action === "remind") { if (!isAdmin) return json({ error: "nur Master" }, 403); return json(await runReminders(db, true)); }

    const me = (u.user.email ?? "").toLowerCase();
    // KOM27-Zugänge (Medientechnik vor Ort): Empfängerliste für eigene Nachrichten
    const { data: isViewer } = await asUser.rpc("is_viewer");
    if (input.action === "kom_list") {
      if (!isViewer && !isAdmin) return json({ error: "nicht erlaubt" }, 403);
      const { data: tl } = await db.from("technicians").select("id, name, email, active").neq("active", false);
      const list = (tl ?? []).filter((t) => t.email);
      const { data: subs } = await db.from("push_subscriptions").select("email");
      const pushSet = new Set((subs ?? []).map((x) => String(x.email).toLowerCase()));
      const { data: p } = await db.from("plan").select("data").eq("id", 1).maybeSingle();
      const cancelled = new Set((p?.data?.days ?? []).filter((d: { cancelled?: boolean }) => d.cancelled).map((d: { date: string }) => d.date));
      const on = async (day: string) => {
        if (cancelled.has(day)) return new Set<string>();
        const { data } = await db.from("assignments").select("tech_id").like("slot_key", day + "#%").in("status", ["zugesagt", "angefragt"]);
        return new Set((data ?? []).map((a) => a.tech_id));
      };
      const h = await on(berlinDate(0)), m = await on(berlinDate(1));
      return json({ techs: list.map((t) => ({ id: t.id, name: t.name, push: pushSet.has(t.email.toLowerCase()), heute: h.has(t.id), morgen: m.has(t.id) })).sort((a, b) => a.name.localeCompare(b.name, "de")) });
    }

    const { target, tech_ids = [], tag } = input;
    let { title, body } = input;
    title = String(title ?? "").slice(0, 80); body = String(body ?? "").slice(0, 400);

    let emails: string[] = [];
    // eigene Nachrichten (nicht automatische Hinweise) werden zusätzlich gespeichert, damit man sie in der App nachlesen kann
    let store: { sender_name: string; sender_role: string; title: string; tech_ids: string[] } | null = null;
    const cleanName = (x: unknown) => String(x ?? "").replace(/[<>]/g, "").trim().slice(0, 40);
    if (target === "admins") {
      const { data } = await db.from("admins").select("email");
      emails = (data ?? []).map((r) => r.email);
    } else if (target === "manager") { // Techniker -> sein Projektleiter
      const { data } = await db.from("technicians").select("manager_email").ilike("email", me);
      emails = (data ?? []).map((r) => r.manager_email).filter(Boolean);
    } else if (target === "techs") {
      // Master darf alle, Projektleiter nur sein eigenes Team benachrichtigen
      const { data } = await db.from("technicians").select("id, email, manager_email").in("id", tech_ids);
      const rows = (data ?? []).filter((r) => isAdmin || (r.manager_email ?? "").toLowerCase() === me);
      if (!rows.length) return json({ error: "keine Berechtigung" }, 403);
      // bei Technikern mit eigenem Chef geht die Mitteilung auch an den Projektleiter
      emails = rows.flatMap((r) => [r.email, isAdmin ? r.manager_email : null]).filter(Boolean);
      if (input.store === true) store = { sender_name: cleanName(input.sender_name) || me.split("@")[0], sender_role: isAdmin ? "master" : "manager", title: typeof input.raw_title === "string" ? input.raw_title.slice(0, 80) : title, tech_ids: rows.map((r) => r.id) };
    } else if (target === "kom") {
      // KOM27-Zugang -> ausgewählte Techniker, der Master bekommt immer eine Kopie
      if (!isViewer) return json({ error: "nur KOM27-Zugang" }, 403);
      const { data } = await db.from("technicians").select("id, email").in("id", Array.isArray(tech_ids) ? tech_ids.slice(0, 200) : []).neq("active", false);
      const { data: ad } = await db.from("admins").select("email");
      emails = [...(data ?? []).map((r) => r.email), ...(ad ?? []).map((r) => r.email)].filter(Boolean);
      const { data: v } = await db.from("kom_viewers").select("name").eq("email", me).maybeSingle();
      const who = v?.name || me.split("@")[0];
      store = { sender_name: who, sender_role: "kom", title, tech_ids: (data ?? []).map((r) => r.id) };
      title = `KOM27 · ${who}: ${title || "Nachricht"}`;
    } else return json({ error: "unbekanntes Ziel" }, 400);
    let saved = false;
    if (store && body.trim()) {
      const { error: insErr } = await db.from("messages").insert({ sender_email: me, sender_name: store.sender_name, sender_role: store.sender_role, title: String(store.title || "").slice(0, 80), body: body.trim(), tech_ids: store.tech_ids });
      saved = !insErr;
    }
    emails = [...new Set(emails.map((e) => e.toLowerCase()))].filter((e) => e !== me);
    if (!emails.length) return json({ sent: 0, saved });

    const { data: subs } = await db.from("push_subscriptions").select("*").in("email", emails);
    webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "mailto:kom27@example.com", keys.public_key, keys.private_key);
    const payload = JSON.stringify({ title, body, tag, url: "./" });
    let sent = 0;
    await Promise.all((subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: "high" });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      }
    }));
    return json({ sent, devices: subs?.length ?? 0, saved });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
