import { join } from "node:path";
import { rulesProvider } from "../src/ai/rules.ts";
import { blockRegistry } from "../src/blocks/index.ts";
import { createEngine } from "../src/engine.ts";
import { createStore } from "../src/store.ts";
import { templates } from "../src/templates/index.ts";
import { loadTenants } from "../src/tenants.ts";
import type { AiProvider, Block, Tenant } from "../src/types.ts";

export const tenants = loadTenants(join(import.meta.dirname, "..", "tenants"));
export const praxis = tenants.get("praxis-demo")!;
export const freelancer = tenants.get("freelancer-demo")!;
export const mittelstand = tenants.get("mittelstand-demo")!;

/** Fester Zeitpunkt: 30.09.2026, 10:00 Uhr Ortszeit. */
export const NOW = new Date(2026, 8, 30, 10, 0, 0);

export function setup(options: { ai?: AiProvider; blocks?: ReadonlyMap<string, Block> } = {}) {
  const store = createStore();
  const logs: string[] = [];
  let counter = 0;
  let tick = 0;
  const engine = createEngine({
    templates,
    blocks: options.blocks ?? blockRegistry,
    store,
    aiFor: () => options.ai ?? rulesProvider,
    // Jeder Aufruf eine Sekunde später, damit „neuester Vorgang“ eindeutig ist
    now: () => new Date(NOW.getTime() + tick++ * 1000),
    newId: () => `vorgang-${++counter}`,
    log: (message) => logs.push(message),
  });

  /** Schickt eine Kundennachricht und liefert die Antworten des Bots. */
  async function chat(tenant: Tenant, text: string, contact = "sitzung-1"): Promise<string[]> {
    return (await engine.handleMessage({ tenant, channel: "web", contact, text })).replies;
  }

  /** Der aktuelle (neueste) Vorgang eines Kontakts. */
  function current(tenant: Tenant, contact = "sitzung-1") {
    return store.list(tenant.id).find((c) => c.contact === contact)!;
  }

  return { store, engine, chat, current, logs };
}
