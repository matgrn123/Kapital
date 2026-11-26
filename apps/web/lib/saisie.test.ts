import { describe, expect, it } from "vitest";
import { lireSaisie, texteSaisie } from "./saisie";

describe("lireSaisie en euros (valeur en centimes)", () => {
  const bornes = { min: 1000, max: 5000 };
  it("lit un prix au centime près, virgule ou point", () => {
    expect(lireSaisie("29,90", "euros", bornes)).toEqual({ valeur: 2990, ramenee: false });
    expect(lireSaisie("30.5", "euros", bornes)).toEqual({ valeur: 3050, ramenee: false });
    expect(lireSaisie("19,93", "euros", bornes)).toEqual({ valeur: 1993, ramenee: false });
  });
  it("ramène une saisie hors bornes à la borne la plus proche, et le signale", () => {
    expect(lireSaisie("5", "euros", bornes)).toEqual({ valeur: 1000, ramenee: true });
    expect(lireSaisie("80", "euros", bornes)).toEqual({ valeur: 5000, ramenee: true });
  });
  it("refuse une saisie illisible", () => {
    expect(lireSaisie("", "euros", bornes)).toBeNull();
    expect(lireSaisie("abc", "euros", bornes)).toBeNull();
    expect(lireSaisie("12,345", "euros", bornes)).toBeNull();
  });
});

describe("lireSaisie en nombre entier (pièces, mètres)", () => {
  const bornes = { min: 50, max: 1200 };
  it("lit un entier, espaces de milliers permis", () => {
    expect(lireSaisie("300", "nombre", bornes)).toEqual({ valeur: 300, ramenee: false });
    expect(lireSaisie("1 000", "nombre", bornes)).toEqual({ valeur: 1000, ramenee: false });
  });
  it("ramène aux bornes", () => {
    expect(lireSaisie("10", "nombre", bornes)).toEqual({ valeur: 50, ramenee: true });
    expect(lireSaisie("5000", "nombre", bornes)).toEqual({ valeur: 1200, ramenee: true });
  });
  it("refuse les décimales et le texte", () => {
    expect(lireSaisie("12,5", "nombre", bornes)).toBeNull();
    expect(lireSaisie("-3", "nombre", bornes)).toBeNull();
    expect(lireSaisie("", "nombre", bornes)).toBeNull();
  });
});

describe("texteSaisie", () => {
  it("écrit les centimes en euros, et les nombres en entier", () => {
    expect(texteSaisie(2990, "euros").replace(/\s/g, " ")).toBe("29,90");
    expect(texteSaisie(123456, "euros").replace(/\s/g, " ")).toBe("1 234,56");
    expect(texteSaisie(1500, "nombre").replace(/\s/g, " ")).toBe("1 500");
  });
  it("ce qu'il écrit se relit à l'identique", () => {
    const b = { min: 0, max: 10_000_000 };
    expect(lireSaisie(texteSaisie(123456, "euros"), "euros", b)?.valeur).toBe(123456);
    expect(lireSaisie(texteSaisie(1500, "nombre"), "nombre", b)?.valeur).toBe(1500);
  });
});
