// Die Vorlagen je Branche und ihre Prüfung. Neue Vorlagen hier eintragen.

import type { Block, Industry, Step, Template, Tenant, Workflow } from "../types.ts";
import { placeholdersIn } from "../text.ts";
import { arztpraxis } from "./arztpraxis.ts";
import { freelancer } from "./freelancer.ts";
import { mittelstand } from "./mittelstand.ts";

export const templates: ReadonlyMap<Industry, Template> = new Map([
  [arztpraxis.id, arztpraxis],
  [freelancer.id, freelancer],
  [mittelstand.id, mittelstand],
]);

/** Prüft eine Vorlage: Workflows, Wächter, Schritte, Bausteine und deren Konfiguration. */
export function validateTemplate(template: Template, blocks: ReadonlyMap<string, Block>): string[] {
  const errors: string[] = [];
  const workflowIds = new Set<string>();
  for (const workflow of template.workflows) {
    if (workflowIds.has(workflow.id)) errors.push(`Workflow ${workflow.id} doppelt`);
    workflowIds.add(workflow.id);
    if (workflow.steps.length === 0) errors.push(`${workflow.id}: keine Schritte`);
  }
  if (!workflowIds.has(template.entry)) errors.push(`Einstiegs-Workflow ${template.entry} fehlt`);

  for (const workflow of [...template.workflows, guardsOf(template)]) {
    const stepIds = new Set<string>();
    for (const step of workflow.steps) {
      const where = `${workflow.id}/${step.id}`;
      if (stepIds.has(step.id)) errors.push(`${where}: Schritt doppelt`);
      stepIds.add(step.id);
      const block = blocks.get(step.block);
      if (!block) {
        errors.push(`${where}: unbekannter Baustein ${step.block}`);
        continue;
      }
      for (const error of block.validate(step.config ?? {}, { template, workflow })) errors.push(`${where}: ${error}`);
    }
  }
  return errors;
}

/** Die Wächter als Pseudo-Workflow, damit sie wie normale Schritte geprüft werden können. */
function guardsOf(template: Template): Workflow {
  return { id: "wächter", name: "Wächter", steps: template.guards ?? [] };
}

/**
 * Prüft, ob ein Betrieb zur Vorlage passt:
 * - jeder Platzhalter in Texten hat einen Wert (Info des Betriebs oder abgefragtes Feld)
 * - kein Info-Schlüssel heißt wie ein Feld (sonst überdeckt z. B. die Kundennummer die Firmennummer)
 */
export function checkTenant(template: Template, tenant: Tenant): string[] {
  const fieldKeys = new Set(template.workflows.flatMap((w) => w.steps.flatMap(fieldKeysOf)));
  const known = new Set(["betrieb", ...Object.keys(tenant.info), ...fieldKeys]);
  const texts = [
    tenant.greeting,
    ...tenant.faq.map((e) => e.answer),
    ...[...template.workflows, guardsOf(template)].flatMap((w) => w.steps.flatMap((s) => textsIn(s.config))),
  ];
  const missing = [...new Set(texts.flatMap(placeholdersIn))].filter((key) => !known.has(key)).sort();
  const conflicts = Object.keys(tenant.info).filter((key) => fieldKeys.has(key)).sort();
  return [
    ...missing.map((key) => `Platzhalter {${key}} hat keinen Wert, bitte in "info" ergänzen`),
    ...conflicts.map((key) => `Info-Schlüssel "${key}" heißt wie ein Feld, bitte umbenennen`),
  ];
}

/** Die Auswahl des Einstiegs, z. B. für Schnellantwort-Knöpfe im Chat. */
export function quickReplies(template: Template): string[] {
  const entry = template.workflows.find((w) => w.id === template.entry);
  const route = entry?.steps.find((s) => s.block === "ai.route");
  const routes = route?.config?.routes;
  return Array.isArray(routes) ? routes.map((r: { label: string }) => r.label) : [];
}

function fieldKeysOf(step: Step): string[] {
  const fields = step.config?.fields;
  return Array.isArray(fields) ? fields.map((f: { key: string }) => f.key) : [];
}

function textsIn(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(textsIn);
  if (value && typeof value === "object") return Object.values(value).flatMap(textsIn);
  return [];
}
