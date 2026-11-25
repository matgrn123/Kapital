// Ancien emplacement (lot 4) : les composants vivent désormais dans
// components/ui/formulaire.tsx. Ces alias gardent les écrans existants intacts ;
// les nouveaux écrans importent directement depuis formulaire.tsx.

export {
  BandeauEtape,
  CLASSE_SAISIE as classeChamp,
  EnTete as EnTeteEcran,
  Ligne as LigneValeur,
  Message,
  Note as NoteMoteur,
  Options,
  Resultat,
} from "./formulaire";

export const classeEtiquette = "block text-[0.84rem] font-semibold";
