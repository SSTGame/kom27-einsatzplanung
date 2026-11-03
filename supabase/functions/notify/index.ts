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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: u } = await asUser.auth.getUser();
    if (!u?.user) return json({ error: "nicht angemeldet" }, 401);
    const { data: isAdmin } = await asUser.rpc("is_admin");

    const { target, tech_ids = [], title, body, tag } = await req.json();
    if (target !== "admins" && !isAdmin) return json({ error: "nur der Master darf Techniker benachrichtigen" }, 403);

    const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let emails: string[] = [];
    if (target === "admins") {
      const { data } = await db.from("admins").select("email");
      emails = (data ?? []).map((r) => r.email);
    } else {
      const { data } = await db.from("technicians").select("email").in("id", tech_ids);
      emails = (data ?? []).map((r) => r.email).filter(Boolean);
    }
    emails = emails.map((e) => e.toLowerCase()).filter((e) => e !== (u.user.email ?? "").toLowerCase());
    if (!emails.length) return json({ sent: 0 });

    const { data: subs } = await db.from("push_subscriptions").select("*").in("email", emails);
    webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com", Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);
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
    return json({ sent, devices: subs?.length ?? 0 });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
