import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { ErreurSociete } from "@kapital/engine";
import { creerSocieteJoueur } from "./creation.js";

function faux(retour: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn().mockResolvedValue(retour);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe("creerSocieteJoueur", () => {
  it("appelle la fonction atomique avec le capital des paramètres, jamais celui du navigateur", async () => {
    const { client, rpc } = faux({ data: "id-societe", error: null });
    const r = await creerSocieteJoueur(client, { ownerId: "u1", nom: " Maison  Test ", gamme: "milieu" });
    expect(r).toEqual({ companyId: "id-societe", capitalCentimes: 2_000_000 });
    expect(rpc).toHaveBeenCalledWith("creer_societe", {
      p_owner: "u1",
      p_nom: "Maison Test",
      p_gamme: "milieu",
      p_capital_centimes: 2_000_000,
    });
  });

  it("refuse un nom vide sans toucher à la base", async () => {
    const { client, rpc } = faux({ data: null, error: null });
    await expect(creerSocieteJoueur(client, { ownerId: "u1", nom: "  ", gamme: "milieu" })).rejects.toThrow(
      ErreurSociete,
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("remonte l'erreur de la base (par exemple société déjà existante)", async () => {
    const { client } = faux({ data: null, error: { message: "societe_existante" } });
    await expect(creerSocieteJoueur(client, { ownerId: "u1", nom: "Maison", gamme: "haut" })).rejects.toThrow(
      "societe_existante",
    );
  });
});
