// KOM27 Einsatzplanung – Passwort eines Kontos neu setzen (Supabase Edge Function "setpw")
// Nur der Master darf das: der Aufruf wird mit dem angemeldeten Konto geprüft (is_admin).
// Aufruf aus der Seite: supabase.functions.invoke('setpw', { body: { email, password } })
// Das Passwort wird nur weitergereicht und nirgends gespeichert oder protokolliert.
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
    const { data: isAdmin } = await asUser.rpc("is_admin");
    if (!isAdmin) return json({ error: "Nur der Master darf Passwörter setzen." }, 403);

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");
    if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Bitte eine gültige E-Mail angeben." }, 400);
    if (password.length < 8) return json({ error: "Das Passwort braucht mindestens 8 Zeichen." }, 400);
    if (password.length > 72) return json({ error: "Das Passwort ist zu lang (höchstens 72 Zeichen)." }, 400);

    const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let user: { id: string; email?: string } | undefined;
    for (let page = 1; page <= 10 && !user; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(error.message);
      user = (data?.users ?? []).find((u) => String(u.email ?? "").toLowerCase() === email);
      if ((data?.users ?? []).length < 200) break;
    }
    if (!user) return json({ error: "Für diese E-Mail gibt es noch kein Konto. Der Zugang entsteht erst beim ersten „Konto anlegen“." }, 404);

    const { error } = await db.auth.admin.updateUserById(user.id, { password });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, email });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
