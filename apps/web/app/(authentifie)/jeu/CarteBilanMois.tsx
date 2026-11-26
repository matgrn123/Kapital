import { BoutonLien, Carte } from "../../../components/ui";
import type { Debrief } from "../../../lib/debrief";

// Carte « Bilan du mois » : trois phrases composées par lib/debrief.ts à partir de la
// clôture enregistrée dans le journal (ce qui s'est passé, pourquoi, quoi essayer).

export function CarteBilanMois({ mois, debrief }: { mois: number; debrief: Debrief }) {
  const phrases = [
    { titre: "Ce qui s'est passé", texte: debrief.quoi },
    { titre: "Pourquoi", texte: debrief.pourquoi },
    { titre: "À essayer", texte: debrief.essayer },
  ];
  return (
    <Carte surTitre={`Mois ${mois} clos`} titre="Bilan du mois">
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {phrases.map((p, i) => (
          <li key={p.titre} className="flex items-start gap-2.5 text-[0.86rem]">
            <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-accent-soft text-[0.75rem] font-bold text-accent">
              {i + 1}
            </span>
            <span>
              <b className="block text-[0.78rem] uppercase tracking-[0.06em] text-muted">{p.titre}</b>
              {p.texte}
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex justify-end">
        <BoutonLien href={debrief.lien.href} petit>
          {debrief.lien.libelle} →
        </BoutonLien>
      </div>
    </Carte>
  );
}
