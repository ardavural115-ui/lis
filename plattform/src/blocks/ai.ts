import type { Block } from "../types.ts";
import { matchOption } from "../fields.ts";
import { hasWorkflow, isText } from "./util.ts";

interface Route {
  intent: string;
  label: string;
  workflow: string;
  /** Stichworte für die regelbasierte Erkennung. */
  keywords?: string[];
}

export const routeRequest: Block = {
  type: "ai.route",
  title: "Anliegen erkennen",
  description:
    "Erkennt, worum es geht, und startet den passenden Workflow. Ist es unklar, bietet er eine Auswahl an.",
  category: "ki",

  validate(config, ctx) {
    const routes = config.routes as Route[] | undefined;
    if (!Array.isArray(routes) || routes.length === 0) return ["routes fehlt"];
    const errors: string[] = [];
    for (const r of routes) {
      if (!isText(r.intent) || !isText(r.label)) errors.push("Jede Route braucht intent und label");
      if (!hasWorkflow(ctx, r.workflow)) errors.push(`Workflow ${r.workflow} gibt es nicht`);
    }
    if (!hasWorkflow(ctx, config.fallback)) errors.push(`fallback-Workflow ${String(config.fallback)} gibt es nicht`);
    return errors;
  },

  async run(ctx, config) {
    const routes = config.routes as Route[];
    const options = routes.map((r) => ({ id: r.intent, label: r.label, keywords: r.keywords ?? [] }));
    const state = ctx.state as { asked?: boolean };
    const text = ctx.input.trim();

    // Auswahl aus dem Menü oder per Schnellantwort-Knopf („2“ oder „Termin anfragen“)
    if (text && (state.asked || text.length <= 30)) {
      const label = matchOption(text, routes.map((r) => r.label));
      const picked = routes.find((r) => r.label === label);
      if (picked) return { type: "switch", workflow: picked.workflow, consumeInput: true };
    }

    const intent = text ? await ctx.ai.classify(text, options) : null;
    const recognized = routes.find((r) => r.intent === intent);
    if (recognized) return { type: "switch", workflow: recognized.workflow };

    // Nach der Auswahl immer noch unklar: an den Rückfall-Workflow (meist „Allgemeine Frage“)
    if (ctx.resumed && state.asked) return { type: "switch", workflow: config.fallback as string };

    state.asked = true;
    const menu = routes.map((r, i) => `${i + 1}) ${r.label}`).join("\n");
    const question = (config.question as string | undefined) ?? "Wobei kann ich helfen? Bitte wählen Sie:";
    ctx.reply(`${ctx.fill(question)}\n${menu}`);
    return { type: "wait" };
  },
};

export const answerQuestion: Block = {
  type: "ai.answer",
  title: "Frage beantworten",
  description:
    "Beantwortet häufige Fragen aus dem hinterlegten Wissen (FAQ). Kann er es nicht, geht es mit dem nächsten Schritt weiter, z. B. der Übergabe ans Team.",
  category: "ki",

  validate: (config) =>
    config.question === undefined || isText(config.question) ? [] : ["question muss ein Text sein"],

  async run(ctx, config) {
    const question = ctx.input.trim();
    if (!question) {
      ctx.reply(ctx.fill((config.question as string | undefined) ?? "Was möchten Sie wissen?"));
      return { type: "wait" };
    }
    const faq = ctx.tenant.faq.map((e) => ({ ...e, answer: ctx.fill(e.answer) }));
    const answer = await ctx.ai.answer(question, faq, ctx.tenant);
    if (answer) {
      ctx.reply(answer);
      return { type: "end" };
    }
    if (isText(config.unanswered)) ctx.reply(ctx.fill(config.unanswered));
    return { type: "next" };
  },
};

export const summarizeCase: Block = {
  type: "ai.summarize",
  title: "Zusammenfassen",
  description: "Schreibt eine kurze Zusammenfassung des Vorgangs für das Team.",
  category: "ki",

  validate: () => [],

  async run(ctx) {
    ctx.case.summary = await ctx.ai.summarize(ctx.case);
    return { type: "next" };
  },
};
