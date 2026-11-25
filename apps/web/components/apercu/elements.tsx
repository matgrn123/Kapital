// Ancien emplacement (lot 4) : les composants vivent désormais dans
// components/ui/formulaire.tsx. Ces alias gardent les écrans existants intacts ;
// les nouveaux écrans importent directement depuis formulaire.tsx.

export {
  CLASSE_SAISIE,
  Champ,
  Choix,
  EnTete,
  Ligne,
  Note as NoteEcriture,
  Refus,
  Succes,
  Tableau,
  Vide,
} from "../ui/formulaire";
