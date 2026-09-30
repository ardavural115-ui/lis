// HTTP-Schnittstelle: Chat für Kunden, Inbox für das Team, Katalog der Bausteine und Vorlagen.

import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import type { Engine } from "./engine.ts";
import type { Store } from "./store.ts";
import type { Block, Case, Industry, Template, Tenant } from "./types.ts";
import { quickReplies } from "./templates/index.ts";
import { fillPlaceholders } from "./text.ts";
import { DEFAULT_RETENTION_DAYS } from "./tenants.ts";

export interface AppDeps {
  tenants: ReadonlyMap<string, Tenant>;
  teamTokens: ReadonlyMap<string, string>;
  engine: Engine;
  store: Store;
  templates: ReadonlyMap<Industry, Template>;
  blocks: readonly Block[];
  publicDir: string;
  /** Höchstens max Chat-Nachrichten pro Betrieb und IP-Adresse im Zeitfenster. */
  rateLimit?: { max: number; windowMs: number };
  /** Hinter einem Reverse Proxy (nginx, Caddy): echte IP aus X-Forwarded-For lesen. */
  trustProxy?: boolean;
}

const MAX_BODY_BYTES = 16 * 1024;
const MAX_TEXT = 2000;
const SESSION = /^[A-Za-z0-9-]{8,64}$/;

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
const CSP = "default-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'";

const STATIC_FILES: Record<string, string> = {
  "/widget.html": "text/html; charset=utf-8",
  "/widget.js": "text/javascript; charset=utf-8",
  "/inbox.html": "text/html; charset=utf-8",
  "/inbox.js": "text/javascript; charset=utf-8",
  "/app.css": "text/css; charset=utf-8",
};

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function createApp(deps: AppDeps) {
  const allow = createRateLimiter(deps.rateLimit ?? { max: 30, windowMs: 60_000 });

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");
    const method = req.method ?? "GET";
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);

    if (url.pathname === "/" && method === "GET") return redirect(res, "/widget.html");
    if (parts[0] !== "api") return serveStatic(res, url.pathname, method);

    if (method === "GET" && parts[1] === "catalog" && parts.length === 2) return sendJson(res, 200, catalog());
    if (parts[1] !== "tenants" || !parts[2]) throw new HttpError(404, "Nicht gefunden");

    const tenant = deps.tenants.get(parts[2]);
    if (!tenant) throw new HttpError(404, "Betrieb nicht gefunden");
    const [resource, id, action, ...extra] = parts.slice(3);

    // Öffentlich: Kunden im Chat
    if (resource === undefined && method === "GET") return sendJson(res, 200, publicInfo(tenant));
    if (resource === "chat" && id === undefined && method === "POST") return chat(req, res, tenant);
    if (resource === "chat" && id !== undefined && action === undefined && method === "GET") return history(res, tenant, id);

    // Team: nur mit Zugangsschlüssel
    if (resource === "cases" && extra.length === 0) {
      requireTeam(req, tenant);
      if (id === undefined && method === "GET") {
        return sendJson(res, 200, { cases: deps.store.list(tenant.id).map(overview) });
      }
      const c = id === undefined ? undefined : deps.store.get(id);
      if (!c || c.tenantId !== tenant.id) throw new HttpError(404, "Vorgang nicht gefunden");
      if (action === undefined && method === "GET") return sendJson(res, 200, { case: c });
      if (action === "reply" && method === "POST") {
        const text = requireText((await readJson(req)).text);
        return sendJson(res, 200, { case: await deps.engine.teamReply(tenant, c.id, text) });
      }
      if (action === "close" && method === "POST") {
        return sendJson(res, 200, { case: deps.engine.closeCase(tenant, c.id) });
      }
    }
    throw new HttpError(404, "Nicht gefunden");
  }

  async function chat(req: IncomingMessage, res: ServerResponse, tenant: Tenant): Promise<void> {
    if (!allow(`${tenant.id}:${clientAddress(req)}`)) {
      throw new HttpError(429, "Zu viele Nachrichten, bitte kurz warten.");
    }
    const body = await readJson(req);
    if (typeof body.session !== "string" || !SESSION.test(body.session)) throw new HttpError(400, "Ungültige Sitzung");
    const text = requireText(body.text);
    const result = await deps.engine.handleMessage({ tenant, channel: "web", contact: body.session, text });
    sendJson(res, 200, result);
  }

  /** Gesprächsverlauf einer Chat-Sitzung, damit das Widget Antworten des Teams anzeigen kann. */
  function history(res: ServerResponse, tenant: Tenant, session: string): void {
    if (!SESSION.test(session)) throw new HttpError(400, "Ungültige Sitzung");
    const messages = deps.store
      .list(tenant.id)
      .filter((c) => c.channel === "web" && c.contact === session)
      .flatMap((c) => c.messages)
      .sort((a, b) => a.at.localeCompare(b.at))
      .slice(-100);
    sendJson(res, 200, { messages });
  }

  function publicInfo(tenant: Tenant) {
    const template = deps.templates.get(tenant.industry);
    return {
      id: tenant.id,
      name: tenant.name,
      industry: tenant.industry,
      greeting: fillPlaceholders(tenant.greeting, { betrieb: tenant.name, ...tenant.info }),
      retentionDays: tenant.retentionDays ?? DEFAULT_RETENTION_DAYS,
      quickReplies: template ? quickReplies(template) : [],
    };
  }

  function catalog() {
    return {
      blocks: deps.blocks.map(({ type, title, description, category }) => ({ type, title, description, category })),
      templates: [...deps.templates.values()].map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        guards: (t.guards ?? []).map((s) => s.block),
        workflows: t.workflows.map((w) => ({ id: w.id, name: w.name, steps: w.steps.map((s) => s.block) })),
      })),
    };
  }

  function clientAddress(req: IncomingMessage): string {
    if (deps.trustProxy) {
      const header = req.headers["x-forwarded-for"];
      const first = (Array.isArray(header) ? header[0] : header)?.split(",")[0]?.trim();
      if (first) return first;
    }
    return req.socket.remoteAddress ?? "?";
  }

  function requireTeam(req: IncomingMessage, tenant: Tenant): void {
    const expected = deps.teamTokens.get(tenant.id);
    const given = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!expected || !given || !sameSecret(given, expected)) throw new HttpError(401, "Zugang verweigert");
  }

  async function serveStatic(res: ServerResponse, pathname: string, method: string): Promise<void> {
    const type = STATIC_FILES[pathname];
    if (!type || (method !== "GET" && method !== "HEAD")) throw new HttpError(404, "Nicht gefunden");
    const body = await readFile(join(deps.publicDir, pathname.slice(1)));
    // Die Inbox darf nicht in fremde Seiten eingebettet werden, das Widget später schon
    const csp = pathname.startsWith("/inbox") ? `${CSP}; frame-ancestors 'none'` : CSP;
    res.writeHead(200, { "Content-Type": type, "Content-Security-Policy": csp, ...SECURITY_HEADERS });
    res.end(method === "HEAD" ? undefined : body);
  }

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      await route(req, res);
    } catch (error) {
      if (error instanceof HttpError) {
        sendJson(res, error.status, { error: error.message });
      } else if (error instanceof URIError) {
        sendJson(res, 400, { error: "Ungültige Adresse" });
      } else {
        console.error("Serverfehler:", error instanceof Error ? error.message : error);
        sendJson(res, 500, { error: "Interner Fehler" });
      }
    }
  };
}

/** Kurzfassung eines Vorgangs für die Liste der Inbox. */
function overview(c: Case) {
  return {
    id: c.id,
    title: c.title,
    status: c.status,
    priority: c.priority,
    tags: c.tags,
    team: c.team ?? null,
    name: c.data.name || null,
    summary: c.summary ?? null,
    channel: c.channel,
    messageCount: c.messages.length,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

function requireText(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new HttpError(400, "Nachricht fehlt");
  if (value.length > MAX_TEXT) throw new HttpError(400, `Nachricht zu lang (höchstens ${MAX_TEXT} Zeichen)`);
  return value;
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "Anfrage zu groß");
    chunks.push(chunk);
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    // unten als ungültig behandelt
  }
  throw new HttpError(400, "Ungültiges JSON");
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.headersSent) return;
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...SECURITY_HEADERS,
  });
  res.end(JSON.stringify(body));
}

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(302, { Location: location, ...SECURITY_HEADERS });
  res.end();
}

/** Vergleich in konstanter Zeit, damit Zugangsschlüssel nicht erraten werden können. */
function sameSecret(a: string, b: string): boolean {
  const hash = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(hash(a), hash(b));
}

function createRateLimiter({ max, windowMs }: { max: number; windowMs: number }) {
  const windows = new Map<string, { count: number; resetAt: number }>();
  return (key: string, now = Date.now()): boolean => {
    if (windows.size > 10_000) {
      for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
    }
    const current = windows.get(key);
    if (!current || current.resetAt <= now) {
      windows.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    current.count++;
    return current.count <= max;
  };
}
