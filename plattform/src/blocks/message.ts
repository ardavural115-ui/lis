import type { Block } from "../types.ts";
import { isText } from "./util.ts";

export const sendMessage: Block = {
  type: "message.send",
  title: "Nachricht senden",
  description: "Schickt dem Kunden einen festen Text. Platzhalter wie {name} werden ersetzt.",
  category: "kommunikation",

  validate: (config) => (isText(config.text) ? [] : ["text fehlt"]),

  async run(ctx, config) {
    ctx.reply(ctx.fill(config.text as string));
    return { type: "next" };
  },
};
