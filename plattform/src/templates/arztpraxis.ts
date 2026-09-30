// Vorlage Arztpraxis: Online-Rezeption für Rezepte, Termine, Überweisungen, AU, Befunde und Fragen.
// Die KI bewertet keine Beschwerden (sonst Medizinprodukt nach MDR). Sie nimmt nur auf und leitet weiter.

import type { Template } from "../types.ts";
import { BIRTHDATE, INSURANCE, NAME, PHONE } from "./fields.ts";

const EMERGENCY_KEYWORDS = [
  "notfall",
  "notarzt",
  "brustschmerz",
  "atemnot",
  "keine luft",
  "bewusstlos",
  "ohnmacht",
  "starke blutung",
  "blutet stark",
  "schlaganfall",
  "herzinfarkt",
  "lähmung",
  "krampfanfall",
  "suizid",
  "selbstmord",
  "umbringen",
  "nicht mehr leben",
];

const EMERGENCY_NOTICE =
  "Wichtig: Bei akuter Lebensgefahr rufen Sie bitte sofort die 112 an. " +
  "Den ärztlichen Bereitschaftsdienst erreichen Sie unter 116 117. " +
  "In seelischen Krisen hilft die Telefonseelsorge rund um die Uhr: 0800 111 0 111. " +
  "Ich habe Ihre Nachricht zusätzlich als dringend an das Praxisteam weitergegeben.";

export const arztpraxis: Template = {
  id: "arztpraxis",
  name: "Arztpraxis",
  description:
    "Online-Rezeption: Rezepte, Termine, Überweisungen, Krankschreibungen, Befunde und Fragen, mit Notfall-Hinweis.",
  entry: "arztpraxis.eingang",
  // Läuft bei jeder Nachricht, auch mitten im Rezept-Formular oder wenn das Team schon dran ist
  guards: [
    { id: "notfall", block: "logic.keywords", config: { keywords: EMERGENCY_KEYWORDS, workflow: "arztpraxis.notfall" } },
  ],
  workflows: [
    {
      id: "arztpraxis.eingang",
      name: "Neue Anfrage",
      steps: [
        {
          id: "anliegen",
          block: "ai.route",
          config: {
            question: "Wobei kann ich Ihnen helfen? Bitte wählen Sie:",
            fallback: "arztpraxis.frage",
            routes: [
              {
                intent: "rezept",
                label: "Rezept bestellen",
                workflow: "arztpraxis.rezept",
                keywords: ["rezept", "medikament", "tabletten", "verordnung", "nachbestell"],
              },
              {
                intent: "termin",
                label: "Termin anfragen",
                workflow: "arztpraxis.termin",
                keywords: ["termin", "vorsorge", "impfung", "untersuchung", "check up", "blutabnahme", "verschieben"],
              },
              {
                intent: "ueberweisung",
                label: "Überweisung anfragen",
                workflow: "arztpraxis.ueberweisung",
                keywords: ["überweisung", "facharzt", "fachärzt", "radiolog", "orthopäd", "kardiolog", "mrt"],
              },
              {
                intent: "au",
                label: "Krankschreibung (AU)",
                workflow: "arztpraxis.au",
                keywords: ["krankschreibung", "krankmeldung", "krankgeschrieben", "arbeitsunfähig", "au", "gelber schein"],
              },
              {
                intent: "befund",
                label: "Befund / Unterlagen",
                workflow: "arztpraxis.befund",
                keywords: ["befund", "laborwert", "blutwerte", "ergebnis", "arztbrief", "unterlagen", "röntgen"],
              },
              {
                intent: "frage",
                label: "Allgemeine Frage",
                workflow: "arztpraxis.frage",
                keywords: ["öffnungszeit", "geöffnet", "sprechzeit", "adresse", "anfahrt", "parken", "eine frage", "neue patient"],
              },
            ],
          },
        },
      ],
    },
    {
      id: "arztpraxis.notfall",
      name: "Möglicher Notfall",
      steps: [
        { id: "hinweis", block: "message.send", config: { text: EMERGENCY_NOTICE } },
        { id: "markieren", block: "case.update", config: { priority: "high", tags: ["notfall"] } },
        { id: "uebergabe", block: "team.handoff", config: { team: "Praxisteam", message: "" } },
      ],
    },
    {
      id: "arztpraxis.rezept",
      name: "Rezeptanfrage",
      steps: [
        {
          id: "daten",
          block: "form.ask",
          config: {
            fields: [
              NAME,
              BIRTHDATE,
              PHONE,
              {
                key: "medikament",
                label: "Medikament",
                type: "text",
                question: "Welches Medikament benötigen Sie (Name und Stärke, z. B. „Ramipril 5 mg“)?",
              },
              INSURANCE,
              {
                key: "rezeptart",
                label: "Rezeptart",
                type: "choice",
                options: ["E-Rezept auf die Versichertenkarte", "Papierrezept in der Praxis abholen"],
                question: "Wie möchten Sie das Rezept erhalten?",
              },
            ],
          },
        },
        { id: "zusammenfassung", block: "ai.summarize" },
        {
          id: "uebergabe",
          block: "team.handoff",
          config: {
            team: "Empfang",
            message:
              "Vielen Dank, {name}! Ihre Rezeptanfrage ist eingegangen. Das Praxisteam prüft sie und meldet sich bei Rückfragen unter {telefon}.",
          },
        },
      ],
    },
    {
      id: "arztpraxis.termin",
      name: "Terminanfrage",
      steps: [
        {
          id: "daten",
          block: "form.ask",
          config: {
            fields: [
              NAME,
              BIRTHDATE,
              PHONE,
              INSURANCE,
              {
                key: "bekannt",
                label: "Schon in Behandlung",
                type: "choice",
                options: ["ja", "nein"],
                question: "Waren Sie schon einmal bei uns in Behandlung?",
              },
              {
                key: "grund",
                label: "Grund",
                type: "text",
                question: "Worum geht es beim Termin (z. B. Vorsorge, Kontrolle, Impfung)?",
              },
              {
                key: "wunschzeit",
                label: "Wunschzeit",
                type: "text",
                question: "Wann passt es Ihnen am besten (Tage und Uhrzeiten)?",
              },
            ],
          },
        },
        { id: "zusammenfassung", block: "ai.summarize" },
        {
          id: "uebergabe",
          block: "team.handoff",
          config: {
            team: "Empfang",
            message: "Vielen Dank, {name}! Wir melden uns mit einem Terminvorschlag unter {telefon}.",
          },
        },
      ],
    },
    {
      id: "arztpraxis.ueberweisung",
      name: "Überweisung",
      steps: [
        {
          id: "daten",
          block: "form.ask",
          config: {
            fields: [
              NAME,
              BIRTHDATE,
              PHONE,
              INSURANCE,
              {
                key: "fachrichtung",
                label: "Fachrichtung",
                type: "text",
                question: "Für welche Fachrichtung brauchen Sie die Überweisung (z. B. Orthopädie, Radiologie)?",
              },
              {
                key: "anlass",
                label: "Anlass",
                type: "text",
                optional: true,
                question: "Möchten Sie kurz den Anlass nennen?",
              },
            ],
          },
        },
        { id: "zusammenfassung", block: "ai.summarize" },
        {
          id: "uebergabe",
          block: "team.handoff",
          config: {
            team: "Empfang",
            message:
              "Vielen Dank, {name}! Ihre Anfrage zur Überweisung ist eingegangen. Ob sie ausgestellt werden kann, entscheidet die Praxis nach ärztlicher Prüfung. Wir melden uns unter {telefon}.",
          },
        },
      ],
    },
    {
      id: "arztpraxis.au",
      name: "Krankschreibung (AU)",
      steps: [
        {
          id: "daten",
          block: "form.ask",
          config: {
            fields: [
              NAME,
              BIRTHDATE,
              PHONE,
              INSURANCE,
              {
                key: "seit",
                label: "Arbeitsunfähig seit",
                type: "date",
                question: "Seit wann sind Sie arbeitsunfähig (z. B. „heute“ oder TT.MM.JJJJ)?",
              },
              {
                key: "beschwerden",
                label: "Beschwerden",
                type: "text",
                question: "Bitte beschreiben Sie kurz Ihre Beschwerden.",
              },
            ],
          },
        },
        { id: "zusammenfassung", block: "ai.summarize" },
        {
          id: "uebergabe",
          block: "team.handoff",
          config: {
            team: "Praxisteam",
            message:
              "Vielen Dank, {name}! Ob eine Krankschreibung ohne Besuch in der Praxis möglich ist, entscheidet die Praxis nach ärztlicher Prüfung. Wir melden uns unter {telefon}.",
          },
        },
      ],
    },
    {
      id: "arztpraxis.befund",
      name: "Befund / Unterlagen",
      steps: [
        {
          id: "daten",
          block: "form.ask",
          config: {
            fields: [
              NAME,
              BIRTHDATE,
              PHONE,
              {
                key: "unterlagen",
                label: "Befund/Unterlagen",
                type: "text",
                question: "Um welchen Befund oder welche Unterlagen geht es?",
              },
            ],
          },
        },
        {
          id: "uebergabe",
          block: "team.handoff",
          config: {
            team: "Praxisteam",
            message:
              "Vielen Dank, {name}! Aus Datenschutzgründen besprechen wir Befunde nicht im Chat. Wir rufen Sie unter {telefon} zurück.",
          },
        },
      ],
    },
    {
      id: "arztpraxis.frage",
      name: "Allgemeine Frage",
      steps: [
        {
          id: "antwort",
          block: "ai.answer",
          config: {
            question: "Was möchten Sie wissen?",
            unanswered: "Das kann ich leider nicht direkt beantworten. Ich gebe Ihre Frage an das Praxisteam weiter.",
          },
        },
        { id: "daten", block: "form.ask", config: { fields: [NAME, PHONE] } },
        {
          id: "uebergabe",
          block: "team.handoff",
          config: { team: "Empfang", message: "Vielen Dank, {name}! Wir melden uns unter {telefon}." },
        },
      ],
    },
  ],
};
