// Der Baustein-Katalog („App-Store“). Neue Bausteine hier eintragen.

import type { Block } from "../types.ts";
import { answerQuestion, routeRequest, summarizeCase } from "./ai.ts";
import { askForData } from "./form.ts";
import { checkKeywords, ifThen } from "./logic.ts";
import { sendMessage } from "./message.ts";
import { handOff, updateCase } from "./team.ts";

export const blocks: readonly Block[] = [
  sendMessage,
  askForData,
  routeRequest,
  answerQuestion,
  summarizeCase,
  checkKeywords,
  ifThen,
  updateCase,
  handOff,
];

export const blockRegistry: ReadonlyMap<string, Block> = new Map(blocks.map((b) => [b.type, b]));
