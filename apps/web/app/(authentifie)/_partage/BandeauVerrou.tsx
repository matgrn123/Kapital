import { phraseCondition } from "./reponses";
import type { VerrouAffiche } from "./verrou";

/** Bandeau « pas encore débloqué » : dit l'étape requise et ce qu'il manque, chiffres à l'appui. */
export function BandeauVerrou({ verrou, action }: { verrou: VerrouAffiche; action: string }) {
  return (
    <div
      role="note"
      className="rounded-md border border-[color:var(--color-g-300)] bg-[color:var(--color-g-100)] px-5 py-4 text-sm"
    >
      <p className="font-medium">
        {action} se débloque à l'étape {verrou.etapeRequise} (vous êtes à l'étape {verrou.etapeActuelle}).
      </p>
      {verrou.conditions.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[color:var(--color-g-700)]">
          {verrou.conditions.map((c) => {
            const p = phraseCondition(c);
            return <li key={c.cle}>{p.charAt(0).toUpperCase() + p.slice(1)}</li>;
          })}
        </ul>
      )}
    </div>
  );
}
