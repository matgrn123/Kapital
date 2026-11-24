import { redirect } from "next/navigation";

// Phase de développement : pas de page d'accueil publique. Tout visiteur est
// auto-connecté par le middleware sur le compte partagé (voir
// apps/web/lib/supabase/middleware.ts) puis redirigé vers le tableau de bord.

export default function Page() {
  redirect("/jeu");
}
