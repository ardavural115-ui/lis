import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { createApp } from "../src/app.ts";
import { blocks } from "../src/blocks/index.ts";
import { templates } from "../src/templates/index.ts";
import { setup, tenants } from "./helpers.ts";

const TOKEN = "team-zugang-fuer-tests-123";
const SESSION = "11111111-2222-3333-4444-555555555555";

let server: Server;
let base: string;

before(async () => {
  const { engine, store } = setup();
  const app = createApp({
    tenants,
    teamTokens: new Map([...tenants.keys()].map((id) => [id, TOKEN])),
    engine,
    store,
    templates,
    blocks,
    publicDir: join(import.meta.dirname, "..", "public"),
    rateLimit: { max: 20, windowMs: 60_000 },
  });
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => new Promise<void>((resolve) => server.close(() => resolve())));

const team = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

/** Anfrage an den Testserver; die JSON-Antwort ist bewusst untypisiert. */
async function call(path: string, init?: RequestInit): Promise<{ status: number; headers: Headers; body: any }> {
  const res = await fetch(`${base}${path}`, init);
  return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) };
}

function chat(text: string, session = SESSION, tenant = "praxis-demo") {
  return call(`/api/tenants/${tenant}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session, text }),
  });
}

describe("HTTP-Schnittstelle", () => {
  test("Betriebsinfo für das Widget, ohne Geheimnisse", async () => {
    const { status, headers, body: info } = await call("/api/tenants/praxis-demo");
    assert.equal(status, 200);
    assert.equal(headers.get("cache-control"), "no-store");
    assert.match(info.greeting, /Hausarztpraxis Dr\. Beispiel, eine KI/);
    assert.equal(info.retentionDays, 30);
    assert.ok(info.quickReplies.includes("Rezept bestellen"));
    assert.equal(info.faq, undefined);
  });

  test("Chat, Verlauf, Team-Antwort und Abschluss", async () => {
    const first = await chat("Termin anfragen");
    assert.equal(first.status, 200);
    assert.deepEqual(first.body.replies, ["Wie ist Ihr vollständiger Name?"]);
    const caseId = first.body.caseId;

    for (const answer of ["Max Muster", "01.02.1980", "0170 1234567", "gesetzlich", "nein", "Vorsorge", "Dienstag vormittags"]) {
      await chat(answer);
    }

    const { body: list } = await call("/api/tenants/praxis-demo/cases", { headers: team });
    const overview = list.cases.find((c: { id: string }) => c.id === caseId);
    assert.equal(overview.status, "team");
    assert.equal(overview.name, "Max Muster");

    const reply = await fetch(`${base}/api/tenants/praxis-demo/cases/${caseId}/reply`, {
      method: "POST",
      headers: team,
      body: JSON.stringify({ text: "Passt Dienstag um 9 Uhr?" }),
    });
    assert.equal(reply.status, 200);

    // Das Widget sieht die Antwort des Teams im Verlauf
    const { body: history } = await call(`/api/tenants/praxis-demo/chat/${SESSION}`);
    const last = history.messages.at(-1);
    assert.equal(last.from, "team");
    assert.equal(last.text, "Passt Dienstag um 9 Uhr?");

    const closed = await call(`/api/tenants/praxis-demo/cases/${caseId}/close`, { method: "POST", headers: team });
    assert.equal(closed.body.case.status, "done");
  });

  test("Team-Endpunkte nur mit gültigem Zugang", async () => {
    assert.equal((await fetch(`${base}/api/tenants/praxis-demo/cases`)).status, 401);
    const wrong = await fetch(`${base}/api/tenants/praxis-demo/cases`, { headers: { Authorization: "Bearer falsch" } });
    assert.equal(wrong.status, 401);
    const unknown = await fetch(`${base}/api/tenants/praxis-demo/cases/gibt-es-nicht`, { headers: team });
    assert.equal(unknown.status, 404);
  });

  test("Vorgänge anderer Betriebe sind nicht erreichbar", async () => {
    const { body } = await chat("Rezept bitte", "22222222-2222-3333-4444-555555555555");
    const res = await fetch(`${base}/api/tenants/freelancer-demo/cases/${body.caseId}`, { headers: team });
    assert.equal(res.status, 404);
  });

  test("ungültige Eingaben werden abgelehnt", async () => {
    assert.equal((await chat("Hallo", "zu-kurz")).status, 400);
    assert.equal((await chat("x".repeat(2001))).status, 400);
    assert.equal((await chat("   ")).status, 400);
    const broken = await fetch(`${base}/api/tenants/praxis-demo/chat`, { method: "POST", body: "{kein json" });
    assert.equal(broken.status, 400);
    const huge = await fetch(`${base}/api/tenants/praxis-demo/chat`, { method: "POST", body: "x".repeat(20_000) });
    assert.equal(huge.status, 413);
    assert.equal((await chat("Hallo", SESSION, "gibt-es-nicht")).status, 404);
  });

  test("zu viele Nachrichten werden gebremst", async () => {
    let limited = 0;
    for (let i = 0; i < 25; i++) {
      if ((await chat("Hallo", "33333333-2222-3333-4444-555555555555", "mittelstand-demo")).status === 429) limited++;
    }
    assert.ok(limited > 0);
  });

  test("statische Seiten mit Sicherheits-Headern, sonst nichts", async () => {
    const widget = await fetch(`${base}/widget.html`);
    assert.equal(widget.status, 200);
    assert.match(widget.headers.get("content-security-policy")!, /default-src 'self'/);
    const inbox = await fetch(`${base}/inbox.html`);
    assert.match(inbox.headers.get("content-security-policy")!, /frame-ancestors 'none'/);
    assert.equal((await fetch(`${base}/package.json`)).status, 404);
    assert.equal((await fetch(`${base}/..%2Fpackage.json`)).status, 404);
    const root = await fetch(`${base}/`, { redirect: "manual" });
    assert.equal(root.headers.get("location"), "/widget.html");
  });

  test("Katalog listet Bausteine und Vorlagen", async () => {
    const { body: catalog } = await call("/api/catalog");
    assert.equal(catalog.blocks.length, 9);
    assert.deepEqual(
      catalog.templates.map((t: { id: string }) => t.id),
      ["arztpraxis", "freelancer", "mittelstand"],
    );
    assert.deepEqual(catalog.templates[0].guards, ["logic.keywords"]);
  });
});

describe("hinter einem Reverse Proxy", () => {
  test("die Bremse zählt pro Kunden-IP, nicht pro Proxy", async () => {
    const { engine, store } = setup();
    const app = createApp({
      tenants,
      teamTokens: new Map(),
      engine,
      store,
      templates,
      blocks,
      publicDir: join(import.meta.dirname, "..", "public"),
      rateLimit: { max: 2, windowMs: 60_000 },
      trustProxy: true,
    });
    const proxied = createServer(app);
    await new Promise<void>((resolve) => proxied.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(proxied.address() as AddressInfo).port}/api/tenants/praxis-demo/chat`;
    const send = (ip: string) =>
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-For": `${ip}, 10.0.0.1` },
        body: JSON.stringify({ session: "44444444-2222-3333-4444-555555555555", text: "Hallo" }),
      }).then((res) => res.status);
    try {
      assert.deepEqual([await send("1.1.1.1"), await send("1.1.1.1"), await send("1.1.1.1")], [200, 200, 429]);
      assert.equal(await send("2.2.2.2"), 200);
    } finally {
      await new Promise<void>((resolve) => proxied.close(() => resolve()));
    }
  });
});
