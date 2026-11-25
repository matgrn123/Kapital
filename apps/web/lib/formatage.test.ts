import { describe, expect, it } from "vitest";

// Comme sur Vercel : le serveur tourne en UTC.
process.env.TZ = "UTC";
import { formaterDate, formaterDateHeure } from "./formatage";

// Les pages sont rendues sur le serveur (UTC chez Vercel) : l'heure doit être celle de Paris.
describe("formatage des dates à l'heure de Paris", () => {
  it("affiche 13:44 pour une livraison à 12:44 UTC (heure d'hiver)", () => {
    expect(formaterDateHeure("2026-11-25T12:44:00Z")).toContain("13:44");
  });
  it("affiche 14:44 pour 12:44 UTC en été", () => {
    expect(formaterDateHeure("2026-07-01T12:44:00Z")).toContain("14:44");
  });
  it("change de jour selon Paris, pas selon UTC", () => {
    expect(formaterDate("2026-11-25T23:30:00Z")).toMatch(/^26/);
  });
});
