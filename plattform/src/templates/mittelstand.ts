// Vorlage Mittelstand: Service & Reklamation, Angebote, Rückrufe, Bewerbungen, FAQ.

import type { Template } from "../types.ts";
import { COMPANY, EMAIL, NAME, PHONE } from "./fields.ts";

export const mittelstand: Template = {
  id: "mittelstand",
  name: "Mittelstand",
  description: "Kundenservice und Vertrieb: Reklamationen, Angebotsanfragen, Rückrufe, Bewerbungen und häufige Fragen.",
  entry: "mittelstand.eingang",
  // Eskalationswörter erhöhen die Priorität, egal in welcher Nachricht sie stehen
  guards: [
    {
      id: "eskalation",
      block: "logic.keywords",
      config: {
        keywords: ["beschwerde", "reklamation", "kündigung", "kündigen", "anwalt", "stillstand", "ausfall", "dringend"],
        priority: "high",
        tags: ["dringend"],
      },
    },
  ],
  workflows: [
    {
      id: "mittelstand.eingang",
      name: "Neue Anfrage",
      steps: [
        {
          id: "anliegen",
          block: "ai.route",
          config: {
            question: "Wie können wir helfen? Bitte wählen Sie:",
            fallback: "mittelstand.frage",
            routes: [
              {
                intent: "support",
                label: "Service & Reklamation",
                workflow: "mittelstand.support",
                keywords: ["support", "service", "störung", "fehler", "defekt", "kaputt", "reklamation", "ersatzteil", "wartung", "funktioniert nicht"],
              },
              {
                intent: "angebot",
                label: "Angebot & Bestellung",
                workflow: "mittelstand.angebot",
                keywords: ["angebot", "bestellen", "bestellung", "kaufen", "preisliste", "lieferung", "konditionen"],
              },
              {
                intent: "rueckruf",
                label: "Rückruf vereinbaren",
                workflow: "mittelstand.rueckruf",
                keywords: ["rückruf", "zurückrufen", "rufen sie", "anrufen", "telefonat"],
              },
              {
                intent: "bewerbung",
                label: "Bewerbung & Jobs",
                workflow: "mittelstand.bewerbung",
                keywords: ["bewerbung", "bewerben", "job", "jobs", "ausbildung", "praktikum", "karriere", "offene stelle"],
              },
              {
                intent: "frage",
                label: "Allgemeine Frage",
                workflow: "mittelstand.frage",
                keywords: ["eine frage", "kurze frage", "servicezeit", "öffnungszeit", "adresse", "anfahrt", "erreichbar"],
              },
            ],
          },
        },
      ],
    },
    {
      id: "mittelstand.support",
      name: "Service & Reklamation",
      steps: [
        {
          id: "daten",
          block: "form.ask",
          config: {
            fields: [
              COMPANY,
              NAME,
              EMAIL,
              {
                key: "kundennummer",
                label: "Kundennummer",
                type: "text",
                optional: true,
                question: "Haben Sie eine Kundennummer?",
              },
              {
                key: "produkt",
                label: "Produkt",
                type: "text",
                question: "Um welches Produkt oder welche Maschine geht es?",
              },
              { key: "problem", label: "Problem", type: "text", question: "Bitte beschreiben Sie das Problem." },
            ],
          },
        },
        { id: "zusammenfassung", block: "ai.summarize" },
        {
          id: "uebergabe",
          block: "team.handoff",
          config: {
            team: "Kundenservice",
            message:
              "Danke, {name}! Ihr Anliegen ist als Service-Vorgang angelegt. Unser Kundenservice meldet sich während der Servicezeiten ({servicezeiten}).",
          },
        },
      ],
    },
    {
      id: "mittelstand.angebot",
      name: "Angebot & Bestellung",
      steps: [
        {
          id: "daten",
          block: "form.ask",
          config: {
            fields: [
              COMPANY,
              NAME,
              EMAIL,
              {
                key: "leistung",
                label: "Produkt/Leistung",
                type: "text",
                question: "Welches Produkt oder welche Leistung interessiert Sie?",
              },
              { key: "menge", label: "Menge", type: "text", question: "Welche Menge bzw. welchen Umfang benötigen Sie?" },
              { key: "liefertermin", label: "Gewünschter Termin", type: "text", question: "Bis wann benötigen Sie es?" },
            ],
          },
        },
        { id: "zusammenfassung", block: "ai.summarize" },
        {
          id: "uebergabe",
          block: "team.handoff",
          config: {
            team: "Vertrieb",
            message: "Danke, {name}! Unser Vertrieb erstellt Ihnen ein Angebot und meldet sich per E-Mail.",
          },
        },
      ],
    },
    {
      id: "mittelstand.rueckruf",
      name: "Rückruf",
      steps: [
        {
          id: "daten",
          block: "form.ask",
          config: {
            fields: [
              NAME,
              PHONE,
              {
                key: "zeitfenster",
                label: "Zeitfenster",
                type: "choice",
                options: ["vormittags", "nachmittags", "egal"],
                question: "Wann dürfen wir Sie anrufen?",
              },
              { key: "thema", label: "Thema", type: "text", question: "Worum soll es im Gespräch gehen?" },
            ],
          },
        },
        {
          id: "uebergabe",
          block: "team.handoff",
          config: {
            team: "Zentrale",
            message: "Danke, {name}! Wir rufen Sie unter {telefon} zurück (gewünscht: {zeitfenster}).",
          },
        },
      ],
    },
    {
      id: "mittelstand.bewerbung",
      name: "Bewerbung",
      steps: [
        {
          id: "daten",
          block: "form.ask",
          config: {
            fields: [
              NAME,
              EMAIL,
              { key: "stelle", label: "Stelle", type: "text", question: "Für welche Stelle interessieren Sie sich?" },
            ],
          },
        },
        {
          id: "unterlagen",
          block: "message.send",
          config: { text: "Bitte senden Sie Ihre Unterlagen (Lebenslauf, Zeugnisse) an {bewerbungsmail}." },
        },
        {
          id: "uebergabe",
          block: "team.handoff",
          config: { team: "Personal", message: "Danke, {name}! Ihr Interesse ist bei unserem Personalteam angekommen." },
        },
      ],
    },
    {
      id: "mittelstand.frage",
      name: "Allgemeine Frage",
      steps: [
        {
          id: "antwort",
          block: "ai.answer",
          config: {
            question: "Was möchten Sie wissen?",
            unanswered: "Das kann ich leider nicht direkt beantworten. Ich leite Ihre Frage weiter.",
          },
        },
        { id: "daten", block: "form.ask", config: { fields: [NAME, EMAIL] } },
        {
          id: "uebergabe",
          block: "team.handoff",
          config: { team: "Zentrale", message: "Danke, {name}! Wir melden uns per E-Mail bei Ihnen." },
        },
      ],
    },
  ],
};
