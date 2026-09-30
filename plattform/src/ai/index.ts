// Auswahl der KI pro Betrieb und Rückfall auf Regeln, wenn Claude nicht erreichbar ist.

import type { AiMode, AiProvider, Tenant } from "../types.ts";
import { createClaudeProvider } from "./claude.ts";
import { rulesProvider } from "./rules.ts";

type Warn = (message: string) => void;

/** Nutzt die Haupt-KI und fällt bei Fehlern (Netz, Ablehnung, Limit) auf die Ersatz-KI zurück. */
export function withFallback(primary: AiProvider, fallback: AiProvider, warn: Warn = console.warn): AiProvider {
  async function attempt<T>(task: string, run: () => Promise<T>, backup: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      warn(`KI ${primary.name} fehlgeschlagen (${task}), nutze ${fallback.name}: ${describe(error)}`);
      return backup();
    }
  }
  return {
    name: primary.name,
    classify: (text, options) =>
      attempt("classify", () => primary.classify(text, options), () => fallback.classify(text, options)),
    extract: (text, fields, now) =>
      attempt("extract", () => primary.extract(text, fields, now), () => fallback.extract(text, fields, now)),
    answer: (question, faq, tenant) =>
      attempt("answer", () => primary.answer(question, faq, tenant), () => fallback.answer(question, faq, tenant)),
    summarize: (c) => attempt("summarize", () => primary.summarize(c), () => fallback.summarize(c)),
  };
}

// Keine Kundentexte ins Log: JSON-Fehlermeldungen können Teile der Antwort enthalten.
function describe(error: unknown): string {
  if (error instanceof SyntaxError) return "Antwort war kein gültiges JSON";
  if (error instanceof Error) return error.message.slice(0, 200);
  return "unbekannter Fehler";
}

/** Standard-KI: LIS_KI ("claude" | "rules"), sonst Claude, wenn ANTHROPIC_API_KEY gesetzt ist. */
export function defaultAiMode(env: NodeJS.ProcessEnv): AiMode {
  if (env.LIS_KI === "claude" || env.LIS_KI === "rules") return env.LIS_KI;
  return env.ANTHROPIC_API_KEY ? "claude" : "rules";
}

/** Wählt die KI pro Betrieb: Einstellung im Betrieb, sonst der Standard. */
export function createAiResolver(env: NodeJS.ProcessEnv = process.env, warn: Warn = console.warn) {
  const standard = defaultAiMode(env);
  let claude: AiProvider | undefined;
  return (tenant: Tenant): AiProvider => {
    if ((tenant.ai ?? standard) === "rules") return rulesProvider;
    if (!claude) {
      try {
        claude = withFallback(
          createClaudeProvider({ model: env.LIS_KI_MODELL, apiKey: env.ANTHROPIC_API_KEY }),
          rulesProvider,
          warn,
        );
      } catch (error) {
        warn(`Claude nicht verfügbar, nutze Regeln: ${describe(error)}`);
        claude = rulesProvider;
      }
    }
    return claude;
  };
}
