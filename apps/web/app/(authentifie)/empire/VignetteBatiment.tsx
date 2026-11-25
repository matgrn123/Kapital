"use client";

// Vignette isométrique d'un bâtiment (extérieur seulement), pour « Mon Empire » et le profil public.
// Composant client : SceneIso pose un gestionnaire de survol sur le SVG. Aucun état.

import { SceneIso, Sol } from "../../../components/iso";
import { apparenceBatiment, dimensionsVignette } from "../../../lib/empire";
import { raccourcirEnseigne } from "../../../lib/vue3d";

export function VignetteBatiment({
  categorie,
  nbEtages,
  surfaceM2,
  enseigne,
  titre,
}: {
  categorie: string;
  nbEtages: number;
  surfaceM2: number;
  enseigne: string;
  titre: string;
}) {
  const { w, d } = dimensionsVignette(surfaceM2);
  const marge = 0.7;
  return (
    <div className="overflow-hidden rounded-[10px] border border-line">
      <SceneIso
        titre={titre}
        className="block h-auto w-full"
        sol={<Sol x={-marge} y={-marge} w={w + 2 * marge} d={d + 2 * marge} epaisseur={0.25} couleur="#7C8C6A" />}
        objets={[
          {
            type: "batiment",
            x: 0,
            y: 0,
            w,
            d,
            ...apparenceBatiment(categorie, nbEtages, raccourcirEnseigne(enseigne, 12)),
          },
        ]}
        etendue={{ x: -marge, y: -marge, w: w + 2 * marge, d: d + 2 * marge, h: 3.2, z: -0.25 }}
        marge={12}
      />
    </div>
  );
}
