export type PositionModule = {
  id_type: string;
  x: number;        // 1-indexed, colonne gauche du module
  y: number;        // 1-indexed, ligne haute du module
  pivote: boolean;  // si true : largeur_grille et hauteur_grille sont échangés
};

export type DimensionsModule = {
  id: string;
  largeur_grille: number;
  hauteur_grille: number;
};

export type PlanEtage = {
  largeur: number;
  hauteur: number;
  entree_x: number;
  entree_y: number;
  modules: PositionModule[];
};

export type ErreurPlan =
  | { type: "entree_hors_grille" }
  | { type: "type_inconnu"; id_type: string; index: number }
  | { type: "collision"; index_a: number; index_b: number; id_a: string; id_b: string }
  | { type: "hors_grille"; index: number; id_type: string }
  | { type: "passage_bloque"; index: number; id_type: string };

export type ResultatValidation = {
  valide: boolean;
  erreurs: ErreurPlan[];
};

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

type Rect = { x1: number; y1: number; x2: number; y2: number };

function rectModule(pm: PositionModule, dim: DimensionsModule): Rect {
  const w = pm.pivote ? dim.hauteur_grille : dim.largeur_grille;
  const h = pm.pivote ? dim.largeur_grille : dim.hauteur_grille;
  return { x1: pm.x, y1: pm.y, x2: pm.x + w - 1, y2: pm.y + h - 1 };
}

function rectsSeChevanchent(a: Rect, b: Rect): boolean {
  return a.x1 <= b.x2 && a.x2 >= b.x1 && a.y1 <= b.y2 && a.y2 >= b.y1;
}

// ---------------------------------------------------------------------------
// Fonction principale
// ---------------------------------------------------------------------------

export function validerPlanEtage(
  plan: PlanEtage,
  catalogue: DimensionsModule[],
): ResultatValidation {
  const erreurs: ErreurPlan[] = [];
  const { largeur, hauteur, entree_x, entree_y, modules } = plan;

  // 1. Entrée dans la zone étendue (incluant le couloir -1 autour de la grille)
  if (entree_x < 0 || entree_x > largeur + 1 || entree_y < 0 || entree_y > hauteur + 1) {
    erreurs.push({ type: "entree_hors_grille" });
    return { valide: false, erreurs };
  }

  // Index rapide du catalogue
  const catMap = new Map(catalogue.map((d) => [d.id, d]));

  // Résoudre les dimensions de chaque module placé
  type ModuleResolu = { pm: PositionModule; rect: Rect; index: number };
  const resolus: ModuleResolu[] = [];

  for (let i = 0; i < modules.length; i++) {
    const pm = modules[i]!;
    const dim = catMap.get(pm.id_type);
    if (!dim) {
      erreurs.push({ type: "type_inconnu", id_type: pm.id_type, index: i });
      continue;
    }
    resolus.push({ pm, rect: rectModule(pm, dim), index: i });
  }

  // S'arrêter si des types sont inconnus (les autres vérifications seraient faussées)
  if (erreurs.length > 0) return { valide: false, erreurs };

  // 2. Hors grille
  for (const { pm, rect, index } of resolus) {
    if (rect.x1 < 1 || rect.y1 < 1 || rect.x2 > largeur || rect.y2 > hauteur) {
      erreurs.push({ type: "hors_grille", index, id_type: pm.id_type });
    }
  }

  // 3. Collisions entre paires
  for (let i = 0; i < resolus.length; i++) {
    for (let j = i + 1; j < resolus.length; j++) {
      const a = resolus[i]!;
      const b = resolus[j]!;
      if (rectsSeChevanchent(a.rect, b.rect)) {
        erreurs.push({
          type: "collision",
          index_a: a.index,
          index_b: b.index,
          id_a: a.pm.id_type,
          id_b: b.pm.id_type,
        });
      }
    }
  }

  // Si déjà des erreurs structurelles, le passage bloqué n'est pas pertinent
  if (erreurs.length > 0) return { valide: false, erreurs };

  // 4. Passage bloqué — BFS depuis l'entrée sur la grille étendue
  //    Zone explorée : x ∈ [0, largeur+1], y ∈ [0, hauteur+1]
  //    Cellules bloquées : occupées par un module

  const occupe = new Set<string>();
  for (const { rect } of resolus) {
    for (let gy = rect.y1; gy <= rect.y2; gy++) {
      for (let gx = rect.x1; gx <= rect.x2; gx++) {
        occupe.add(`${gx},${gy}`);
      }
    }
  }

  const atteint = new Set<string>();
  const file: [number, number][] = [[entree_x, entree_y]];
  atteint.add(`${entree_x},${entree_y}`);

  while (file.length > 0) {
    const cell = file.shift()!;
    const [cx, cy] = cell;
    for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]] as [number, number][]) {
      const key = `${nx},${ny}`;
      if (atteint.has(key)) continue;
      if (occupe.has(key)) continue;
      if (nx < 0 || nx > largeur + 1 || ny < 0 || ny > hauteur + 1) continue;
      atteint.add(key);
      file.push([nx, ny]);
    }
  }

  // Chaque module doit avoir au moins une cellule adjacente atteinte
  for (const { pm, rect, index } of resolus) {
    let accessible = false;
    // Bordure haute
    for (let gx = rect.x1; gx <= rect.x2 && !accessible; gx++) {
      if (atteint.has(`${gx},${rect.y1 - 1}`)) accessible = true;
    }
    // Bordure basse
    for (let gx = rect.x1; gx <= rect.x2 && !accessible; gx++) {
      if (atteint.has(`${gx},${rect.y2 + 1}`)) accessible = true;
    }
    // Bordure gauche
    for (let gy = rect.y1; gy <= rect.y2 && !accessible; gy++) {
      if (atteint.has(`${rect.x1 - 1},${gy}`)) accessible = true;
    }
    // Bordure droite
    for (let gy = rect.y1; gy <= rect.y2 && !accessible; gy++) {
      if (atteint.has(`${rect.x2 + 1},${gy}`)) accessible = true;
    }

    if (!accessible) {
      erreurs.push({ type: "passage_bloque", index, id_type: pm.id_type });
    }
  }

  return { valide: erreurs.length === 0, erreurs };
}
