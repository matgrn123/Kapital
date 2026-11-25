---
name: runcompany
description: Joue à Kapital comme un vrai joueur, sur le site, avec un compte de test dédié (robot-testeur), et vérifie que toutes les fonctionnalités marchent. À utiliser quand on demande de tester le site de bout en bout, de « faire tourner une entreprise », ou après un déploiement.
argument-hint: "[adresse du site] [neuf]"
---

# /runcompany — le robot testeur

Tu es un joueur de Kapital. Tu te connectes au site, tu crées et fais tourner
une entreprise textile en passant par l'interface, et tu notes tout ce qui
marche, tout ce qui casse et tout ce qui est incohérent. À la fin, tu rends un
compte-rendu simple, en français, lisible par quelqu'un qui n'est pas développeur.

Arguments : `$ARGUMENTS`

- Une adresse (`https://…` ou `http://localhost:3000`) : le site à tester.
  Sans adresse : `https://kapital-six.vercel.app` (le site en ligne, branche main).
  Pour tester un ticket pas encore fusionné, viser l'adresse de prévisualisation
  de sa branche (`vercel alias ls`) ou le site local.
- `neuf` : supprimer la société du robot et repartir de zéro. Sans `neuf`, le
  robot reprend sa société là où il l'avait laissée (utile pour vérifier ce qui
  a mûri entre-temps : production terminée, salaires et loyers payés, ventes).

## Règles à ne jamais enfreindre

- Jouer uniquement avec le compte `robot-testeur`. Si la barre latérale affiche
  « LVMH » ou un autre pseudo que `robot-testeur`, **arrêter tout de suite** :
  la session n'a pas pris, ne rien cliquer.
- Ne jamais utiliser les actions d'administration (avancer le temps, mettre le
  monde à jour, approvisionner). Le temps est commun à tous les joueurs. Le robot
  vérifie seulement que les pages admin lui sont **refusées**.
- Ne rien écrire en base directement. Les outils Supabase servent à **lire**
  pour recouper ce que l'écran affiche, jamais à corriger.
- Ne pas corriger le code pendant le test. On constate, on rapporte.
- Ne jamais afficher ni recopier dans le compte-rendu le contenu de
  `.playwright/robot-session.json` (c'est une session de connexion).

## 1. Préparer le compte

Depuis la racine du dépôt :

```bash
npm run compte-robot -w tools/supabase -- --site <adresse> [--neuf]
```

Le script crée le compte s'il manque, ouvre une session et écrit les cookies dans
`.playwright/robot-session.json`. Il affiche l'état de la société (ou `null`).

## 2. Se connecter

Le site n'a pas de page de connexion : sans session, il connecte le visiteur au
compte partagé LVMH. Il faut donc poser les cookies du robot **avant** la
première visite.

1. Charger les outils du navigateur Playwright (`mcp__playwright__*`) en un seul
   ToolSearch.
2. Lire `.playwright/robot-session.json`, puis avec
   `mcp__playwright__browser_run_code_unsafe` :
   `async (page) => { await page.context().clearCookies(); await page.context().addCookies([...cookies du fichier...]); }`
3. Aller sur `<adresse>/jeu` et vérifier l'identité (pseudo `robot-testeur` en
   bas de la barre latérale, ou l'écran « Compte sans entreprise »).

Si l'adresse est une prévisualisation Vercel protégée (page de connexion
Vercel), utiliser le skill `vercel:access-protected-vercel-deployment`.

## 3. Créer la société si besoin

S'il n'y a pas encore de société (« Compte sans entreprise ») et qu'aucune page
ne propose d'en créer une, appeler la vraie route depuis la page :

```js
await fetch("/api/actions/creer-societe", { method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ nom: "Robot Testeur", gamme: "entree" }) })
```

Noter dans le compte-rendu que la création n'a pas d'écran (si c'est toujours le cas).
Tester aussi qu'une deuxième création est refusée (« Vous avez déjà une société »).

## 4. Jouer et vérifier

Avant de jouer, relever la liste réelle des écrans et des actions, car elle
évolue à chaque ticket :

- écrans : `apps/web/app/(authentifie)/**/page.tsx` et la barre latérale ;
- actions : `apps/web/app/api/actions/*/route.ts` ;
- ce qui est attendu : `docs/cahier-des-charges-v1.md` (critères d'acceptation)
  et `packages/content/parametres-v1.json` (les chiffres).

Puis jouer dans l'ordre d'un vrai joueur, **par l'interface** (clics et
formulaires ; un appel direct à une route seulement si aucun écran n'existe, et
le signaler). Ordre indicatif :

1. Tableau de bord : société, étape, trésorerie, horloge qui avance.
2. Banque : demander un prêt raisonnable ; puis un prêt démesuré (refus chiffré attendu).
3. Atelier : louer un local (dépôt de garantie, loyer) ; ou l'acheter à crédit si l'étape le permet.
4. Salariés : embaucher ; plus tard licencier (indemnité affichée).
5. Achats : commander de la matière, commander chez le grossiste.
6. Produits et prix : ajouter un produit, fixer un prix.
7. Atelier : lancer une production.
8. Marketing : lancer une action.
9. Finances : bilan, compte de résultat, indicateurs.
10. Missions, Marché, Classement, Vue 3D, Atelier 3D : les écrans s'ouvrent et affichent des données.
11. Pages `/admin` et `/admin/cockpit` : doivent être refusées au robot.

Pour **chaque écran** :
- la page s'ouvre sans message d'erreur ;
- pas d'erreur dans la console (`browser_console_messages`) ni de réponse 4xx/5xx
  inattendue (`browser_network_requests`) ;
- les montants sont lisibles (euros, pas de `NaN`, `undefined`, centimes bruts).

Pour **chaque action** :
- noter la trésorerie avant, faire l'action, noter la trésorerie après : l'écart
  doit correspondre au coût annoncé à l'écran ;
- l'effet apparaît là où un joueur le chercherait (le salarié dans la liste, le
  prêt à la banque, le stock aux achats…) ;
- tester aussi un cas refusé (pas assez d'argent, étape trop basse, valeur
  absurde ou négative) : le site doit refuser avec un message clair, pas planter ;
- après les actions, dans Finances : **actif = passif**. Un écart est un bug grave.

Les effets qui demandent du temps de jeu (fin de production, paie de fin de
mois, ventes) ne se vérifient pas dans la même séance : les marquer « en
attente » avec l'heure réelle à laquelle ils devraient être visibles (1 jour
réel = 1 mois de jeu ; l'horloge est sur `/api/monde/horloge`). Si la société
existait déjà au début de la séance, commencer par vérifier les « en attente »
de la séance précédente.

Une action bloquée par l'étape du joueur n'est pas un bug si le message
l'explique : la noter « verrouillée (étape N) ».

Prendre une capture d'écran (`browser_take_screenshot`) pour chaque problème,
dans le dossier temporaire de la session.

## 5. Compte-rendu

Répondre en français simple, dans cet ordre :

1. **Verdict en une phrase** : tout marche / N problèmes, dont M bloquants.
2. **Tableau** : une ligne par fonctionnalité — état (✅ marche, ❌ cassé,
   ⚠️ incohérent, 🔒 verrouillé par l'étape, ⏳ en attente du temps) et ce qui a
   été observé.
3. **Problèmes**, du plus grave au moins grave : ce que j'ai fait, ce que
   j'attendais, ce que j'ai vu, la capture, et si possible le fichier concerné.
4. **État de la société du robot** à la fin (étape, trésorerie, salariés, prêts)
   et ce qu'il faudra vérifier à la prochaine séance.

Site testé, date et heure, et commit déployé si connu, en tête du compte-rendu.
Fermer le navigateur à la fin (`browser_close`).
