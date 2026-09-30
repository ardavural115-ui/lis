import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { blockRegistry } from "../src/blocks/index.ts";
import { checkTenant, quickReplies, templates, validateTemplate } from "../src/templates/index.ts";
import type { Template } from "../src/types.ts";
import { tenants } from "./helpers.ts";

describe("Vorlagen", () => {
  for (const template of templates.values()) {
    test(`${template.name} ist gültig`, () => {
      assert.deepEqual(validateTemplate(template, blockRegistry), []);
    });
  }

  test("Demo-Betriebe haben Werte für alle Platzhalter und keine Namenskonflikte", () => {
    for (const tenant of tenants.values()) {
      assert.deepEqual(checkTenant(templates.get(tenant.industry)!, tenant), [], tenant.id);
    }
  });

  test("Schnellantworten kommen aus dem Einstiegs-Workflow", () => {
    assert.deepEqual(quickReplies(templates.get("freelancer")!), [
      "Projekt anfragen",
      "Erstgespräch vereinbaren",
      "Rechnung & Zahlung",
      "Allgemeine Frage",
    ]);
  });

  test("Prüfung findet Fehler in Vorlagen", () => {
    const broken: Template = {
      id: "freelancer",
      name: "Kaputt",
      description: "",
      entry: "fehlt",
      guards: [{ id: "w", block: "logic.keywords", config: { keywords: ["x"], workflow: "gibt-es-nicht" } }],
      workflows: [
        {
          id: "a",
          name: "A",
          steps: [
            { id: "1", block: "gibt.es.nicht" },
            { id: "2", block: "logic.if", config: { field: "x", then: "fehlt" } },
            { id: "2", block: "form.ask", config: { fields: [{ key: "x", label: "X", type: "choice", question: "?" }] } },
          ],
        },
      ],
    };
    const errors = validateTemplate(broken, blockRegistry);
    assert.deepEqual(errors, [
      "Einstiegs-Workflow fehlt fehlt",
      "a/1: unbekannter Baustein gibt.es.nicht",
      "a/2: then-Schritt fehlt gibt es nicht",
      "a/2: Schritt doppelt",
      "a/2: Feld x: Auswahl braucht mindestens zwei options",
      "wächter/w: Workflow gibt-es-nicht gibt es nicht",
    ]);
  });

  test("Betriebsprüfung meldet fehlende Platzhalter und Konflikte", () => {
    const tenant = { ...tenants.get("praxis-demo")!, info: { telefon: "123" } };
    assert.deepEqual(checkTenant(templates.get("arztpraxis")!, tenant), [
      'Platzhalter {adresse} hat keinen Wert, bitte in "info" ergänzen',
      'Platzhalter {oeffnungszeiten} hat keinen Wert, bitte in "info" ergänzen',
      'Platzhalter {rufnummer} hat keinen Wert, bitte in "info" ergänzen',
      'Info-Schlüssel "telefon" heißt wie ein Feld, bitte umbenennen',
    ]);
  });
});
