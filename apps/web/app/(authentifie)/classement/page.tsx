import { redirect } from "next/navigation";

// Le classement est affiché sur l'écran Missions (« Missions et classement »).
export default function PageClassement(): never {
  redirect("/missions");
}
