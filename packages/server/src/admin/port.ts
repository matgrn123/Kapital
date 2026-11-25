/** Une action d'administration à garder en mémoire : qui, quoi, sur quoi, avec quels détails. */
export type EntreeAudit = {
  readonly profileId: string | null;
  readonly action: string;
  readonly cible: string | null;
  readonly details: Readonly<Record<string, unknown>>;
};

export interface JournalAudit {
  enregistrer(entree: EntreeAudit): Promise<void>;
}

/** Refus d'une action d'administration, avec le code HTTP à renvoyer. */
export class ErreurAdmin extends Error {
  constructor(
    message: string,
    readonly statut: 400 | 403 | 409,
  ) {
    super(message);
    this.name = "ErreurAdmin";
  }
}
