import { SurTitre } from "../../../../components/ui";
import { VitrineIso } from "../../../../components/iso/vitrine";

// Vitrine du moteur de rendu isométrique, hors menu (adresse /design/iso).

export default function PageDesignIso() {
  return (
    <div className="flex flex-col gap-5">
      <header>
        <SurTitre>Design V2</SurTitre>
        <h1 className="text-[1.75rem] font-extrabold">Rendu isométrique</h1>
        <p className="mt-1 max-w-[62ch] text-muted">
          Les briques de dessin du village et de l&apos;atelier : textures, lumière par face, ombres douces. Exemples
          d&apos;affichage, pas des chiffres du jeu.
        </p>
      </header>
      <VitrineIso />
    </div>
  );
}
