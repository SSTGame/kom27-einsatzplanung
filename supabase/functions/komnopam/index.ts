// KOM27 Einsatzplanung – Mitteilung an die KOM27-Medientechnik (Supabase Edge Function "komnopam")
// Läuft abends über den Zeitplan in der Datenbank (Kopfzeile x-kom27-cron) und meldet,
// welche Veranstaltungen am nächsten Tag ohne PAM-Techniker laufen – inklusive „externes Haus“
// oder „interne Betreuung“, falls das im VA-Kalender steht.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
const pad2 = (n: number) => String(n).padStart(2, "0");
function berlinDate(offsetDays: number) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  const d = new Date(Date.UTC(+p.year, +p.month - 1, +p.day + offsetDays));
  return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
}

type Det = { vazeit?: string; zeit?: string; buch?: string; rooms?: [string, string][] };
type Tag = { date: string; cancelled?: boolean; vas?: string[]; slots?: { va?: string }[]; vaDet?: Record<string, Det>; vazeit?: string; info?: string; extern?: string; intern?: string };

function ohnePam(d: Tag | undefined) {
  if (!d || d.cancelled) return [];
  const norm = (v: string) => String(v ?? "").replace(/^(auf|ab)bau\s*/i, "").trim();
  const slots = d.slots ?? [];
  const alle = [...new Set([...(d.vas ?? []), ...Object.keys(d.vaDet ?? {})])].map(String).filter(Boolean);
  if (!alle.length) return [];
  if (slots.some((s) => !s.va)) return [];                    // Einsatz ohne VA-Nummer: der Tag ist abgedeckt
  const mitPam = new Set(slots.map((s) => norm(s.va ?? "")).filter(Boolean));
  return alle.filter((va) => !mitPam.has(norm(va)));
}

function textFor(day: string, d: Tag, ohne: string[]) {
  const det = d.vaDet ?? {};
  const nurEine = new Set(ohne.map((v) => v.replace(/^(auf|ab)bau\s*/i, "").trim())).size === 1 && (d.vas ?? []).length <= ohne.length;
  const zeile = (va: string) => {
    const x = det[va] ?? {};
    const t = x.vazeit || x.zeit || x.buch || (nurEine ? d.vazeit ?? "" : "");
    const r = [...new Set((x.rooms ?? []).map((y) => String(y[0] ?? "").trim()).filter(Boolean))].join(", ")
      || (nurEine ? [...new Set(String(d.info ?? "").match(/(Saal \d|Seminar \d|Foyer)/g) ?? [])].join(", ") : "");
    return va + (t ? " · " + t.replace(/(\d{1,2})\.(\d{2})/g, "$1:$2").replace(/\s*-\s*/, "–") : "") + (r ? " · " + r : "");
  };
  const wd = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][new Date(day + "T12:00:00Z").getUTCDay()];
  return {
    title: `Morgen ohne PAM-Techniker (${wd} ${day.slice(8, 10)}.${day.slice(5, 7)}.)`,
    body: ohne.slice(0, 3).map(zeile).join(" / ") + (ohne.length > 3 ? ` / +${ohne.length - 3} weitere` : "")
      + (d.extern ? " · " + d.extern : d.intern ? " · " + d.intern : ""),
  };
}

Deno.serve(async (req) => {
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: c } = await db.from("cron_config").select("secret").eq("id", 1).maybeSingle();
    if (!c?.secret || c.secret !== req.headers.get("x-kom27-cron")) return json({ error: "nicht erlaubt" }, 403);

    const day = berlinDate(1);
    const { data: p } = await db.from("plan").select("data").eq("id", 1).maybeSingle();
    const d = ((p?.data as { days?: Tag[] })?.days ?? []).find((x) => x.date === day);
    const ohne = ohnePam(d);
    if (!ohne.length) return json({ day, ohne: 0 });

    const { data: kv } = await db.from("kom_viewers").select("email");
    const mails = [...new Set((kv ?? []).map((x) => String(x.email ?? "").toLowerCase()).filter(Boolean))];
    if (!mails.length) return json({ day, ohne: ohne.length, kom: 0 });

    const { data: k } = await db.from("push_config").select("public_key, private_key").eq("id", 1).maybeSingle();
    if (!k) return json({ day, ohne: ohne.length, error: "keine Push-Schlüssel" });
    webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "mailto:kom27@example.com", k.public_key, k.private_key);
    const { title, body } = textFor(day, d as Tag, ohne);
    let sent = 0, mit = 0;
    for (const m of mails) {
      const { data: subs } = await db.from("push_subscriptions").select("*").ilike("email", m);
      if (subs?.length) mit++;
      for (const s of subs ?? []) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify({ title, body, tag: "kom-nopam-" + day, url: "./" }), { TTL: 43200, urgency: "normal" });
          sent++;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        }
      }
    }
    return json({ day, ohne: ohne.length, kom: mit, sent, title, body });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
