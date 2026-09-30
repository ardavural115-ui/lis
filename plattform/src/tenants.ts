// Betriebe laden (je Betrieb eine JSON-Datei im Ordner tenants/) und Team-Zugänge festlegen.

import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Tenant } from "./types.ts";

const INDUSTRIES = new Set(["arztpraxis", "freelancer", "mittelstand"]);

export function loadTenants(dir: string): Map<string, Tenant> {
  const tenants = new Map<string, Tenant>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const tenant = JSON.parse(readFileSync(join(dir, file), "utf8")) as Tenant;
    const problems = checkShape(tenant);
    if (problems.length > 0) throw new Error(`${file}: ${problems.join("; ")}`);
    if (tenants.has(tenant.id)) throw new Error(`${file}: Betrieb ${tenant.id} doppelt`);
    tenants.set(tenant.id, tenant);
  }
  return tenants;
}

function checkShape(t: Partial<Tenant>): string[] {
  const errors: string[] = [];
  if (typeof t.id !== "string" || !/^[a-z0-9-]{2,40}$/.test(t.id)) errors.push("id fehlt (erlaubt: a-z, 0-9, -)");
  if (typeof t.name !== "string" || !t.name.trim()) errors.push("name fehlt");
  if (!INDUSTRIES.has(t.industry ?? "")) errors.push("industry muss arztpraxis, freelancer oder mittelstand sein");
  if (typeof t.greeting !== "string" || !t.greeting.trim()) errors.push("greeting fehlt");
  if (t.ai !== undefined && t.ai !== "claude" && t.ai !== "rules") errors.push('ai muss "claude" oder "rules" sein');
  if (t.retentionDays !== undefined && !(Number.isInteger(t.retentionDays) && t.retentionDays > 0)) {
    errors.push("retentionDays muss eine positive ganze Zahl sein");
  }
  if (!t.info || typeof t.info !== "object" || Array.isArray(t.info)) errors.push("info fehlt");
  if (!Array.isArray(t.faq)) errors.push("faq fehlt");
  return errors;
}

export const DEFAULT_RETENTION_DAYS = 30;

/** Name der Umgebungsvariable für den Team-Zugang, z. B. LIS_TEAM_TOKEN_PRAXIS_DEMO. */
export function tokenVariable(tenantId: string): string {
  return `LIS_TEAM_TOKEN_${tenantId.toUpperCase().replace(/-/g, "_")}`;
}

/** Team-Zugänge aus der Umgebung; fehlt einer, wird ein zufälliger erzeugt (nur bis zum Neustart gültig). */
export function resolveTeamTokens(tenants: ReadonlyMap<string, Tenant>, env: NodeJS.ProcessEnv) {
  const tokens = new Map<string, string>();
  const generated = new Map<string, string>();
  for (const id of tenants.keys()) {
    const fromEnv = env[tokenVariable(id)];
    if (fromEnv && fromEnv.length >= 16) {
      tokens.set(id, fromEnv);
    } else {
      const token = randomBytes(18).toString("base64url");
      tokens.set(id, token);
      generated.set(id, token);
    }
  }
  return { tokens, generated };
}
