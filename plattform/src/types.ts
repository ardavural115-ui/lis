// Kern-Typen der Plattform. Die Begriffe sind im README erklärt (Glossar).

export type Industry = "arztpraxis" | "freelancer" | "mittelstand";

/** "claude" = KI von Anthropic, "rules" = einfache Regeln, keine Daten verlassen den Server. */
export type AiMode = "claude" | "rules";

/** Ein Betrieb (Mandant): eine Praxis, ein Freelancer oder ein Unternehmen. */
export interface Tenant {
  id: string;
  name: string;
  industry: Industry;
  /** Überschreibt die globale KI-Einstellung für diesen Betrieb. */
  ai?: AiMode;
  /** Vorgänge ohne Aktivität werden nach so vielen Tagen gelöscht (Standard: 30). */
  retentionDays?: number;
  /** Begrüßung im Chat. Muss sagen, dass hier eine KI antwortet (AI Act Art. 50). */
  greeting: string;
  /** Werte für Platzhalter in Texten, z. B. {oeffnungszeiten}. */
  info: Record<string, string>;
  /** Wissen für automatische Antworten auf häufige Fragen. */
  faq: FaqEntry[];
}

export interface FaqEntry {
  question: string;
  answer: string;
  /** Stichworte für die regelbasierte Suche (ohne externe KI). */
  keywords: string[];
}

export interface Message {
  from: "customer" | "bot" | "team";
  text: string;
  /** ISO-Zeitpunkt */
  at: string;
}

/**
 * bot  = der Workflow läuft bzw. wartet auf eine Antwort des Kunden
 * team = liegt beim Team, der Workflow ist pausiert
 * done = erledigt
 */
export type CaseStatus = "bot" | "team" | "done";

/** Ein Vorgang: eine Anfrage vom ersten Kontakt bis zur Erledigung. */
export interface Case {
  id: string;
  tenantId: string;
  /** Kanal, über den die Anfrage kam, z. B. "web" (später "whatsapp", "telefon"). */
  channel: string;
  /** Adresse im Kanal, z. B. die Sitzungs-ID des Web-Chats. */
  contact: string;
  workflowId: string;
  stepId: string | null;
  /** true, wenn der aktuelle Schritt auf die nächste Kundennachricht wartet. */
  waiting: boolean;
  /** Zustand des aktuellen Schritts, z. B. welche Frage gerade offen ist. */
  stepState: Record<string, unknown>;
  status: CaseStatus;
  title: string;
  priority: "normal" | "high";
  tags: string[];
  /** Zuständiges Team, z. B. "Empfang" oder "Vertrieb". */
  team?: string;
  /** Gesammelte Angaben, z. B. { name: "Max Muster" }. */
  data: Record<string, string>;
  /** Anzeigenamen der Angaben, z. B. { name: "Name" }. */
  labels: Record<string, string>;
  summary?: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Workflows und Vorlagen

export interface Step {
  /** Eindeutig innerhalb des Workflows, Ziel für Sprünge. */
  id: string;
  /** Baustein-Typ, z. B. "form.ask". */
  block: string;
  config?: Record<string, unknown>;
}

/** Ein Workflow: Schritte, die nacheinander ausgeführt werden. */
export interface Workflow {
  id: string;
  name: string;
  steps: Step[];
}

/** Eine Vorlage: fertige Workflows für eine Branche. */
export interface Template {
  id: Industry;
  name: string;
  description: string;
  /** Workflow, mit dem jede neue Anfrage beginnt. */
  entry: string;
  /**
   * Wächter laufen bei jeder Kundennachricht, egal wo der Vorgang gerade steht,
   * z. B. die Notfall-Erkennung. Startet ein Wächter einen Workflow (switch), hat der Vorrang.
   */
  guards?: Step[];
  workflows: Workflow[];
}

// ---------------------------------------------------------------------------
// Bausteine

export type BlockResult =
  /** weiter mit dem nächsten Schritt */
  | { type: "next" }
  /** zu einem Schritt im selben Workflow springen */
  | { type: "goto"; step: string }
  /** anderen Workflow starten; consumeInput: die Nachricht war nur eine Menüauswahl */
  | { type: "switch"; workflow: string; consumeInput?: boolean }
  /** auf die nächste Kundennachricht warten */
  | { type: "wait" }
  /** an das Team übergeben, der Workflow pausiert */
  | { type: "handoff" }
  /** Vorgang erledigt */
  | { type: "end" };

export interface BlockContext {
  tenant: Tenant;
  case: Case;
  /** Die Kundennachricht, die diesen Durchlauf ausgelöst hat ("" = keine). */
  input: string;
  /** true, wenn genau dieser Schritt auf die Nachricht gewartet hat. */
  resumed: boolean;
  /** Zustand dieses Schritts, bleibt über mehrere Nachrichten erhalten. */
  state: Record<string, unknown>;
  ai: AiProvider;
  /** Antwort an den Kunden senden. */
  reply(text: string): void;
  /** Platzhalter wie {name} oder {oeffnungszeiten} ersetzen. */
  fill(text: string): string;
  now(): Date;
}

export interface ValidationContext {
  template: Template;
  workflow: Workflow;
}

export type BlockCategory = "kommunikation" | "ki" | "logik" | "team";

/** Ein Baustein: eine wiederverwendbare Fähigkeit, die in Workflows eingesetzt wird. */
export interface Block {
  type: string;
  title: string;
  description: string;
  category: BlockCategory;
  /** Prüft die Konfiguration eines Schritts, liefert Fehlermeldungen. */
  validate(config: Record<string, unknown>, ctx: ValidationContext): string[];
  run(ctx: BlockContext, config: Record<string, unknown>): Promise<BlockResult>;
}

// ---------------------------------------------------------------------------
// KI

export type FieldType = "text" | "email" | "phone" | "date" | "choice";

export interface FieldSpec {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
}

export interface IntentOption {
  id: string;
  label: string;
  keywords: string[];
}

/** Alles, was Bausteine von einer KI brauchen. Umsetzungen: ai/claude.ts, ai/rules.ts */
export interface AiProvider {
  readonly name: string;
  /** Ordnet eine Nachricht einem Anliegen zu, null = unklar. */
  classify(text: string, options: IntentOption[]): Promise<string | null>;
  /** Liest Angaben aus freiem Text, nur was ausdrücklich genannt wird. */
  extract(text: string, fields: FieldSpec[], now: Date): Promise<Record<string, string>>;
  /** Beantwortet eine Frage nur aus dem hinterlegten Wissen, null = nicht beantwortbar. */
  answer(question: string, faq: FaqEntry[], tenant: Tenant): Promise<string | null>;
  /** Kurze Zusammenfassung des Vorgangs für das Team. */
  summarize(c: Case): Promise<string>;
}

// ---------------------------------------------------------------------------
// Kanäle

/** Ein Kanal verbindet die Plattform mit Kunden: Web-Chat heute, später WhatsApp, Telefon ... */
export interface Channel {
  id: string;
  /** Stellt eine Antwort des Teams zu. */
  deliver(tenant: Tenant, c: Case, text: string): Promise<void>;
}
