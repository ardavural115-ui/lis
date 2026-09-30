// Richtet die Praxis-Workflows über die n8n-API ein, ohne Import im Browser.
//
//   N8N_URL=https://deinname.app.n8n.cloud N8N_API_KEY=… node einrichten.mjs [praxis.json]
//
// Legt die Tabelle „Vorgaenge“ und die vier Workflows an und trägt die Baustein-ID ein.
// Gibt es in n8n schon Zugangsdaten für Claude (Anthropic) und SMTP, werden sie in die
// Knoten eingetragen und die Workflows veröffentlicht. Die Zugangsdaten selbst legt man
// in n8n an, sie laufen nie durch dieses Skript.
//
// praxis.json (optional): praxis_name, praxis_adresse, praxis_telefon, sprechzeiten,
// weitere_infos, team_email, absender_email, loeschfrist_tage.
// Braucht Node.js 22 oder neuer. Hinter einem Proxy: NODE_USE_ENV_PROXY=1 setzen.

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const BASE = (process.env.N8N_URL ?? "").replace(/\/+$/, "");
const KEY = process.env.N8N_API_KEY ?? "";
const DIR = new URL(".", import.meta.url);

if (!BASE || !KEY) {
  console.error("Bitte N8N_URL und N8N_API_KEY setzen.");
  process.exit(1);
}

const praxis = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], "utf8")) : {};
const load = (file) => JSON.parse(readFileSync(new URL(file, DIR), "utf8"));

const einrichtung = load("00-praxis-einrichtung.json");
const rezeption = load("01-praxis-online-rezeption.json");
const baustein = load("02-baustein-vorgang-anlegen.json");
const taeglich = load("03-praxis-taeglich.json");

async function api(method, path, body) {
  let res;
  try {
    res = await fetch(`${BASE}/api/v1${path}`, {
      method,
      headers: { "X-N8N-API-KEY": KEY, "content-type": "application/json", accept: "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`n8n unter ${BASE} nicht erreichbar (${err.cause?.code ?? err.cause?.message ?? err.message}).`);
  }
  if (res.status === 401) throw new Error("n8n nimmt den API-Schlüssel nicht an (401).");
  const text = await res.text();
  let data = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {}
  if (!res.ok) {
    const detail = typeof data === "string" ? data : JSON.stringify(data);
    throw new Error(`${method} ${path}: ${res.status} ${detail.slice(0, 300)}`);
  }
  return data;
}

async function listAll(path) {
  const items = [];
  let cursor;
  do {
    const sep = path.includes("?") ? "&" : "?";
    const page = await api("GET", `${path}${sep}limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    items.push(...(page.data ?? []));
    cursor = page.nextCursor;
  } while (cursor);
  return items;
}

function setField(workflow, nodeName, field, value) {
  const node = workflow.nodes.find((n) => n.name === nodeName);
  const assignment = node?.parameters?.assignments?.assignments?.find((a) => a.name === field);
  if (!assignment) throw new Error(`Feld ${field} im Knoten ${nodeName} fehlt`);
  assignment.value = value;
}

function setCredentials(workflow, credentials) {
  for (const node of workflow.nodes) {
    if (node.type === "@n8n/n8n-nodes-langchain.lmChatAnthropic" && credentials.anthropic) {
      node.credentials = { anthropicApi: { id: credentials.anthropic.id, name: credentials.anthropic.name } };
    }
    if (node.type === "n8n-nodes-base.emailSend" && credentials.smtp) {
      node.credentials = { smtp: { id: credentials.smtp.id, name: credentials.smtp.name } };
    }
  }
}

const PRAXIS_FELDER = ["praxis_name", "praxis_adresse", "praxis_telefon", "sprechzeiten", "weitere_infos"];
const TEAM_FELDER = ["team_email", "absender_email"];

const create = (workflow) =>
  api("POST", "/workflows", {
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: workflow.settings,
  });

async function main() {
  // 1. Nichts doppelt anlegen
  const names = [einrichtung, rezeption, baustein, taeglich].map((w) => w.name);
  const vorhanden = (await listAll("/workflows")).filter((w) => names.includes(w.name) && !w.isArchived);
  if (vorhanden.length > 0) {
    console.error("Diese Workflows gibt es schon, bitte erst archivieren oder umbenennen:");
    for (const w of vorhanden) console.error(`  ${w.name} (${BASE}/workflow/${w.id})`);
    process.exit(1);
  }

  // 2. Tabelle „Vorgaenge“
  const tableNode = einrichtung.nodes.find((n) => n.type === "n8n-nodes-base.dataTable");
  const tableName = tableNode.parameters.tableName;
  const tables = await api("GET", `/data-tables?filter=${encodeURIComponent(JSON.stringify({ name: tableName }))}`);
  if ((tables.data ?? []).some((t) => t.name === tableName)) {
    console.log(`Tabelle ${tableName} gibt es schon.`);
  } else {
    await api("POST", "/data-tables", { name: tableName, columns: tableNode.parameters.columns.column });
    console.log(`Tabelle ${tableName} angelegt.`);
  }

  // 3. Vorhandene Zugangsdaten suchen (nur Name und Typ, keine Geheimnisse)
  let allCredentials = [];
  try {
    allCredentials = await listAll("/credentials");
  } catch (err) {
    console.log(`Zugangsdaten nicht lesbar (${err.message}). Sie werden nicht eingetragen.`);
  }
  const credentials = {
    anthropic: allCredentials.find((c) => c.type === "anthropicApi"),
    smtp: allCredentials.find((c) => c.type === "smtp"),
  };
  for (const workflow of [rezeption, baustein, taeglich]) setCredentials(workflow, credentials);

  // 4. Praxisdaten eintragen
  const bekannt = [...PRAXIS_FELDER, ...TEAM_FELDER, "loeschfrist_tage"];
  for (const key of Object.keys(praxis)) {
    if (!bekannt.includes(key)) console.log(`Unbekanntes Feld in praxis.json wird ignoriert: ${key}`);
  }
  for (const field of PRAXIS_FELDER) {
    if (praxis[field]) setField(rezeption, "Praxis-Einstellungen", field, String(praxis[field]));
  }
  for (const workflow of [baustein, taeglich]) {
    for (const field of TEAM_FELDER) {
      if (praxis[field]) setField(workflow, "Einstellungen", field, String(praxis[field]));
    }
  }
  if (praxis.loeschfrist_tage) setField(taeglich, "Einstellungen", "loeschfrist_tage", Number(praxis.loeschfrist_tage));

  // 5. Workflows anlegen: erst der Baustein, dann seine ID in die Online-Rezeption
  const b = await create(baustein);
  setField(rezeption, "Praxis-Einstellungen", "baustein_id", b.id);
  // Eigene Chat-Adresse für diese Installation
  const chatNode = rezeption.nodes.find((n) => n.type === "@n8n/n8n-nodes-langchain.chatTrigger");
  chatNode.webhookId = randomUUID();
  const r = await create(rezeption);
  const t = await create(taeglich);
  const e = await create(einrichtung);

  // 6. Veröffentlichen, wenn die Zugangsdaten da sind
  const fehlt = [!credentials.anthropic && "Claude (Anthropic)", !credentials.smtp && "SMTP"].filter(Boolean);
  if (fehlt.length === 0) {
    for (const w of [b, r, t]) await api("POST", `/workflows/${w.id}/publish`, {});
  }

  console.log("\nAngelegt:");
  for (const w of [b, r, t, e]) console.log(`  ${w.name}: ${BASE}/workflow/${w.id}`);
  console.log(`\nChat-Adresse: ${BASE}/webhook/${chatNode.webhookId}/chat`);
  if (fehlt.length === 0) {
    console.log(`Zugangsdaten: ${credentials.anthropic.name}, ${credentials.smtp.name}. Baustein, Online-Rezeption und Täglich sind veröffentlicht.`);
  } else {
    console.log(`Noch nicht veröffentlicht, es fehlen Zugangsdaten für: ${fehlt.join(", ")}.`);
    console.log("In n8n anlegen, in den Knoten auswählen und die drei Workflows mit Publish veröffentlichen.");
  }
}

main().catch((err) => {
  console.error(`Fehler: ${err.message}`);
  process.exit(1);
});
