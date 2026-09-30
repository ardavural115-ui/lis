import type { Block } from "../types.ts";
import { containsKeyword, normalize } from "../text.ts";
import { addTags, checkPriority, checkTags, hasStep, hasWorkflow, isText, isTextList } from "./util.ts";

export const checkKeywords: Block = {
  type: "logic.keywords",
  title: "Stichwörter prüfen",
  description:
    "Reagiert auf bestimmte Wörter, z. B. Notfall oder Beschwerde: Hinweis senden, Priorität setzen, " +
    "zu einem Schritt springen (goto) oder einen anderen Workflow starten (workflow). Gut geeignet als Wächter.",
  category: "logik",

  validate(config, ctx) {
    const errors = [...checkPriority(config.priority), ...checkTags(config.tags)];
    if (!isTextList(config.keywords)) errors.push("keywords fehlt");
    if (config.goto !== undefined && config.workflow !== undefined) errors.push("nur goto oder workflow angeben");
    if (config.goto !== undefined && !hasStep(ctx, config.goto)) errors.push(`Schritt ${String(config.goto)} gibt es nicht`);
    if (config.workflow !== undefined && !hasWorkflow(ctx, config.workflow)) {
      errors.push(`Workflow ${String(config.workflow)} gibt es nicht`);
    }
    return errors;
  },

  async run(ctx, config) {
    const keywords = config.keywords as string[];
    if (!keywords.some((k) => containsKeyword(ctx.input, k))) return { type: "next" };
    if (isText(config.message)) ctx.reply(ctx.fill(config.message));
    if (config.priority === "high" || config.priority === "normal") ctx.case.priority = config.priority;
    addTags(ctx.case, config.tags);
    if (isText(config.workflow)) return { type: "switch", workflow: config.workflow };
    return isText(config.goto) ? { type: "goto", step: config.goto } : { type: "next" };
  },
};

export const ifThen: Block = {
  type: "logic.if",
  title: "Wenn – dann",
  description:
    "Verzweigt nach einer Angabe, z. B. „wenn Budget = über 10.000 €, dann Priorität hoch“. " +
    "Ohne equals/contains wird geprüft, ob die Angabe ausgefüllt ist.",
  category: "logik",

  validate(config, ctx) {
    const errors: string[] = [];
    if (!isText(config.field)) errors.push("field fehlt");
    if (config.equals !== undefined && config.contains !== undefined) errors.push("nur equals oder contains angeben");
    if (!hasStep(ctx, config.then)) errors.push(`then-Schritt ${String(config.then)} gibt es nicht`);
    if (config.else !== undefined && !hasStep(ctx, config.else)) errors.push(`else-Schritt ${String(config.else)} gibt es nicht`);
    return errors;
  },

  async run(ctx, config) {
    const value = normalize(ctx.case.data[config.field as string] ?? "");
    let matches: boolean;
    if (typeof config.equals === "string") matches = value === normalize(config.equals);
    else if (typeof config.contains === "string") matches = value.includes(normalize(config.contains));
    else matches = value !== "";

    if (matches) return { type: "goto", step: config.then as string };
    return isText(config.else) ? { type: "goto", step: config.else } : { type: "next" };
  },
};
