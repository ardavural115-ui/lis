# Lis-Plattform: Bausteine für Workflows

Ein Baukasten für digitale Anfrage-Workflows, nach dem Vorbild von 321 MED:
Kunden schreiben im Chat, der Assistent erkennt das Anliegen, fragt die nötigen Angaben ab
und legt dem Team einen **fertig vorbereiteten Vorgang** hin.

Wir starten mit den Basics für drei Zielgruppen: **Arztpraxis, Freelancer, Mittelstand**.
Weitere Varianten (WhatsApp, Telefon, „Jarvis“) docken später an dieselbe Engine an.

## Aufbau

```
Kanäle          Web-Chat  ·  später: WhatsApp, Telefon, Jarvis (Sprach-Copilot)
   │
Workflow-Engine Nachricht rein → Vorgang finden/anlegen → Schritte ausführen → Antworten raus
   │
Bausteine       9 Basis-Bausteine: Daten abfragen, Anliegen erkennen, Wenn-dann …
   │
Vorlagen        Arztpraxis  ·  Freelancer  ·  Mittelstand
```

| Begriff  | im Code                  | Bedeutung                                                              |
| -------- | ------------------------ | ---------------------------------------------------------------------- |
| Baustein | `Block`, `src/blocks/`   | wiederverwendbare Fähigkeit, z. B. „Daten abfragen“                    |
| Workflow | `Workflow`               | Schritte nacheinander, jeder Schritt nutzt einen Baustein              |
| Vorlage  | `Template`, `src/templates/` | fertige Workflows für eine Branche                                 |
| Wächter  | `guards`                 | Bausteine, die bei **jeder** Nachricht mitlaufen (z. B. Notfall)       |
| Betrieb  | `Tenant`, `tenants/*.json` | ein Kunde von uns: Praxis, Freelancer oder Firma                    |
| Vorgang  | `Case`                   | eine Anfrage vom ersten Kontakt bis „erledigt“                         |
| Kanal    | `Channel`, `src/channels/` | Weg zum Kunden: Web-Chat, später WhatsApp und Telefon               |

## Schnellstart

Voraussetzung: Node.js 22.18 oder neuer. Node führt TypeScript direkt aus, es gibt keinen Build-Schritt.

```bash
cd plattform
npm install
npm start            # Server auf http://127.0.0.1:3000
npm test             # alle Tests
npm run typecheck    # TypeScript-Prüfung
```

Beim Start zeigt die Konsole für jeden Betrieb die Links zu Chat und Team-Inbox und den Team-Zugang.
Ohne `ANTHROPIC_API_KEY` arbeitet der Assistent mit einfachen Regeln (Stichwörter). Mit Schlüssel übernimmt Claude
das Erkennen, Auslesen, Beantworten und Zusammenfassen.

| Variable                   | Bedeutung                                             | Standard                        |
| -------------------------- | ----------------------------------------------------- | ------------------------------- |
| `ANTHROPIC_API_KEY`        | Schlüssel für Claude                                  | leer, dann Regeln               |
| `LIS_KI`                   | `claude` oder `rules`                                 | `claude`, wenn Schlüssel gesetzt |
| `LIS_KI_MODELL`            | Claude-Modell                                         | `claude-opus-5-5`               |
| `LIS_TEAM_TOKEN_<BETRIEB>` | Team-Zugang, z. B. `LIS_TEAM_TOKEN_PRAXIS_DEMO` (mind. 16 Zeichen) | bei jedem Start neu erzeugt |
| `LIS_DATEN`                | Datei für die Vorgänge                                | `data/cases.json`               |
| `LIS_BETRIEBE`             | Ordner mit den Betriebs-Dateien                       | `tenants/`                      |
| `PORT`, `HOST`             | Adresse des Servers                                   | `3000`, `127.0.0.1`             |
| `LIS_PROXY`                | `1` hinter einem Reverse Proxy (echte IP aus `X-Forwarded-For`) | aus                   |

## Baustein-Katalog

| Baustein           | Typ              | Was er tut                                                                                   |
| ------------------ | ---------------- | -------------------------------------------------------------------------------------------- |
| Nachricht senden   | `message.send`   | schickt einen festen Text, Platzhalter wie `{name}` werden ersetzt                           |
| Daten abfragen     | `form.ask`       | fragt Felder nacheinander ab (Text, E-Mail, Telefon, Datum, Auswahl), prüft sie und übernimmt Genanntes |
| Anliegen erkennen  | `ai.route`       | ordnet die Anfrage einem Workflow zu; ist es unklar, kommt ein Auswahlmenü                   |
| Frage beantworten  | `ai.answer`      | antwortet nur aus dem FAQ des Betriebs, sonst weiter zum nächsten Schritt                    |
| Zusammenfassen     | `ai.summarize`   | Kurzfassung des Vorgangs für das Team                                                        |
| Stichwörter prüfen | `logic.keywords` | reagiert auf Wörter wie „Notfall“ oder „Beschwerde“: Hinweis, Priorität, Sprung, Workflow     |
| Wenn – dann        | `logic.if`       | verzweigt nach einer Angabe, z. B. Budget                                                    |
| Vorgang markieren  | `case.update`    | setzt Titel, Priorität, Schlagwörter oder das zuständige Team                                |
| An Team übergeben  | `team.handoff`   | übergibt den Vorgang und bestätigt dem Kunden den Eingang                                    |

Den aktuellen Katalog liefert auch der Server: `GET /api/catalog`.

## Vorlagen

- **Arztpraxis:** Rezept, Termin, Überweisung, Krankschreibung (AU), Befund/Unterlagen, allgemeine Frage.
  Wächter „Notfall“: Bei Wörtern wie „Brustschmerzen“ oder „keine Luft“ kommen sofort 112, 116 117 und die
  Telefonseelsorge, und der Vorgang geht dringend ans Team. Das gilt in jeder Nachricht, auch mitten im Formular.
- **Freelancer:** Projektanfrage (Budget über 10.000 € wird automatisch dringend), Erstgespräch, Rechnung & Zahlung, allgemeine Frage.
- **Mittelstand:** Service & Reklamation, Angebot & Bestellung, Rückruf, Bewerbung, allgemeine Frage.
  Wächter „Eskalation“: Beschwerde, Kündigung, Anwalt usw. machen den Vorgang dringend.

## Anleitungen

**Neuen Betrieb anlegen:** `tenants/praxis-demo.json` kopieren und `id`, `name`, `info` und `faq` anpassen.
Werte aus `info` stehen als Platzhalter bereit, z. B. `{oeffnungszeiten}`. Ein Info-Schlüssel darf nicht wie ein
abgefragtes Feld heißen, sonst gibt es beim Start eine Warnung.

**Workflow ändern:** Die Vorlagen liegen in `src/templates/`. Ein neues Feld ist ein Eintrag in `fields`
eines `form.ask`-Schritts. `npm test` prüft danach alle Vorlagen: fehlende Bausteine, falsche Sprungziele und fehlende Platzhalter.

**Neuen Baustein bauen:** Datei in `src/blocks/` anlegen und in `src/blocks/index.ts` eintragen.

```ts
import type { Block } from "../types.ts";

export const greet: Block = {
  type: "beispiel.hallo",
  title: "Hallo sagen",
  description: "Begrüßt den Kunden mit Namen.",
  category: "kommunikation",
  validate: () => [],
  async run(ctx) {
    ctx.reply(ctx.fill("Hallo {name}!"));
    return { type: "next" }; // oder: wait, goto, switch, handoff, end
  },
};
```

**Neuen Kanal anbinden (z. B. WhatsApp):** Der Kanal nimmt Nachrichten an (bei WhatsApp per Webhook von Meta),
ruft `engine.handleMessage({ tenant, channel: "whatsapp", contact, text })` auf und schickt die `replies` zurück.
Für Antworten des Teams setzt er `deliver()` um. Als `contact` die Telefonnummer nur als Hash speichern, so wie Lis es heute schon macht.

## Datenschutz: was schon eingebaut ist

- Der Assistent sagt in der Begrüßung, dass er eine KI ist (AI Act Art. 50).
- „Daten löschen“ entfernt sofort alle Vorgänge eines Kontakts. Ohne Aktivität wird nach `retentionDays` gelöscht (Standard 30 Tage).
- Der Notfall-Wächter ist fest programmiert und hängt nicht von der KI ab. Die KI bewertet keine Beschwerden,
  sonst wäre die Software ein Medizinprodukt (MDR).
- Keine Kundentexte in Logs. Die Datei mit den Vorgängen ist nur für den Server-Nutzer lesbar und steht nicht im Git.
- Team-Zugang pro Betrieb, Bremse gegen zu viele Chat-Nachrichten, strenge Content-Security-Policy.

**Vor dem Echtbetrieb mit Patientendaten** (Arztpraxis) sind noch nötig:

1. Claude über eine EU-Region anbinden (AWS Bedrock Frankfurt oder Google Vertex AI EU) statt über die direkte API.
   Bis dahin im Betrieb `"ai": "rules"` setzen.
2. Hosting in Deutschland, Vertrag zur Auftragsverarbeitung mit der Praxis, Datenschutz-Folgenabschätzung, Verschwiegenheit nach § 203 StGB.
3. § 393 SGB V klären: Cloud-Dienste für Gesundheitsdaten brauchen ein C5-Testat.
4. Richtige Datenbank und Nutzerkonten statt JSON-Datei und gemeinsamem Team-Zugang.

## Fahrplan

1. **Basics (jetzt):** Engine, 9 Bausteine, 3 Vorlagen, Web-Chat, Team-Inbox.
2. **Ausbau:** Benachrichtigung per E-Mail/SMS, Termine und Kalender, Nutzerkonten mit Rollen, Datenbank,
   Widget zum Einbinden auf Kunden-Websites.
3. **Varianten:** WhatsApp-Kanal (aus dem heutigen Lis), Telefon, „Jarvis“ als Sprach-Copilot fürs Team
   („Welche Rezeptanfragen sind offen?“), gebaut mit Claude und Werkzeugen, die auf dieselbe Engine zugreifen.
4. **Später:** Agenten, Schnittstellen zu Praxissoftware und CRM, visueller Workflow-Editor.

## Ordner

```
plattform/
  src/
    engine.ts        Workflow-Engine
    types.ts         alle Begriffe als Typen
    blocks/          Bausteine
    templates/       Vorlagen je Branche
    ai/              Claude und Regeln
    channels/        Kanäle (Web-Chat)
    app.ts, main.ts  HTTP-Server
  tenants/           Betriebe (JSON)
  public/            Chat-Widget und Team-Inbox
  test/              Tests
```
