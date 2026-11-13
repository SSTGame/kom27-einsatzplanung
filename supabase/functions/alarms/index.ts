// KOM27 Einsatzplanung – Erinnerungen am Einsatztag (Supabase Edge Function "alarms")
// Wird jede Minute vom Zeitplan in der Datenbank aufgerufen (Kopfzeile x-kom27-cron).
// Gong-Zeiten trägt das Team in der App ein, Recording/Stream erkennt dieser Dienst selbst aus der Excel.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
const pad2 = (n: number) => String(n).padStart(2, "0");

function berlinDate() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${pad2(+p.month)}-${pad2(+p.day)}`;
}
function berlinNowMin() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return +p.hour * 60 + +p.minute;
}
const toMin = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
const hhmm = (x?: string) => { const m = String(x ?? "").match(/(\d{1,2})[.:](\d{2})/); return m ? pad2(+m[1]) + ":" + m[2] : ""; };

type Row = { scope: string; at_time: string; label: string; lead_min: number; author: string; auto: boolean };
// Recording/Stream aus den Excel-Texten des Tages herauslesen
function recordingRows(day: string, d: Record<string, unknown> | undefined) {
  const out: Row[] = [];
  if (!d) return out;
  const scan = (va: string, parts: string[], fallback?: string) => {
    parts.filter(Boolean).forEach((part) => {
      if (!/record|aufzeichn|mitschnitt|stream/i.test(part)) return;
      const t = hhmm((part.match(/(\d{1,2}[.:]\d{2})/) ?? [])[1]) || hhmm(fallback);
      if (!t) return;
      const label = /stream/i.test(part) ? "Stream" : "Recording";
      if (!out.some((o) => o.scope === day + "#" + va && o.at_time === t && o.label === label)) out.push({ scope: day + "#" + va, at_time: t, label, lead_min: 5, author: "Excel", auto: true });
    });
  };
  const texts = (det: Record<string, unknown> | undefined) => {
    const r = ((det?.rooms as [string, string][]) ?? []).map((x) => String(x?.[1] ?? ""));
    return [...r, String(det?.hinweis ?? ""), String(det?.ablauf ?? "")].flatMap((x) => x.split(/\s*·\s*|\n|;/));
  };
  ((d.slots as { va?: string; zeit?: string; det?: Record<string, unknown> }[]) ?? []).forEach((s) => {
    const det = s.det ?? {};
    scan(s.va ?? "", [...texts(det), ...String(d.info ?? "").split(/\s*·\s*/)], String(det.vazeit ?? d.vazeit ?? s.zeit ?? ""));
  });
  Object.entries((d.vaDet as Record<string, Record<string, unknown>>) ?? {}).forEach(([va, det]) => scan(va, texts(det), String(det?.vazeit ?? d.vazeit ?? "")));
  return out;
}

Deno.serve(async (req) => {
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: c } = await db.from("cron_config").select("secret").eq("id", 1).maybeSingle();
    const hdr = req.headers.get("x-kom27-cron");
    if (!c?.secret || c.secret !== hdr) return json({ error: "nicht erlaubt" }, 403);

    const day = berlinDate(), now = berlinNowMin();
    const { data: p } = await db.from("plan").select("data").eq("id", 1).maybeSingle();
    const d = ((p?.data as { days?: { date: string; cancelled?: boolean }[] })?.days ?? []).find((x) => x.date === day) as Record<string, unknown> | undefined;
    if (d && !d.cancelled) {
      const rows = recordingRows(day, d);
      if (rows.length) await db.from("alarms").upsert(rows, { onConflict: "scope,at_time,label", ignoreDuplicates: true });
    }
    const { data: al } = await db.from("alarms").select("*").like("scope", day + "#%").or("sent_at.is.null,sent_lead_at.is.null");
    // zwei Mitteilungen je Erinnerung: einmal vorher („in 5 Minuten") und einmal genau zur Uhrzeit („jetzt")
    const vor = (al ?? []).filter((a) => !a.sent_lead_at && a.lead_min > 0 && now >= toMin(a.at_time) - a.lead_min && now < toMin(a.at_time));
    const jetzt = (al ?? []).filter((a) => !a.sent_at && now >= toMin(a.at_time));
    const faellig = [...vor.map((a) => ({ a, art: "vor" as const })), ...jetzt.map((a) => ({ a, art: "jetzt" as const }))];
    if (!faellig.length) return json({ day, now, due: 0 });
    const frisch = faellig.filter((x) => now <= toMin(x.a.at_time) + 20);
    let sent = 0;
    if (frisch.length) {
      const { data: asg } = await db.from("assignments").select("tech_id").like("slot_key", day + "#%").eq("status", "zugesagt");
      const ids = [...new Set((asg ?? []).map((a) => a.tech_id))];
      const tl = ids.length ? (await db.from("technicians").select("email").in("id", ids)).data : [];
      const { data: kv } = await db.from("kom_viewers").select("email");
      const mails = [...new Set([...(tl ?? []), ...(kv ?? [])].map((x) => String(x.email ?? "").toLowerCase()).filter(Boolean))];
      const { data: k } = await db.from("push_config").select("public_key, private_key").eq("id", 1).maybeSingle();
      if (k) {
        webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "mailto:kom27@example.com", k.public_key, k.private_key);
        for (const { a, art } of frisch) {
          const mins = toMin(a.at_time) - now;
          const va = String(a.scope).slice(11);
          const title = art === "jetzt" ? `🔔 Jetzt: ${a.label}` : `⏰ ${a.label} um ${a.at_time}`;
          const body = (art === "jetzt" ? `${a.at_time} Uhr – jetzt abspielen` : `in ${mins} Minute${mins === 1 ? "" : "n"} (${a.at_time} Uhr)`) + (va ? " · " + va : "");
          for (const m of mails) {
            const { data: subs } = await db.from("push_subscriptions").select("*").ilike("email", m);
            for (const s of subs ?? []) {
              try {
                await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title, body, tag: "alarm-" + a.id + "-" + art, url: "./" }), { TTL: 900, urgency: "high" });
                sent++;
              } catch (e) {
                const code = (e as { statusCode?: number }).statusCode;
                if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
              }
            }
          }
        }
      }
    }
    const nowIso = new Date().toISOString();
    if (vor.length) await db.from("alarms").update({ sent_lead_at: nowIso }).in("id", vor.map((a) => a.id));
    if (jetzt.length) await db.from("alarms").update({ sent_at: nowIso, sent_lead_at: nowIso }).in("id", jetzt.map((a) => a.id));
    return json({ day, now, vor: vor.length, jetzt: jetzt.length, sent });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
