import { describe, expect, it } from "vitest";
import { chargerModulesV1, chargerParametresV1 } from "@kapital/content";
import { centimes, coefficientsSalairesDepuisParametres, coutEmployeur } from "@kapital/engine";
import { empriseModule, resumeProduction, type ModulePlace, type SalarieAtelier } from "./plan";
import { casesAllee, chiffresFiche, placerSalaries, trierPostes, type PosteAtelier } from "./salaries";

const catalogue = chargerModulesV1();
const parametres = chargerParametresV1();
const atelier = { largeur: 10, hauteur: 5, entree_x: 0, entree_y: 3 };
const typePoste = catalogue.find((m) => m.effet.type === "poste_artisan")!;

function postesDe(plan: ModulePlace[]): PosteAtelier[] {
  return plan.map((m) => ({ emprise: empriseModule(m, catalogue)!, nom: typePoste.nom }));
}

function placer(plan: ModulePlace[], salaries: SalarieAtelier[]) {
  const resume = resumeProduction(plan, salaries, catalogue, parametres);
  const postes = postesDe(plan);
  return placerSalaries({ salaries, auPoste: resume.auPoste, postes, atelier, occupees: postes.map((p) => p.emprise) });
}

const artisan = (id: string, experienceMois = 0): SalarieAtelier => ({ id, poste: "artisan", experienceMois });

describe("salariés dans l'atelier (3D-6)", () => {
  it("chaque salarié recruté apparaît une fois, à un poste existant quand il y en a un", () => {
    const plan: ModulePlace[] = [
      { module_type_id: typePoste.id, x: 5, y: 1, pivote: false },
      { module_type_id: typePoste.id, x: 3, y: 1, pivote: false },
    ];
    const salaries = [artisan("a"), artisan("b")];
    const places = placer(plan, salaries);
    expect(places.map((p) => p.id).sort()).toEqual(["a", "b"]);
    const emprises = postesDe(plan).map((p) => p.emprise);
    for (const p of places) expect(emprises).toContainEqual(p.poste!.emprise);
    // Deux salariés, deux postes différents.
    expect(new Set(places.map((p) => p.poste!.emprise.x)).size).toBe(2);
  });

  it("rattachement stable : premier embauché au premier poste (fond puis gauche), quel que soit l'ordre du plan", () => {
    const p1: ModulePlace = { module_type_id: typePoste.id, x: 3, y: 1, pivote: false };
    const p2: ModulePlace = { module_type_id: typePoste.id, x: 5, y: 1, pivote: false };
    const salaries = [artisan("premier"), artisan("second")];
    const a = placer([p1, p2], salaries);
    const b = placer([p2, p1], salaries);
    expect(a).toEqual(expect.arrayContaining(b));
    expect(a.find((s) => s.id === "premier")!.poste!.emprise.x).toBe(3);
    expect(a.find((s) => s.id === "second")!.poste!.emprise.x).toBe(5);
  });

  it("un artisan sans poste est dessiné dans l'allée, sur une case libre, et sa fiche le sait", () => {
    const plan: ModulePlace[] = [{ module_type_id: typePoste.id, x: 3, y: 1, pivote: false }];
    // Le moteur met au poste le plus expérimenté.
    const places = placer(plan, [artisan("debutant", 0), artisan("ancien", 12)]);
    expect(places.find((s) => s.id === "ancien")!.poste).not.toBeNull();
    const attente = places.find((s) => s.id === "debutant")!;
    expect(attente.poste).toBeNull();
    const e = empriseModule(plan[0]!, catalogue)!;
    const cx = Math.floor(attente.x) + 1;
    const cy = Math.floor(attente.y) + 1;
    expect(cx >= e.x && cx < e.x + e.w && cy >= e.y && cy < e.y + e.d).toBe(false);
  });

  it("l'encadrement n'occupe pas de poste de couture : il est dans l'allée", () => {
    const plan: ModulePlace[] = [{ module_type_id: typePoste.id, x: 3, y: 1, pivote: false }];
    const places = placer(plan, [{ id: "chef", poste: "encadrement", experienceMois: 30 }]);
    expect(places).toHaveLength(1);
    expect(places[0]!.poste).toBeNull();
  });

  it("l'allée commence près de l'entrée et évite les modules", () => {
    const cases = casesAllee(atelier, [{ x: 1, y: 3, w: 1, d: 1 }]);
    expect(cases[0]).toEqual({ x: 1, y: 2 });
    expect(cases).not.toContainEqual({ x: 1, y: 3 });
    expect(cases).toHaveLength(atelier.largeur * atelier.hauteur - 1);
  });

  it("trie les postes du fond vers l'avant puis de gauche à droite", () => {
    const p = (x: number, y: number): PosteAtelier => ({ emprise: { x, y, w: 1, d: 1 }, nom: "" });
    expect(trierPostes([p(4, 2), p(6, 1), p(2, 1)]).map((q) => [q.emprise.x, q.emprise.y])).toEqual([[2, 1], [6, 1], [4, 2]]);
  });

  it("la fiche reprend le coût employeur et le rendement du moteur", () => {
    const brut = parametres["smic_mensuel_brut"]!.valeur; // déjà en centimes
    const c = chiffresFiche({ id: "a", poste: "artisan", experienceMois: 0, depuis: "2026-01-01", ancienneteMois: 0, salaireBrutCentimes: brut }, parametres);
    expect(c.coutEmployeurCentimes).toBe(coutEmployeur({ ...coefficientsSalairesDepuisParametres(parametres), salaireBrutMensuel: centimes(brut) }));
    expect(c.rendement).toBe(parametres["rendement_atelier_min"]!.valeur);
    expect(c.rendementDebutant).toBe(parametres["rendement_atelier_min"]!.valeur);
    const ancien = chiffresFiche({ id: "a", poste: "artisan", experienceMois: 24, depuis: "2026-01-01", ancienneteMois: 24, salaireBrutCentimes: brut }, parametres);
    expect(ancien.rendement).toBeGreaterThan(c.rendement);
    expect(ancien.rendement).toBeLessThanOrEqual(ancien.rendementMax);
  });
});
