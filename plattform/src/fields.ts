// Prüfen und Vereinheitlichen von Angaben (Datum, E-Mail, Telefon, Auswahl).

import type { FieldSpec } from "./types.ts";
import { normalize } from "./text.ts";

const EMAIL = /[^\s@,;:<>()]+@[^\s@,;:<>()]+\.[a-z]{2,}/i;
const PHONE = /\+?\d[\d\s/()-]{4,}\d/;
const DATE_DE = /\b(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4}|\d{2})\b/;
const DATE_ISO = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const MAX_TEXT = 500;

/** Liefert den vereinheitlichten Wert oder null, wenn die Angabe nicht passt. */
export function parseValue(field: FieldSpec, raw: string, now: Date): string | null {
  const text = raw.trim();
  if (!text) return null;
  switch (field.type) {
    case "email":
      return text.match(EMAIL)?.[0].toLowerCase() ?? null;
    case "phone":
      return parsePhone(text);
    case "date":
      return parseDate(text, now);
    case "choice":
      return matchOption(text, field.options ?? []);
    case "text":
      return text.length <= MAX_TEXT ? text : null;
  }
}

function parsePhone(text: string): string | null {
  const match = text.match(PHONE)?.[0];
  if (!match) return null;
  const digits = match.replace(/\D/g, "").length;
  return digits >= 6 && digits <= 15 ? match.replace(/\s+/g, " ").trim() : null;
}

/** Versteht „12.03.1980“, „12.3.80“, „1980-03-12“ sowie heute, gestern, vorgestern, morgen. */
export function parseDate(text: string, now: Date): string | null {
  const words = ` ${normalize(text)} `;
  const relative: [string, number][] = [
    ["vorgestern", -2],
    ["uebermorgen", 2],
    ["gestern", -1],
    ["heute", 0],
    ["morgen", 1],
  ];
  for (const [word, offset] of relative) {
    if (words.includes(` ${word} `)) {
      const d = new Date(now);
      d.setDate(d.getDate() + offset);
      return formatDate(d.getDate(), d.getMonth() + 1, d.getFullYear());
    }
  }

  let day: number, month: number, year: number;
  const de = text.match(DATE_DE);
  const iso = text.match(DATE_ISO);
  if (de) {
    day = Number(de[1]);
    month = Number(de[2]);
    year = Number(de[3]);
    if (de[3].length === 2) year += year > now.getFullYear() % 100 ? 1900 : 2000;
  } else if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  const exists =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!exists || year < 1900 || year > now.getFullYear() + 5) return null;
  return formatDate(day, month, year);
}

function formatDate(day: number, month: number, year: number): string {
  return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`;
}

/** Auswahl per Nummer („2“) oder Text („privat versichert“ passt zu „privat“). */
export function matchOption(text: string, options: string[]): string | null {
  const number = normalize(text).match(/^(\d{1,2})$/);
  if (number) return options[Number(number[1]) - 1] ?? null;

  const compact = (s: string) => normalize(s).replace(/ /g, "");
  const input = compact(text);
  if (!input) return null;
  const exact = options.find((o) => compact(o) === input);
  if (exact) return exact;
  const partial = options.filter((o) => compact(o).includes(input) || input.includes(compact(o)));
  return partial.length === 1 ? partial[0] : null;
}

const SKIP_WORDS = new Set(["weiter", "ueberspringen", "keine angabe", "keine", "nein", "skip"]);

/** Antwort, mit der eine optionale Frage übersprungen wird. */
export function isSkip(text: string): boolean {
  const t = text.trim();
  return t === "-" || t === "–" || SKIP_WORDS.has(normalize(t));
}

export function invalidHint(field: FieldSpec): string {
  switch (field.type) {
    case "date":
      return "Bitte geben Sie das Datum im Format TT.MM.JJJJ an.";
    case "email":
      return "Das sieht nicht nach einer gültigen E-Mail-Adresse aus.";
    case "phone":
      return "Bitte geben Sie eine gültige Telefonnummer an.";
    case "choice":
      return "Bitte wählen Sie eine der Möglichkeiten.";
    case "text":
      return `Bitte antworten Sie kurz (höchstens ${MAX_TEXT} Zeichen).`;
  }
}
