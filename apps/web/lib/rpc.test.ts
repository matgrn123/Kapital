import { describe, expect, it } from "vitest";
import { fonctionAbsente } from "./rpc";

describe("fonctionAbsente", () => {
  it("vrai seulement pour une fonction inconnue de PostgREST (PGRST202)", () => {
    expect(fonctionAbsente({ code: "PGRST202" })).toBe(true);
    expect(fonctionAbsente({ code: "KP409" })).toBe(false);
    expect(fonctionAbsente({ code: null })).toBe(false);
    expect(fonctionAbsente(null)).toBe(false);
    expect(fonctionAbsente(undefined)).toBe(false);
  });
});
