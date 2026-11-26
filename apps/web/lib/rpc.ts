// Appels de fonctions SQL (rpc) pendant une bascule de migration.

/**
 * Vrai quand la base ne connaît pas (encore) la fonction appelée avec ces arguments :
 * PostgREST répond PGRST202. Sert aux routes qui appellent une nouvelle signature
 * (migration 0045) : avant la migration, elles reprennent l'ancienne, sans casser.
 */
export function fonctionAbsente(error: { code?: string | null } | null | undefined): boolean {
  return !!error && error.code === "PGRST202";
}
