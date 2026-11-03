# KOM27 Einsatzplanung

Web-Tool zur Einteilung der Servicetechniker für das KOM27 (ÖPP Mauerstraße) auf Basis des VA-Kalenders aus SharePoint.

- **Master (du):** Excel einlesen → Auto-Einteilung → bei Bedarf umbesetzen → Anfragen per E-Mail → Zusagen und Absagen im Blick behalten
- **Techniker:** Login mit E-Mail und Passwort → sehen nur die eigenen angefragten Einsätze → „Kann ich“ / „Kann nicht“ (bei mehrtägigen VAs auch „Alle Tage zusagen“)

Die Kalenderdaten liegen **nicht** im GitHub-Repo, sondern nur in deiner Supabase-Datenbank, geschützt durch den Login.

---

## Einrichtung (einmalig, ca. 15 Minuten)

### 1. Supabase-Datenbank anlegen (kostenlos)
1. Auf <https://supabase.com> ein Konto anlegen → **New project** (Region: Frankfurt, Passwort beliebig).
2. Links **SQL Editor** → **New query** → den Inhalt von `supabase-setup.sql` einfügen.
   In der **letzten Zeile deine E-Mail** eintragen → **Run**.
3. **Project Settings → API**: `Project URL` und den Key `anon public` kopieren.

### 2. Dateien auf GitHub (Konto SSTGame)
1. Neues Repository anlegen, z. B. `kom27-einsatzplanung` (Public ist ok, es enthält keine Kalenderdaten).
2. Alle Dateien aus diesem Ordner hochladen (*Add file → Upload files*): `index.html`, `app.js`, `parser.js`, `style.css`, `config.js`, `README.md`, `supabase-setup.sql`.
3. **Settings → Pages** → Branch `main`, Ordner `/ (root)` → Save.
   Nach ca. 1 Minute läuft die Seite unter `https://sstgame.github.io/kom27-einsatzplanung/`.

### 3. `config.js` ausfüllen
Direkt auf GitHub `config.js` öffnen → Stift-Symbol → eintragen:
```js
supabaseUrl: 'https://xxxx.supabase.co',
supabaseAnonKey: 'eyJ…',
appUrl: 'https://sstgame.github.io/kom27-einsatzplanung/',
```
Der `anon`-Key ist für den Browser gedacht und darf öffentlich sein. Die Daten schützen die Zugriffsregeln aus dem SQL-Setup.

### 4. Login-Links einstellen
Supabase → **Authentication → URL Configuration** → *Site URL* = deine GitHub-Pages-Adresse.
Damit führen Bestätigungs- und „Passwort vergessen“-Mails auf die richtige Seite.

### 5. Los geht's
1. Seite öffnen → **Konto anlegen** mit der E-Mail aus Schritt 1.2 → Bestätigungsmail anklicken → anmelden. Du bist automatisch der Master.
2. Tab **Techniker**: Namen aus der Excel per Klick übernehmen und E-Mail-Adressen eintragen. Bei abweichender Schreibweise in der Excel (z. B. „Kevin R.“ / „Kevin Rehfeld“) beide unter „Andere Schreibweisen“ eintragen.
3. Den Technikern einmal den Link schicken. Beim ersten Mal klicken sie auf **Konto anlegen**, mit genau der hinterlegten E-Mail.

---

## Ablauf im Alltag
1. **SharePoint öffnen** → *Datei → Kopie herunterladen* → die .xlsx ins Tool ziehen. Bereits vorhandene Einteilungen bleiben erhalten.
2. **Auto-Einteilung**: füllt nur leere Plätze ab heute.
   - Namen, die schon in der Excel stehen, werden übernommen.
   - Mehrtägige VAs (Farbmarkierung oder gleiche VA-Nummer inkl. Aufbau-Tag) bekommen möglichst dieselbe Person an allen Tagen.
   - Danach wird gleichmäßig verteilt. Niemand wird doppelt am selben Tag eingeteilt, und wer abgesagt hat, wird für diesen Einsatz nicht erneut vorgeschlagen.
3. Bei Bedarf im Dropdown umbesetzen.
4. Tab **Anfragen** → „Anfrage per E-Mail“ öffnet eine fertige Mail mit allen Terminen und dem Link.
5. Antworten erscheinen sofort farbig. Bei Absagen hilft **Ersatz automatisch suchen**. Den Status kannst du auch von Hand ändern (Klick auf den Status), z. B. nach einem Anruf.
6. **Zusagen kopieren** legt Datum + Namen in die Zwischenablage, um sie in die KOM27-Excel einzutragen.

## Was das Tool aus der Excel liest
| Spalte | Inhalt |
|---|---|
| A | Datum (blau = frei/Wochenende) |
| D | Anzahl Service-Techniker |
| E | Name Techniker (Farbe gelb/orange/rosa = mehrtägige VA) |
| F | Einsatzzeit |
| I | Veranstaltung / VA-Nummer |
| VA-Uhrzeit, Säle | als Info für die Techniker |

Ändert KOM27 den Aufbau der Tabelle (andere Spalten), muss `parser.js` angepasst werden.
