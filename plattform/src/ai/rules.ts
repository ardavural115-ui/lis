// Regelbasierte "KI": Stichwörter statt Sprachmodell. Läuft komplett offline,
// es verlassen keine Daten den Server. Rückfallebene für Claude und Grundlage der Tests.

import type { AiProvider, FaqEntry } from "../types.ts";
import { containsKeyword } from "../text.ts";
import { parseValue } from "../fields.ts";

export const rulesProvider: AiProvider = {
  name: "rules",

  async classify(text, options) {
    let best: string | null = null;
    let bestScore = 0;
    let tie = false;
    for (const option of options) {
      const score = option.keywords.filter((k) => containsKeyword(text, k)).length;
      if (score > bestScore) {
        best = option.id;
        bestScore = score;
        tie = false;
      } else if (score > 0 && score === bestScore) {
        tie = true;
      }
    }
    return tie ? null : best;
  },

  // Ohne Sprachmodell übernehmen wir nur Eindeutiges: E-Mail-Adressen.
  async extract(text, fields, now) {
    const email = fields.find((f) => f.type === "email");
    const value = email ? parseValue(email, text, now) : null;
    return email && value ? { [email.key]: value } : {};
  },

  async answer(question, faq) {
    let best: FaqEntry | null = null;
    let bestScore = 0;
    for (const entry of faq) {
      const score = entry.keywords.filter((k) => containsKeyword(question, k)).length;
      if (score > bestScore) {
        best = entry;
        bestScore = score;
      }
    }
    return best?.answer ?? null;
  },

  async summarize(c) {
    const details = Object.entries(c.data)
      .filter(([, value]) => value)
      .map(([key, value]) => `${c.labels[key] ?? key}: ${value}`);
    return [c.title, ...details].join(" · ");
  },
};
