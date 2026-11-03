// KOM27 Einsatzplanung – persönliches Kalender-Abo (Supabase Edge Function "ics", ohne Login-Prüfung)
// Abruf: https://<projekt>.supabase.co/functions/v1/ics?t=<persönlicher Schlüssel>
// Der Schlüssel steht nur beim Techniker selbst; er kann ihn in der App jederzeit erneuern.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const pad = (n: number) => String(n).padStart(2, "0");
const esc = (s: string) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const fold = (line: string) => { // Zeilen nach RFC 5545 auf 75 Bytes umbrechen
  const enc = new TextEncoder(); const out: string[] = []; let cur = "";
  for (const ch of line) { if (enc.encode(cur + ch).length > 74) { out.push(cur); cur = " " + ch; } else cur += ch; }
  out.push(cur); return out.join("\r\n");
};
const VTZ = ["BEGIN:VTIMEZONE", "TZID:Europe/Berlin", "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
  "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD", "END:VTIMEZONE"];

Deno.serve(async (req) => {
  const tok = new URL(req.url).searchParams.get("t") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(tok)) return new Response("Nicht gefunden", { status: 404 });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: t } = await db.from("technicians").select("id, name").eq("cal_token", tok).maybeSingle();
  if (!t) return new Response("Nicht gefunden", { status: 404 });
  const [{ data: p }, { data: asg }] = await Promise.all([
    db.from("plan").select("data").eq("id", 1).maybeSingle(),
    db.from("assignments").select("slot_key, status, actual_start, actual_end").eq("tech_id", t.id).in("status", ["zugesagt", "angefragt"]),
  ]);
  const byKey: Record<string, { status: string }> = {}; (asg ?? []).forEach((a) => (byKey[a.slot_key] = a));
  const from = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const ev: string[] = [];
  for (const d of p?.data?.days ?? []) {
    if (d.date < from) continue;
    for (const s of d.slots ?? []) {
      const a = byKey[s.key]; if (!a) continue;
      const m = /(\d{1,2})[:.](\d{2})\s*-\s*(\d{1,2})[:.](\d{2})/.exec(s.zeit || "");
      const ymd = d.date.replace(/-/g, "");
      let start = "", end = "";
      if (m) {
        start = `DTSTART;TZID=Europe/Berlin:${ymd}T${pad(+m[1])}${m[2]}00`;
        const over = +m[3] * 60 + +m[4] <= +m[1] * 60 + +m[2];
        const ed = new Date(d.date + "T12:00:00Z"); if (over) ed.setUTCDate(ed.getUTCDate() + 1);
        end = `DTEND;TZID=Europe/Berlin:${ed.toISOString().slice(0, 10).replace(/-/g, "")}T${pad(+m[3])}${m[4]}00`;
      } else {
        const nx = new Date(d.date + "T12:00:00Z"); nx.setUTCDate(nx.getUTCDate() + 1);
        start = `DTSTART;VALUE=DATE:${ymd}`; end = `DTEND;VALUE=DATE:${nx.toISOString().slice(0, 10).replace(/-/g, "")}`;
      }
      const det = s.det || {};
      const rooms = (det.rooms || []).map(([r, txt]: [string, string]) => `${r}:\n${String(txt).split("\n").map((x) => "• " + x).join("\n")}`).join("\n\n");
      const desc = [a.status === "angefragt" ? "⏳ ANFRAGE – noch nicht zugesagt" : "✓ zugesagt", `Einsatzzeit: ${s.zeit || "folgt"}`,
        det.vazeit || d.vazeit ? `Veranstaltung: ${det.vazeit || d.vazeit}` : "", det.einlass ? `Einlass: ${det.einlass}` : "", s.va ? `VA: ${s.va}` : "", rooms ? "\nAufbau:\n" + rooms : ""].filter(Boolean).join("\n");
      const roomList = [...new Set(String(d.info || "").match(/(Saal \d|Seminar \d|Foyer)/g) || [])].join(", ");
      ev.push(["BEGIN:VEVENT", `UID:${s.key.replace(/[^\w-]/g, "")}@kom27-einsatzplanung`, `DTSTAMP:${stamp}`, start, end,
        `SUMMARY:${esc((a.status === "angefragt" ? "❓ " : "") + "KOM27" + (roomList ? " · " + roomList : "") + (s.va ? " · " + s.va : ""))}`,
        `LOCATION:${esc("KOM27, Mauerstraße, Berlin")}`, `DESCRIPTION:${esc(desc)}`,
        d.cancelled ? "STATUS:CANCELLED" : a.status === "angefragt" ? "STATUS:TENTATIVE" : "STATUS:CONFIRMED", "END:VEVENT"].map(fold).join("\r\n"));
    }
  }
  const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//KOM27 Einsatzplanung//DE", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    fold(`X-WR-CALNAME:${esc("KOM27 Einsätze – " + t.name)}`), "X-WR-TIMEZONE:Europe/Berlin", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
    ...VTZ, ...ev, "END:VCALENDAR"].join("\r\n") + "\r\n";
  return new Response(body, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "max-age=900", "Content-Disposition": 'inline; filename="kom27.ics"' } });
});
