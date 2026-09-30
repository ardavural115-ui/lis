import type { Block, BlockContext, FieldSpec } from "../types.ts";
import { invalidHint, isSkip, parseValue } from "../fields.ts";
import { isText } from "./util.ts";

export interface FormField extends FieldSpec {
  question: string;
  /** Kann mit „-“ übersprungen werden. */
  optional?: boolean;
}

interface FormState {
  /** Feld, dessen Frage gerade offen ist. */
  asking?: string;
  skipped?: string[];
}

const FIELD_TYPES = new Set(["text", "email", "phone", "date", "choice"]);

export const askForData: Block = {
  type: "form.ask",
  title: "Daten abfragen",
  description:
    "Fragt Angaben nacheinander ab und prüft sie (Text, E-Mail, Telefon, Datum, Auswahl). " +
    "Was der Kunde schon genannt hat, wird übernommen statt erneut gefragt.",
  category: "kommunikation",

  validate(config) {
    if (!Array.isArray(config.fields) || config.fields.length === 0) return ["fields fehlt"];
    const errors: string[] = [];
    const keys = new Set<string>();
    for (const f of config.fields as Partial<FormField>[]) {
      const name = f.key ?? "?";
      if (!isText(f.key) || !isText(f.label) || !isText(f.question)) {
        errors.push(`Feld ${name}: key, label und question sind Pflicht`);
      }
      if (!FIELD_TYPES.has(f.type ?? "")) errors.push(`Feld ${name}: unbekannter Typ ${String(f.type)}`);
      if (f.type === "choice" && (!Array.isArray(f.options) || f.options.length < 2)) {
        errors.push(`Feld ${name}: Auswahl braucht mindestens zwei options`);
      }
      if (f.key && keys.has(f.key)) errors.push(`Feld ${name} doppelt`);
      if (f.key) keys.add(f.key);
    }
    return errors;
  },

  async run(ctx, config) {
    const fields = config.fields as FormField[];
    const state = ctx.state as FormState;
    const data = ctx.case.data;
    const skipped = new Set(state.skipped ?? []);
    const open = () => fields.filter((f) => !data[f.key] && !skipped.has(f.key));

    for (const f of fields) ctx.case.labels[f.key] = f.label;

    const current = ctx.resumed ? fields.find((f) => f.key === state.asking) : undefined;
    if (current) {
      // Antwort auf die zuletzt gestellte Frage
      const answer = ctx.input.trim();
      if (current.optional && isSkip(answer)) {
        skipped.add(current.key);
        data[current.key] = "";
      } else {
        // „Max Muster, 12.03.1980“: mehrere Angaben auf einmal übernehmen
        if (looksLikeSeveralDetails(answer)) await takeOver(ctx, open(), answer);
        if (!data[current.key]) {
          const value = parseValue(current, answer, ctx.now());
          if (value === null) {
            ctx.reply(`${invalidHint(current)} ${question(current)}`);
            return { type: "wait" };
          }
          data[current.key] = value;
        }
      }
    } else if (ctx.input.trim().length >= 12) {
      // Erster Aufruf: schon genannte Angaben übernehmen („Rezept für Ramipril 5 mg“)
      await takeOver(ctx, open(), ctx.input);
    }

    const next = open()[0];
    if (!next) return { type: "next" };
    state.asking = next.key;
    state.skipped = [...skipped];
    ctx.reply(question(next));
    return { type: "wait" };
  },
};

/** Übernimmt Angaben, die die KI erkannt hat, aber nur wenn sie die Prüfung bestehen. */
async function takeOver(ctx: BlockContext, fields: FormField[], text: string): Promise<void> {
  if (fields.length === 0) return;
  const found = await ctx.ai.extract(text, fields, ctx.now());
  for (const f of fields) {
    const raw = found[f.key];
    const value = raw ? parseValue(f, raw, ctx.now()) : null;
    if (value) ctx.case.data[f.key] = value;
  }
}

function looksLikeSeveralDetails(answer: string): boolean {
  return /[,;\n]/.test(answer) || answer.split(/\s+/).length >= 6;
}

function question(f: FormField): string {
  let text = f.question;
  if (f.optional) text += " (optional, mit „-“ überspringen)";
  if (f.type === "choice" && f.options) text += "\n" + f.options.map((o, i) => `${i + 1}) ${o}`).join("\n");
  return text;
}
