// Kleine Helfer für Bausteine: Konfiguration prüfen, Schlagwörter setzen.

import type { Case, ValidationContext } from "../types.ts";

export function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

export function isTextList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(isText);
}

export function hasStep(ctx: ValidationContext, id: unknown): boolean {
  return ctx.workflow.steps.some((s) => s.id === id);
}

export function hasWorkflow(ctx: ValidationContext, id: unknown): boolean {
  return ctx.template.workflows.some((w) => w.id === id);
}

export function checkPriority(value: unknown): string[] {
  return value === undefined || value === "high" || value === "normal" ? [] : ["priority muss high oder normal sein"];
}

export function checkTags(value: unknown): string[] {
  return value === undefined || isTextList(value) ? [] : ["tags muss eine Liste von Texten sein"];
}

export function addTags(c: Case, tags: unknown): void {
  if (!Array.isArray(tags)) return;
  for (const tag of tags) if (typeof tag === "string" && !c.tags.includes(tag)) c.tags.push(tag);
}
