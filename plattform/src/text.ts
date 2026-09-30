// Hilfsfunktionen für Texte: Vergleiche ohne Groß-/Kleinschreibung, Umlaute und Satzzeichen.

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Prüft, ob ein Stichwort im Text vorkommt.
 * Kurze Stichwörter (unter 5 Zeichen, z. B. „AU“) müssen als ganzes Wort vorkommen,
 * längere auch als Teil eines Wortes („rezept“ in „Folgerezept“).
 */
export function containsKeyword(text: string, keyword: string): boolean {
  const t = normalize(text);
  const k = normalize(keyword);
  if (!k) return false;
  if (k.length >= 5) return t.includes(k);
  return ` ${t} `.includes(` ${k} `);
}

const PLACEHOLDER = /\{([a-z0-9_.-]+)\}/gi;

/** Ersetzt {schluessel} durch Werte. Unbekannte Platzhalter bleiben stehen. */
export function fillPlaceholders(text: string, values: Record<string, string | undefined>): string {
  return text.replace(PLACEHOLDER, (match, key: string) => values[key] ?? match);
}

export function placeholdersIn(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((m) => m[1] as string);
}
