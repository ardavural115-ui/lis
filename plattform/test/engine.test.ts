import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { blockRegistry } from "../src/blocks/index.ts";
import { TEXTS } from "../src/engine.ts";
import type { AiProvider, Block } from "../src/types.ts";
import { freelancer, mittelstand, praxis, setup } from "./helpers.ts";

describe("Arztpraxis", () => {
  test("Rezeptanfrage: Anliegen erkennen, Daten abfragen, prüfen, ans Team übergeben", async () => {
    const { chat, current } = setup();

    assert.deepEqual(await chat(praxis, "Ich brauche ein Folgerezept für meinen Blutdruck"), ["Wie ist Ihr vollständiger Name?"]);
    assert.equal(current(praxis).title, "Rezeptanfrage");

    await chat(praxis, "Max Muster");
    const [invalid] = await chat(praxis, "31.02.1980");
    assert.match(invalid!, /Format TT\.MM\.JJJJ/);
    await chat(praxis, "1.2.80");
    await chat(praxis, "0170 1234567");
    const [insurance] = await chat(praxis, "Ramipril 5 mg");
    assert.match(insurance!, /1\) gesetzlich\n2\) privat/);
    await chat(praxis, "2");
    const [confirmation] = await chat(praxis, "1");

    assert.match(confirmation!, /Vielen Dank, Max Muster!.*0170 1234567/);
    const c = current(praxis);
    assert.equal(c.status, "team");
    assert.equal(c.team, "Empfang");
    assert.deepEqual(c.data, {
      name: "Max Muster",
      geburtsdatum: "01.02.1980",
      telefon: "0170 1234567",
      medikament: "Ramipril 5 mg",
      versicherung: "privat",
      rezeptart: "E-Rezept auf die Versichertenkarte",
    });
    assert.match(c.summary!, /Medikament: Ramipril 5 mg/);
  });

  test("Notfall wird bei jeder Nachricht erkannt, auch mitten im Formular", async () => {
    const { chat, current } = setup();
    await chat(praxis, "Rezept bitte");
    await chat(praxis, "Max Muster");

    const replies = await chat(praxis, "Mir ist schwindelig und ich bekomme keine Luft");
    assert.equal(replies.length, 1);
    assert.match(replies[0]!, /112/);
    const c = current(praxis);
    assert.equal(c.status, "team");
    assert.equal(c.priority, "high");
    assert.ok(c.tags.includes("notfall"));
    assert.equal(c.data.name, "Max Muster", "bisherige Angaben bleiben erhalten");
  });

  test("Notfall-Hinweis kommt auch, wenn der Vorgang schon beim Team liegt", async () => {
    const { chat } = setup();
    await chat(praxis, "Ich habe eine Frage zur Rechnung");
    await chat(praxis, "Max Muster");
    await chat(praxis, "0170 1234567");
    const [notice] = await chat(praxis, "Jetzt habe ich starke Brustschmerzen");
    assert.match(notice!, /112/);
  });

  test("unklares Anliegen: Auswahlmenü, dann Auswahl per Nummer", async () => {
    const { chat, current } = setup();
    const [menu] = await chat(praxis, "Hallo");
    assert.match(menu!, /1\) Rezept bestellen\n2\) Termin anfragen/);

    // Die Menüauswahl „2“ darf nicht als Angabe für das Formular zählen
    assert.deepEqual(await chat(praxis, "2"), ["Wie ist Ihr vollständiger Name?"]);
    assert.equal(current(praxis).title, "Terminanfrage");
  });

  test("Schnellantwort-Knopf startet den Workflow direkt", async () => {
    const { chat, current } = setup();
    assert.deepEqual(await chat(praxis, "Überweisung anfragen"), ["Wie ist Ihr vollständiger Name?"]);
    assert.equal(current(praxis).title, "Überweisung");
  });

  test("häufige Frage wird aus dem FAQ beantwortet und der Vorgang erledigt", async () => {
    const { chat, current } = setup();
    const [answer] = await chat(praxis, "Wann haben Sie geöffnet?");
    assert.match(answer!, /Mo bis Fr 8 bis 12 Uhr/);
    assert.equal(current(praxis).status, "done");
  });

  test("Frage ohne Antwort im Wissen geht mit Kontaktdaten ans Team", async () => {
    const { chat, current } = setup();
    await chat(praxis, "Allgemeine Frage");
    const replies = await chat(praxis, "Bieten Sie Akupunktur an?");
    assert.deepEqual(replies, [
      "Das kann ich leider nicht direkt beantworten. Ich gebe Ihre Frage an das Praxisteam weiter.",
      "Wie ist Ihr vollständiger Name?",
    ]);
    await chat(praxis, "Erika Beispiel");
    await chat(praxis, "030 1234567");
    assert.equal(current(praxis).status, "team");
  });

  test("optionale Frage lässt sich mit „-“ überspringen", async () => {
    const { chat, current } = setup();
    await chat(praxis, "Überweisung anfragen");
    for (const answer of ["Max Muster", "01.02.1980", "0170 1234567", "gesetzlich", "Orthopädie"]) await chat(praxis, answer);
    const [confirmation] = await chat(praxis, "-");
    assert.match(confirmation!, /Anfrage zur Überweisung ist eingegangen/);
    assert.equal(current(praxis).data.anlass, "");
  });
});

describe("Freelancer", () => {
  test("großes Budget macht die Projektanfrage dringend (Wenn-dann)", async () => {
    const { chat, current } = setup();
    await chat(freelancer, "Ich brauche eine neue Website für mein Café");
    for (const answer of ["Erika Beispiel", "erika@example.com", "Website mit Onlineshop"]) await chat(freelancer, answer);
    await chat(freelancer, "3");
    const [confirmation] = await chat(freelancer, "bis Ende des Jahres");

    assert.match(confirmation!, /innerhalb von 24 Stunden/);
    const c = current(freelancer);
    assert.equal(c.data.budget, "über 10.000 €");
    assert.equal(c.priority, "high");
    assert.ok(c.tags.includes("großprojekt"));
  });

  test("kleines Budget bleibt normal", async () => {
    const { chat, current } = setup();
    await chat(freelancer, "Projekt anfragen");
    for (const answer of ["Erika Beispiel", "erika@example.com", "Logo", "1", "egal"]) await chat(freelancer, answer);
    assert.equal(current(freelancer).priority, "normal");
  });

  test("E-Mail-Adresse aus der ersten Nachricht wird übernommen", async () => {
    const { chat, current } = setup();
    await chat(freelancer, "Hallo, ich hätte gern ein Angebot für ein Projekt, erreichbar unter erika@example.com");
    assert.equal(current(freelancer).data.email, "erika@example.com");
  });
});

describe("Mittelstand", () => {
  test("Eskalationswort erhöht die Priorität und das Anliegen läuft trotzdem weiter", async () => {
    const { chat, current } = setup();
    const [question] = await chat(mittelstand, "Beschwerde: unsere Maschine ist defekt");
    assert.equal(question, "Für welche Firma schreiben Sie?");
    const c = current(mittelstand);
    assert.equal(c.title, "Service & Reklamation");
    assert.equal(c.priority, "high");
    assert.ok(c.tags.includes("dringend"));
  });
});

describe("Befehle und Team", () => {
  test("Daten löschen entfernt alle Vorgänge des Kontakts", async () => {
    const { chat, store } = setup();
    await chat(praxis, "Rezept bitte");
    await chat(praxis, "Hallo", "andere-sitzung");
    assert.deepEqual(await chat(praxis, "daten LÖSCHEN"), [TEXTS.deleted]);
    assert.deepEqual(
      store.list(praxis.id).map((c) => c.contact),
      ["andere-sitzung"],
    );
  });

  test("abbrechen beendet eine laufende Anfrage", async () => {
    const { chat, current } = setup();
    await chat(praxis, "Rezept bitte");
    assert.deepEqual(await chat(praxis, "Abbrechen"), [TEXTS.cancelled]);
    assert.equal(current(praxis).status, "done");
  });

  test("Team antwortet und schließt, danach beginnt ein neuer Vorgang", async () => {
    const { chat, engine, current } = setup();
    await chat(praxis, "Befund / Unterlagen");
    for (const answer of ["Max Muster", "01.02.1980", "0170 1234567", "Blutwerte von letzter Woche"]) await chat(praxis, answer);
    const c = current(praxis);
    assert.equal(c.status, "team");

    // Kunde schreibt nach: wird angehängt, Eingang wird nur einmal bestätigt
    assert.deepEqual(await chat(praxis, "Noch eine Ergänzung"), [TEXTS.forwarded]);
    assert.deepEqual(await chat(praxis, "Und noch eine"), []);

    await engine.teamReply(praxis, c.id, "Ihre Werte sind da, wir rufen Sie heute an.");
    assert.equal(c.messages.at(-1)?.from, "team");
    engine.closeCase(praxis, c.id);
    assert.equal(c.status, "done");

    await chat(praxis, "Hallo");
    assert.notEqual(current(praxis).id, c.id);
  });

  test("Team kann nur Vorgänge des eigenen Betriebs bearbeiten", async () => {
    const { chat, engine, current } = setup();
    await chat(praxis, "Rezept bitte");
    const id = current(praxis).id;
    assert.equal(await engine.teamReply(freelancer, id, "Hallo"), undefined);
    assert.equal(engine.closeCase(freelancer, id), undefined);
  });
});

describe("Fehler", () => {
  test("ein kaputter Baustein landet beim Team statt die Anfrage zu verlieren", async () => {
    const broken: Block = { ...blockRegistry.get("form.ask")!, run: async () => Promise.reject(new Error("kaputt")) };
    const blocks = new Map(blockRegistry);
    blocks.set("form.ask", broken);
    const { chat, current, logs } = setup({ blocks });

    assert.deepEqual(await chat(praxis, "Rezept bitte"), [TEXTS.failed]);
    const c = current(praxis);
    assert.equal(c.status, "team");
    assert.ok(c.tags.includes("fehler"));
    assert.match(logs.join("\n"), /kaputt/);
  });

  test("KI-Antworten werden geprüft: ungültige Angaben werden nicht übernommen", async () => {
    const ai: AiProvider = {
      name: "test",
      classify: async () => "rezept",
      extract: async () => ({ name: "Max Muster", geburtsdatum: "irgendwann", versicherung: "weiß nicht" }),
      answer: async () => null,
      summarize: async () => "",
    };
    const { chat, current } = setup({ ai });
    const [question] = await chat(praxis, "Ich bin Max Muster und brauche ein Rezept");
    assert.equal(question, "Wie ist Ihr Geburtsdatum (TT.MM.JJJJ)?");
    assert.deepEqual(current(praxis).data, { name: "Max Muster" });
  });
});
