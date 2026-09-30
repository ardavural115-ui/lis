// Startpunkt: Konfiguration laden, alles prüfen, Server starten.  →  npm start

import { createServer } from "node:http";
import { join } from "node:path";
import { createAiResolver, defaultAiMode } from "./ai/index.ts";
import { createApp } from "./app.ts";
import { blockRegistry, blocks } from "./blocks/index.ts";
import { webChannel } from "./channels/web.ts";
import { createEngine } from "./engine.ts";
import { createStore } from "./store.ts";
import { checkTenant, templates, validateTemplate } from "./templates/index.ts";
import { DEFAULT_RETENTION_DAYS, loadTenants, resolveTeamTokens, tokenVariable } from "./tenants.ts";

const root = join(import.meta.dirname, "..");
const env = process.env;

for (const template of templates.values()) {
  const errors = validateTemplate(template, blockRegistry);
  if (errors.length > 0) throw new Error(`Vorlage ${template.id} ist fehlerhaft:\n${errors.join("\n")}`);
}

const tenants = loadTenants(env.LIS_BETRIEBE ?? join(root, "tenants"));
for (const tenant of tenants.values()) {
  const template = templates.get(tenant.industry);
  if (!template) throw new Error(`Keine Vorlage für ${tenant.industry}`);
  for (const warning of checkTenant(template, tenant)) console.warn(`Achtung, Betrieb ${tenant.id}: ${warning}`);
}

const store = createStore(env.LIS_DATEN ?? join(root, "data", "cases.json"));
const engine = createEngine({
  templates,
  blocks: blockRegistry,
  store,
  aiFor: createAiResolver(env),
  channels: new Map([[webChannel.id, webChannel]]),
});
const { tokens, generated } = resolveTeamTokens(tenants, env);

// Löschfrist: beim Start und dann stündlich
const DAY_MS = 24 * 60 * 60 * 1000;
function purgeExpired(): void {
  for (const tenant of tenants.values()) {
    const days = tenant.retentionDays ?? DEFAULT_RETENTION_DAYS;
    const removed = store.deleteOlderThan(tenant.id, new Date(Date.now() - days * DAY_MS));
    if (removed > 0) console.log(`Löschfrist: ${removed} Vorgänge von ${tenant.id} gelöscht`);
  }
}
purgeExpired();
setInterval(purgeExpired, 60 * 60 * 1000).unref();

const port = Number(env.PORT ?? 3000);
const host = env.HOST ?? "127.0.0.1";
const app = createApp({
  tenants,
  teamTokens: tokens,
  engine,
  store,
  templates,
  blocks,
  publicDir: join(root, "public"),
  trustProxy: env.LIS_PROXY === "1",
});

createServer(app).listen(port, host, () => {
  const base = `http://${host}:${port}`;
  const mode = defaultAiMode(env) === "claude" ? "Claude" : "Regeln (ohne externe KI)";
  console.log(`Lis-Plattform läuft auf ${base}  ·  KI: ${mode}`);
  for (const tenant of tenants.values()) {
    console.log(`\n${tenant.name} (${tenant.industry})`);
    console.log(`  Chat:  ${base}/widget.html?tenant=${tenant.id}`);
    console.log(`  Inbox: ${base}/inbox.html?tenant=${tenant.id}`);
    const token = generated.get(tenant.id);
    if (token) console.log(`  Team-Zugang: ${token}  (neu erzeugt, fest setzen mit ${tokenVariable(tenant.id)})`);
  }
});
