# E-Mail-Vorlagen (Supabase → Authentication → Emails)

| Vorlage | Betreff | Inhalt |
|---|---|---|
| Confirm signup | KOM27 Einsatzplanung – bitte E-Mail bestätigen | bestaetigung.html |
| Reset password | KOM27 Einsatzplanung – neues Passwort | passwort.html |

Wichtig: Unter Authentication → URL Configuration muss die **Site URL** `https://kom27-einsatzplanung.kom27.workers.dev` sein.
Die Links zeigen auf die eigene Seite; die App bestätigt sie selbst (`verifyOtp` mit `token_hash`).

Hinweis: Supabase lässt die Vorlagen nur ändern, wenn unter **Emails → SMTP Settings** ein eigener E-Mail-Versand eingerichtet ist
(z. B. ein Postfach der Firma oder ein Dienst wie Brevo/Resend). Dann kommt die Mail auch nicht mehr von „Supabase Auth“, sondern mit eigenem Absender.
