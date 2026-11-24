import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Pendant la phase de développement, le site tourne sur un compte partagé
// (LVMH, admin). Tout visiteur sans session est automatiquement connecté
// avec les credentials KAPITAL_DEV_EMAIL / KAPITAL_DEV_PASSWORD (côté serveur
// uniquement). Avant l'ouverture publique, retirer ces variables et restaurer
// la vraie auth.

export async function raffraichirSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options: Record<string, unknown> }>) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const email = process.env.KAPITAL_DEV_EMAIL;
    const password = process.env.KAPITAL_DEV_PASSWORD;
    if (email && password) {
      await supabase.auth.signInWithPassword({ email, password });
    }
  }

  return response;
}
