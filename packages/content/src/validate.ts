export type ParametreValue = {
  valeur: number;
  unite: string;
  source: string;
  date: string;
};

export type Parametres = Record<string, ParametreValue>;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

const CHAMPS_REQUIS = ["valeur", "unite", "source", "date"] as const;
type ChampRequis = (typeof CHAMPS_REQUIS)[number];

function estObjetSimple(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function dateIsoExiste(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const annee = Number(m[1]);
  const mois = Number(m[2]);
  const jour = Number(m[3]);
  const dt = new Date(Date.UTC(annee, mois - 1, jour));
  return (
    dt.getUTCFullYear() === annee &&
    dt.getUTCMonth() === mois - 1 &&
    dt.getUTCDate() === jour
  );
}

export function validateParametres(data: unknown): Parametres {
  if (!estObjetSimple(data)) {
    throw new ValidationError(
      "Le fichier de paramètres doit être un objet JSON (pas une liste, pas null).",
    );
  }

  const resultat: Parametres = {};

  for (const [cle, brut] of Object.entries(data)) {
    if (!estObjetSimple(brut)) {
      throw new ValidationError(
        `Paramètre "${cle}" : doit être un objet { valeur, unite, source, date }.`,
      );
    }

    for (const champ of CHAMPS_REQUIS) {
      if (!(champ in brut)) {
        throw new ValidationError(
          `Paramètre "${cle}" : champ "${champ}" manquant.`,
        );
      }
    }

    const champsEnTrop = Object.keys(brut).filter(
      (k) => !(CHAMPS_REQUIS as readonly string[]).includes(k),
    );
    if (champsEnTrop.length > 0) {
      throw new ValidationError(
        `Paramètre "${cle}" : champ inattendu "${champsEnTrop.join(", ")}" (seuls ${CHAMPS_REQUIS.join(", ")} sont autorisés).`,
      );
    }

    const valeur = brut["valeur"];
    const unite = brut["unite"];
    const source = brut["source"];
    const date = brut["date"];

    if (typeof valeur !== "number" || !Number.isFinite(valeur)) {
      throw new ValidationError(
        `Paramètre "${cle}" : valeur doit être un nombre fini.`,
      );
    }
    if (typeof unite !== "string" || unite.trim() === "") {
      throw new ValidationError(
        `Paramètre "${cle}" : unite doit être une chaîne non vide.`,
      );
    }
    if (typeof source !== "string" || source.trim() === "") {
      throw new ValidationError(
        `Paramètre "${cle}" : source doit être une chaîne non vide.`,
      );
    }
    if (typeof date !== "string" || !dateIsoExiste(date)) {
      throw new ValidationError(
        `Paramètre "${cle}" : date doit être au format AAAA-MM-JJ et exister.`,
      );
    }
    if (unite.includes("centimes") && !Number.isInteger(valeur)) {
      throw new ValidationError(
        `Paramètre "${cle}" : valeur en centimes doit être un entier (reçu ${valeur}).`,
      );
    }

    resultat[cle] = { valeur, unite, source, date };
  }

  return resultat;
}

export type { ChampRequis };
