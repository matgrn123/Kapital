import { describe, it, expect } from "vitest";
import { validerFilRouge } from "./fil-rouge.js";

const ok = {
  ecran: "production",
  texte: "Texte historique.",
  source: "Ouvrage, éditeur, année, page",
  url: "https://exemple.org",
  date: "2026-11-25",
};

describe("validerFilRouge", () => {
  it("accepte une liste de textes complets", () => {
    expect(validerFilRouge({ textes: [ok] })).toEqual([ok]);
  });

  it("accepte une liste vide", () => {
    expect(validerFilRouge({ textes: [] })).toEqual([]);
  });

  it("refuse un texte sans source", () => {
    expect(() => validerFilRouge({ textes: [{ ...ok, source: "" }] })).toThrow(/source/);
  });

  it("refuse un texte sans date au format AAAA-MM-JJ", () => {
    expect(() => validerFilRouge({ textes: [{ ...ok, date: "hier" }] })).toThrow(/date/);
  });

  it("refuse un écran inconnu", () => {
    expect(() => validerFilRouge({ textes: [{ ...ok, ecran: "cuisine" }] })).toThrow(/écran/);
  });
});
