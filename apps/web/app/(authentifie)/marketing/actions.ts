// Les quatre actions marketing du cahier des charges, avec leur libellé lisible.
import type { TypeActionMarketing } from "../../../lib/apercus";

export const ACTIONS: ReadonlyArray<{ type: TypeActionMarketing; libelle: string; desc: string }> = [
  { type: "publicite", libelle: "Publicité", desc: "Fait connaître ta marque : monte la notoriété." },
  { type: "image_marque", libelle: "Image de marque", desc: "Donne envie : monte la désirabilité." },
  { type: "promotion", libelle: "Promotion", desc: "Attire du monde, mais abîme la désirabilité." },
  { type: "relations_presse", libelle: "Relations presse", desc: "Monte les deux jauges, plus modérément." },
];
