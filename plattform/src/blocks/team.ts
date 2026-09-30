import type { Block } from "../types.ts";
import { addTags, checkPriority, checkTags, isText } from "./util.ts";

export const updateCase: Block = {
  type: "case.update",
  title: "Vorgang markieren",
  description: "Setzt Titel, Priorität, Schlagwörter oder das zuständige Team.",
  category: "team",

  validate: (config) => [...checkPriority(config.priority), ...checkTags(config.tags)],

  async run(ctx, config) {
    if (isText(config.title)) ctx.case.title = ctx.fill(config.title);
    if (config.priority === "high" || config.priority === "normal") ctx.case.priority = config.priority;
    if (isText(config.team)) ctx.case.team = config.team;
    addTags(ctx.case, config.tags);
    return { type: "next" };
  },
};

const DEFAULT_CONFIRMATION = "Vielen Dank! Ihr Anliegen ist bei uns eingegangen. Wir melden uns bei Ihnen.";

export const handOff: Block = {
  type: "team.handoff",
  title: "An Team übergeben",
  description:
    "Übergibt den Vorgang mit allen Angaben an das Team und bestätigt dem Kunden den Eingang. " +
    'Mit message: "" wird keine Bestätigung gesendet.',
  category: "team",

  validate: (config) =>
    config.message === undefined || typeof config.message === "string" ? [] : ["message muss ein Text sein"],

  async run(ctx, config) {
    if (isText(config.team)) ctx.case.team = config.team;
    const message = (config.message as string | undefined) ?? DEFAULT_CONFIRMATION;
    if (message) ctx.reply(ctx.fill(message));
    return { type: "handoff" };
  },
};
