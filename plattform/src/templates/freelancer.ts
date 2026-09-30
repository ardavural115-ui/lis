// Vorlage Freelancer: Projektanfragen qualifizieren, Erstgespräche, Rechnungsfragen, FAQ.

import type { Template } from "../types.ts";
import { EMAIL, NAME } from "./fields.ts";

export const freelancer: Template = {
  id: "freelancer",
  name: "Freelancer",
  description: "Projektanfragen vorqualifizieren, Erstgespräche vereinbaren, Rechnungsfragen und häufige Fragen.",
  entry: "freelancer.eingang",
  workflows: [
    {
      id: "freelancer.eingang",
      name: "Neue Anfrage",
      steps: [
        {
          id: "anliegen",
          block: "ai.route",
          config: {
            question: "Worum geht es? Bitte wählen Sie:",
            fallback: "freelancer.frage",
            routes: [
              {
                intent: "projekt",
                label: "Projekt anfragen",
                workflow: "freelancer.projekt",
                keywords: ["projekt", "angebot", "auftrag", "website", "webseite", "onlineshop", "logo", "design", "entwicklung", "zusammenarbeit"],
              },
              {
                intent: "erstgespraech",
                label: "Erstgespräch vereinbaren",
                workflow: "freelancer.erstgespraech",
                keywords: ["erstgespräch", "termin", "telefonat", "call", "kennenlernen", "meeting"],
              },
              {
                intent: "rechnung",
                label: "Rechnung & Zahlung",
                workflow: "freelancer.rechnung",
                keywords: ["rechnung", "zahlung", "bezahlt", "mahnung", "gutschrift"],
              },
              {
                intent: "frage",
                label: "Allgemeine Frage",
                workflow: "freelancer.frage",
                keywords: ["eine frage", "kurze frage", "kostet", "preis", "stundensatz", "referenzen", "portfolio", "erreichbar"],
              },
            ],
          },
        },
      ],
    },
    {
      id: "freelancer.projekt",
      name: "Projektanfrage",
      steps: [
        {
          id: "daten",
          block: "form.ask",
          config: {
            fields: [
              NAME,
              EMAIL,
              {
                key: "projekt",
                label: "Projekt",
                type: "text",
                question: "Worum geht es in Ihrem Projekt? Ein, zwei Sätze reichen.",
              },
              {
                key: "budget",
                label: "Budget",
                type: "choice",
                options: ["unter 2.000 €", "2.000 bis 10.000 €", "über 10.000 €", "noch offen"],
                question: "Welches Budget ist eingeplant?",
              },
              {
                key: "zeitrahmen",
                label: "Zeitrahmen",
                type: "text",
                question: "Bis wann soll das Projekt fertig sein?",
              },
            ],
          },
        },
        { id: "zusammenfassung", block: "ai.summarize" },
        {
          id: "budget-pruefen",
          block: "logic.if",
          config: { field: "budget", equals: "über 10.000 €", then: "grossprojekt", else: "uebergabe" },
        },
        { id: "grossprojekt", block: "case.update", config: { priority: "high", tags: ["großprojekt"] } },
        {
          id: "uebergabe",
          block: "team.handoff",
          config: {
            team: "Inhaber",
            message: "Danke, {name}! Ich melde mich innerhalb von {antwortzeit} per E-Mail bei Ihnen.",
          },
        },
      ],
    },
    {
      id: "freelancer.erstgespraech",
      name: "Erstgespräch",
      steps: [
        {
          id: "daten",
          block: "form.ask",
          config: {
            fields: [
              NAME,
              EMAIL,
              { key: "thema", label: "Thema", type: "text", question: "Worüber möchten Sie sprechen?" },
              {
                key: "wunschtermine",
                label: "Wunschtermine",
                type: "text",
                question: "Welche Tage und Uhrzeiten passen Ihnen?",
              },
            ],
          },
        },
        {
          id: "buchungslink",
          block: "message.send",
          config: { text: "Wenn es schneller gehen soll, können Sie auch direkt einen Termin buchen: {buchungslink}" },
        },
        {
          id: "uebergabe",
          block: "team.handoff",
          config: { team: "Inhaber", message: "Danke, {name}! Ich bestätige Ihnen den Termin per E-Mail." },
        },
      ],
    },
    {
      id: "freelancer.rechnung",
      name: "Rechnung & Zahlung",
      steps: [
        {
          id: "daten",
          block: "form.ask",
          config: {
            fields: [
              NAME,
              EMAIL,
              {
                key: "rechnungsnummer",
                label: "Rechnungsnummer",
                type: "text",
                optional: true,
                question: "Wie lautet die Rechnungsnummer?",
              },
              { key: "anliegen", label: "Anliegen", type: "text", question: "Worum geht es genau?" },
            ],
          },
        },
        {
          id: "uebergabe",
          block: "team.handoff",
          config: { team: "Inhaber", message: "Danke, {name}! Ich kümmere mich darum und melde mich per E-Mail." },
        },
      ],
    },
    {
      id: "freelancer.frage",
      name: "Allgemeine Frage",
      steps: [
        {
          id: "antwort",
          block: "ai.answer",
          config: {
            question: "Was möchten Sie wissen?",
            unanswered: "Das beantworte ich Ihnen lieber persönlich.",
          },
        },
        { id: "daten", block: "form.ask", config: { fields: [NAME, EMAIL] } },
        {
          id: "uebergabe",
          block: "team.handoff",
          config: {
            team: "Inhaber",
            message: "Danke, {name}! Ich melde mich innerhalb von {antwortzeit} per E-Mail.",
          },
        },
      ],
    },
  ],
};
