import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isSkip, matchOption, parseDate, parseValue } from "../src/fields.ts";
import { containsKeyword, fillPlaceholders } from "../src/text.ts";
import { NOW } from "./helpers.ts";

describe("Datum", () => {
  test("versteht deutsche und ISO-Schreibweisen", () => {
    assert.equal(parseDate("12.03.1980", NOW), "12.03.1980");
    assert.equal(parseDate("am 1.2.80 geboren", NOW), "01.02.1980");
    assert.equal(parseDate("1.2.20", NOW), "01.02.2020");
    assert.equal(parseDate("1980-03-12", NOW), "12.03.1980");
  });

  test("versteht heute, gestern und vorgestern", () => {
    assert.equal(parseDate("seit heute", NOW), "30.09.2026");
    assert.equal(parseDate("Seit gestern", NOW), "29.09.2026");
    assert.equal(parseDate("vorgestern", NOW), "28.09.2026");
  });

  test("lehnt unmögliche Daten ab", () => {
    assert.equal(parseDate("31.02.1980", NOW), null);
    assert.equal(parseDate("12.13.1980", NOW), null);
    assert.equal(parseDate("irgendwann", NOW), null);
  });
});

describe("Angaben prüfen", () => {
  const field = (type: "email" | "phone" | "text") => ({ key: "x", label: "X", type });

  test("E-Mail wird im Text gefunden und klein geschrieben", () => {
    assert.equal(parseValue(field("email"), "Meine Adresse: Max.Muster@Example.de, danke", NOW), "max.muster@example.de");
    assert.equal(parseValue(field("email"), "max(at)example.de", NOW), null);
  });

  test("Telefonnummer braucht mindestens 6 Ziffern", () => {
    assert.equal(parseValue(field("phone"), "0170 1234567", NOW), "0170 1234567");
    assert.equal(parseValue(field("phone"), "+49 (170) 123-4567", NOW), "+49 (170) 123-4567");
    assert.equal(parseValue(field("phone"), "123", NOW), null);
  });

  test("Freitext darf nicht leer oder zu lang sein", () => {
    assert.equal(parseValue(field("text"), "  ", NOW), null);
    assert.equal(parseValue(field("text"), "x".repeat(501), NOW), null);
  });

  test("Auswahl per Nummer oder Text", () => {
    const options = ["gesetzlich", "privat"];
    assert.equal(matchOption("2", options), "privat");
    assert.equal(matchOption("2.", options), "privat");
    assert.equal(matchOption("Ich bin privat versichert", options), "privat");
    assert.equal(matchOption("GESETZLICH", options), "gesetzlich");
    assert.equal(matchOption("3", options), null);
    assert.equal(matchOption("weiß nicht", options), null);
    assert.equal(matchOption("über 10000", ["unter 2.000 €", "über 10.000 €"]), "über 10.000 €");
  });

  test("optionale Fragen lassen sich überspringen", () => {
    assert.ok(isSkip("-"));
    assert.ok(isSkip("Keine Angabe"));
    assert.ok(!isSkip("Knie"));
  });
});

describe("Texte", () => {
  test("kurze Stichwörter nur als ganzes Wort, lange auch in Wörtern", () => {
    assert.ok(containsKeyword("Ich brauche eine AU", "au"));
    assert.ok(!containsKeyword("Ich brauche auch Hilfe", "au"));
    assert.ok(containsKeyword("Folgerezept bitte", "rezept"));
    assert.ok(containsKeyword("Überweisung zum Orthopäden", "orthopäd"));
  });

  test("Platzhalter werden ersetzt, unbekannte bleiben stehen", () => {
    assert.equal(fillPlaceholders("Hallo {name}, {unbekannt}", { name: "Max" }), "Hallo Max, {unbekannt}");
  });
});
