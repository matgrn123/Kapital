// Les dix actions marketing, avec leur libellé lisible, rangées en trois familles.
import type { TypeActionMarketing } from "../../../lib/apercus";

export type FamilleAction = "classique" | "influenceurs" | "grands_medias";

export const FAMILLES: ReadonlyArray<{ id: FamilleAction; titre: string; desc: string }> = [
  { id: "classique", titre: "Publicité classique", desc: "Effet connu d'avance, dès quelques euros." },
  { id: "influenceurs", titre: "Influenceurs", desc: "Une publication payée à un créateur : l'effet est incertain." },
  { id: "grands_medias", titre: "Grands médias", desc: "De gros budgets, pour une marque déjà installée." },
];

export const ACTIONS: ReadonlyArray<{ type: TypeActionMarketing; libelle: string; desc: string; famille: FamilleAction }> = [
  { type: "publicite", libelle: "Publicité", desc: "Fait connaître ta marque : monte la notoriété.", famille: "classique" },
  { type: "image_marque", libelle: "Image de marque", desc: "Donne envie : monte la désirabilité.", famille: "classique" },
  { type: "promotion", libelle: "Promotion", desc: "Attire du monde, mais abîme la désirabilité.", famille: "classique" },
  { type: "relations_presse", libelle: "Relations presse", desc: "Monte les deux jauges, plus modérément.", famille: "classique" },
  {
    type: "reseaux_sociaux",
    libelle: "Réseaux sociaux",
    desc: "Publicité ciblée sur Instagram ou Facebook : beaucoup d'affichages, surtout de la notoriété.",
    famille: "classique",
  },
  {
    type: "influenceur_nano",
    libelle: "Petit influenceur",
    desc: "1 000 à 10 000 abonnés, une communauté fidèle : donne surtout envie. Effet assez sûr.",
    famille: "influenceurs",
  },
  {
    type: "influenceur_micro",
    libelle: "Influenceur moyen",
    desc: "10 000 à 100 000 abonnés : notoriété et désirabilité à parts égales. Effet incertain.",
    famille: "influenceurs",
  },
  {
    type: "influenceur_macro",
    libelle: "Gros influenceur",
    desc: "Plus de 100 000 abonnés : fait connaître ta marque, mais c'est un pari, succès ou flop.",
    famille: "influenceurs",
  },
  {
    type: "affichage_metro",
    libelle: "Affichage dans le métro",
    desc: "100 affiches pendant une semaine : énormément de monde voit ta marque.",
    famille: "grands_medias",
  },
  {
    type: "agence_publicite",
    libelle: "Agence de publicité",
    desc: "Elle garde des honoraires, mais mène une campagne complète : le reste du budget porte plus.",
    famille: "grands_medias",
  },
];
