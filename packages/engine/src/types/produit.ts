import type {
  Centimes,
  IdMatiere,
  IdProduit,
  Minutes,
} from "./primitifs.js";

export type TypeProduit = "t_shirt" | "chemise" | "sac_toile";

export type TypeMatiere =
  | "jersey_coton"
  | "popeline"
  | "toile_coton"
  | "fournitures";

export type UniteMatiere = "metre" | "lot";

export type Matiere = {
  readonly id: IdMatiere;
  readonly type: TypeMatiere;
  readonly nom: string;
  readonly unite: UniteMatiere;
};

export type Produit = {
  readonly id: IdProduit;
  readonly type: TypeProduit;
  readonly nom: string;
  readonly matiere: IdMatiere;
  readonly consommationParPiece: number;
  readonly fournituresParPiece: Centimes;
  readonly tempsStandard: Minutes;
};
