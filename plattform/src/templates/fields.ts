// Felder, die in vielen Vorlagen vorkommen.

import type { FormField } from "../blocks/form.ts";

export const NAME: FormField = {
  key: "name",
  label: "Name",
  type: "text",
  question: "Wie ist Ihr vollständiger Name?",
};

export const EMAIL: FormField = {
  key: "email",
  label: "E-Mail",
  type: "email",
  question: "Unter welcher E-Mail-Adresse erreichen wir Sie?",
};

export const PHONE: FormField = {
  key: "telefon",
  label: "Telefon",
  type: "phone",
  question: "Unter welcher Telefonnummer erreichen wir Sie?",
};

export const BIRTHDATE: FormField = {
  key: "geburtsdatum",
  label: "Geburtsdatum",
  type: "date",
  question: "Wie ist Ihr Geburtsdatum (TT.MM.JJJJ)?",
};

export const INSURANCE: FormField = {
  key: "versicherung",
  label: "Versicherung",
  type: "choice",
  options: ["gesetzlich", "privat"],
  question: "Wie sind Sie versichert?",
};

export const COMPANY: FormField = {
  key: "firma",
  label: "Firma",
  type: "text",
  question: "Für welche Firma schreiben Sie?",
};
