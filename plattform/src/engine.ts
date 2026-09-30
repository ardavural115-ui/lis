// Die Workflow-Engine: Nachricht rein → Vorgang finden oder anlegen → Bausteine ausführen → Antworten raus.
// Jeder Kanal (Web-Chat, später WhatsApp, Telefon …) ruft nur handleMessage auf.

import { randomUUID } from "node:crypto";
import type { Store } from "./store.ts";
import type {
  AiProvider,
  Block,
  BlockContext,
  BlockResult,
  Case,
  CaseStatus,
  Channel,
  Industry,
  Message,
  Template,
  Tenant,
  Workflow,
} from "./types.ts";
import { fillPlaceholders, normalize } from "./text.ts";

export interface EngineDeps {
  templates: ReadonlyMap<Industry, Template>;
  blocks: ReadonlyMap<string, Block>;
  store: Store;
  aiFor: (tenant: Tenant) => AiProvider;
  channels?: ReadonlyMap<string, Channel>;
  now?: () => Date;
  newId?: () => string;
  log?: (message: string) => void;
}

export interface IncomingMessage {
  tenant: Tenant;
  channel: string;
  contact: string;
  text: string;
}

export interface EngineResult {
  caseId: string | null;
  status: CaseStatus | null;
  replies: string[];
}

export const TEXTS = {
  deleted: "Ihre Daten wurden gelöscht. Ihr gesamter Gesprächsverlauf ist entfernt.",
  cancelled: "Alles klar, ich habe die Anfrage abgebrochen. Schreiben Sie mir einfach, wenn ich helfen kann.",
  forwarded: "Danke! Ihre Nachricht wurde an das Team weitergeleitet.",
  failed:
    "Entschuldigung, da ist etwas schiefgelaufen. Ihr Anliegen wurde an das Team weitergegeben, wir kümmern uns persönlich darum.",
};

/** Befehle, die in jedem Kanal funktionieren (Vergleich ohne Groß-/Kleinschreibung und Umlaute). */
const DELETE_COMMAND = normalize("Daten löschen");
const CANCEL_COMMAND = normalize("abbrechen");

/** Schutz vor Endlosschleifen durch fehlerhafte Sprünge. */
const MAX_STEPS_PER_MESSAGE = 30;

export type Engine = ReturnType<typeof createEngine>;

export function createEngine(deps: EngineDeps) {
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? randomUUID;
  const log = deps.log ?? ((message: string) => console.log(message));

  function templateFor(tenant: Tenant): Template {
    const template = deps.templates.get(tenant.industry);
    if (!template) throw new Error(`Keine Vorlage für Branche ${tenant.industry}`);
    return template;
  }

  function findWorkflow(template: Template, id: string): Workflow {
    const workflow = template.workflows.find((w) => w.id === id);
    if (!workflow) throw new Error(`Workflow ${id} fehlt in Vorlage ${template.id}`);
    return workflow;
  }

  function addMessage(c: Case, from: Message["from"], text: string): void {
    c.messages.push({ from, text, at: now().toISOString() });
  }

  function moveTo(c: Case, stepId: string | null): void {
    c.stepId = stepId;
    c.stepState = {};
    c.waiting = false;
  }

  function newCase(tenant: Tenant, channel: string, contact: string, template: Template): Case {
    const entry = findWorkflow(template, template.entry);
    const at = now().toISOString();
    return {
      id: newId(),
      tenantId: tenant.id,
      channel,
      contact,
      workflowId: entry.id,
      stepId: entry.steps[0]?.id ?? null,
      waiting: false,
      stepState: {},
      status: "bot",
      title: entry.name,
      priority: "normal",
      tags: [],
      data: {},
      labels: {},
      messages: [],
      createdAt: at,
      updatedAt: at,
    };
  }

  async function handleMessage(message: IncomingMessage): Promise<EngineResult> {
    const { tenant, channel, contact } = message;
    const text = message.text.trim();
    if (!text) return { caseId: null, status: null, replies: [] };

    if (normalize(text) === DELETE_COMMAND) {
      const removed = deps.store.deleteContact(tenant.id, channel, contact);
      log(`Daten gelöscht: ${removed} Vorgänge bei ${tenant.id}`);
      return { caseId: null, status: null, replies: [TEXTS.deleted] };
    }

    const template = templateFor(tenant);
    const open = deps.store.findOpen(tenant.id, channel, contact);
    const c = open ?? newCase(tenant, channel, contact, template);
    const replies: string[] = [];
    const reply = (t: string) => {
      replies.push(t);
      addMessage(c, "bot", t);
    };
    addMessage(c, "customer", text);

    if (open && open.status === "bot" && normalize(text) === CANCEL_COMMAND) {
      c.status = "done";
      moveTo(c, null);
      reply(TEXTS.cancelled);
    } else {
      // Wächter (z. B. Notfall) prüfen jede Nachricht, auch wenn der Vorgang schon beim Team liegt
      const redirect = await runGuards(tenant, template, c, text, reply);
      if (redirect) {
        c.status = "bot";
        startWorkflow(c, findWorkflow(template, redirect));
        await runWorkflow(tenant, template, c, text, reply);
      } else if (c.status === "team") {
        // Das Team ist dran: Nachricht nur anhängen, Eingang einmal bestätigen
        const last = c.messages.findLast((m) => m.from !== "customer");
        if (last?.text !== TEXTS.forwarded) reply(TEXTS.forwarded);
      } else {
        await runWorkflow(tenant, template, c, text, reply);
      }
    }

    c.updatedAt = now().toISOString();
    deps.store.save(c);
    return { caseId: c.id, status: c.status, replies };
  }

  function context(tenant: Tenant, c: Case, input: string, resumed: boolean, reply: (t: string) => void): BlockContext {
    return {
      tenant,
      case: c,
      input,
      resumed,
      state: c.stepState,
      ai: deps.aiFor(tenant),
      reply,
      fill: (t) => fillPlaceholders(t, { betrieb: tenant.name, ...tenant.info, ...c.data }),
      now,
    };
  }

  function startWorkflow(c: Case, workflow: Workflow): void {
    c.workflowId = workflow.id;
    c.title = workflow.name;
    moveTo(c, workflow.steps[0]?.id ?? null);
  }

  /** Führt die Wächter aus. Liefert den Workflow, den ein Wächter starten will, sonst null. */
  async function runGuards(
    tenant: Tenant,
    template: Template,
    c: Case,
    text: string,
    reply: (t: string) => void,
  ): Promise<string | null> {
    for (const step of template.guards ?? []) {
      const block = deps.blocks.get(step.block);
      if (!block) continue;
      // Wächter bekommen einen eigenen, leeren Zustand und verändern den laufenden Schritt nicht
      const ctx = { ...context(tenant, c, text, false, reply), state: {} };
      try {
        const result = await block.run(ctx, step.config ?? {});
        if (result.type === "switch") return result.workflow;
      } catch (error) {
        log(`Fehler im Wächter ${step.id} (Vorgang ${c.id}): ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return null;
  }

  async function runWorkflow(
    tenant: Tenant,
    template: Template,
    c: Case,
    text: string,
    reply: (t: string) => void,
  ): Promise<void> {
    let input = text;
    let resumed = c.waiting;

    for (let i = 0; i < MAX_STEPS_PER_MESSAGE; i++) {
      const workflow = findWorkflow(template, c.workflowId);
      const index = workflow.steps.findIndex((s) => s.id === c.stepId);
      const step = workflow.steps[index];
      if (!step) {
        c.status = "done";
        moveTo(c, null);
        return;
      }
      const where = `${workflow.id}/${step.id}`;
      const block = deps.blocks.get(step.block);
      if (!block) return fail(c, reply, where, new Error(`unbekannter Baustein ${step.block}`));

      let result: BlockResult;
      try {
        result = await block.run(context(tenant, c, input, resumed, reply), step.config ?? {});
      } catch (error) {
        return fail(c, reply, where, error);
      }
      resumed = false;

      switch (result.type) {
        case "next":
          moveTo(c, workflow.steps[index + 1]?.id ?? null);
          break;
        case "goto":
          moveTo(c, result.step);
          break;
        case "switch":
          startWorkflow(c, findWorkflow(template, result.workflow));
          // Die Nachricht war nur eine Menüauswahl, die nächsten Schritte sollen sie nicht auswerten
          if (result.consumeInput) input = "";
          break;
        case "wait":
          c.waiting = true;
          return;
        case "handoff":
          c.status = "team";
          moveTo(c, null);
          return;
        case "end":
          c.status = "done";
          moveTo(c, null);
          return;
      }
      if (c.stepId === null) {
        c.status = "done";
        return;
      }
    }
    fail(c, reply, c.workflowId, new Error("zu viele Schritte, Endlosschleife?"));
  }

  /** Fehler nie verschlucken: Kunde bekommt eine Antwort, der Vorgang geht ans Team. */
  function fail(c: Case, reply: (t: string) => void, where: string, error: unknown): void {
    log(`Fehler in ${where} (Vorgang ${c.id}): ${error instanceof Error ? error.message : String(error)}`);
    reply(TEXTS.failed);
    c.status = "team";
    moveTo(c, null);
    if (!c.tags.includes("fehler")) c.tags.push("fehler");
  }

  async function teamReply(tenant: Tenant, caseId: string, text: string): Promise<Case | undefined> {
    const c = deps.store.get(caseId);
    if (!c || c.tenantId !== tenant.id) return undefined;
    addMessage(c, "team", text);
    if (c.status !== "team") {
      // Das Team übernimmt, ein laufender Workflow wird beendet
      c.status = "team";
      moveTo(c, null);
    }
    c.updatedAt = now().toISOString();
    deps.store.save(c);
    await deps.channels?.get(c.channel)?.deliver(tenant, c, text);
    return c;
  }

  function closeCase(tenant: Tenant, caseId: string): Case | undefined {
    const c = deps.store.get(caseId);
    if (!c || c.tenantId !== tenant.id) return undefined;
    c.status = "done";
    moveTo(c, null);
    c.updatedAt = now().toISOString();
    deps.store.save(c);
    return c;
  }

  return { handleMessage, teamReply, closeCase };
}
