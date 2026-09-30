// Speicher für Vorgänge. Für den Anfang im Arbeitsspeicher, optional in einer JSON-Datei.
// Später austauschbar gegen eine Datenbank (SQLite/Postgres), die Schnittstelle bleibt gleich.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Case } from "./types.ts";

export interface Store {
  get(id: string): Case | undefined;
  /** Letzter offener Vorgang (Bot oder Team) eines Kontakts. */
  findOpen(tenantId: string, channel: string, contact: string): Case | undefined;
  save(c: Case): void;
  /** Alle Vorgänge eines Betriebs, neueste zuerst. */
  list(tenantId: string): Case[];
  /** „Daten löschen“: alle Vorgänge eines Kontakts entfernen. */
  deleteContact(tenantId: string, channel: string, contact: string): number;
  /** Löschfrist: Vorgänge ohne Aktivität seit cutoff entfernen. */
  deleteOlderThan(tenantId: string, cutoff: Date): number;
}

/** file = Pfad zur JSON-Datei; ohne Pfad bleibt alles nur im Arbeitsspeicher. */
export function createStore(file?: string): Store {
  const cases = new Map<string, Case>();
  if (file && existsSync(file)) {
    for (const c of JSON.parse(readFileSync(file, "utf8")) as Case[]) cases.set(c.id, c);
  }

  function persist(): void {
    if (!file) return;
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify([...cases.values()]), { mode: 0o600 });
    renameSync(tmp, file);
  }

  function remove(match: (c: Case) => boolean): number {
    let removed = 0;
    for (const [id, c] of cases) {
      if (match(c)) {
        cases.delete(id);
        removed++;
      }
    }
    if (removed) persist();
    return removed;
  }

  const byNewest = (a: Case, b: Case) => b.updatedAt.localeCompare(a.updatedAt);

  return {
    get: (id) => cases.get(id),

    findOpen(tenantId, channel, contact) {
      return [...cases.values()]
        .filter((c) => c.tenantId === tenantId && c.channel === channel && c.contact === contact && c.status !== "done")
        .sort(byNewest)[0];
    },

    save(c) {
      cases.set(c.id, c);
      persist();
    },

    list: (tenantId) => [...cases.values()].filter((c) => c.tenantId === tenantId).sort(byNewest),

    deleteContact: (tenantId, channel, contact) =>
      remove((c) => c.tenantId === tenantId && c.channel === channel && c.contact === contact),

    deleteOlderThan: (tenantId, cutoff) =>
      remove((c) => c.tenantId === tenantId && c.updatedAt < cutoff.toISOString()),
  };
}
