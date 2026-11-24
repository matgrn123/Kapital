import type { EntreeAudit, JournalAudit } from "./port.js";

/** Journal d'audit en mémoire, pour les tests. */
export class JournalAuditMemoire implements JournalAudit {
  readonly entrees: EntreeAudit[] = [];
  async enregistrer(entree: EntreeAudit): Promise<void> {
    this.entrees.push(entree);
  }
}
