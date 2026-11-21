# Recette générale V1 — module Entrepreneur textile

Document de recette à faire tourner avec 5 à 10 testeurs pendant 2 semaines.
Critère T24 : pas de bug bloquant, retours notés.

## Avant d'ouvrir la recette

- [ ] Toutes les migrations Supabase sont appliquées en production (`npx supabase migration list --remote`).
- [ ] `pg_cron` est activé (Dashboard Supabase → Database → Extensions → `pg_cron` = enabled). À défaut, vérifier que le cron Vercel `vercel.json` est actif (Dashboard Vercel → Project → Settings → Cron Jobs).
- [ ] La variable `CRON_SECRET` est renseignée côté Vercel (Settings → Environment Variables).
- [ ] La confirmation d'email est configurée au choix : désactivée pour la recette (plus rapide pour les testeurs), ou activée avec SMTP fiable.
- [ ] La page d'accueil `/` affiche bien les boutons Créer un compte / Se connecter.

## Inscrire un testeur

1. Envoyer au testeur :
   - Le lien de l'application
   - Son rôle de testeur (durée, retours attendus, comment signaler un bug)
   - Le lien pour donner un retour (voir « Recueil des retours »)

## Parcours à vérifier

### Inscription et création d'entreprise
- [ ] Créer un compte avec un pseudo neuf → arrivée sur `/creer-entreprise`
- [ ] Créer un compte avec un pseudo déjà pris → le trigger suffixe automatiquement, pas d'erreur bloquante
- [ ] Nommer l'entreprise, choisir une gamme → arrivée sur le tableau de bord avec trésorerie = capital de départ
- [ ] L'écriture d'apport initial (compte 512 / 101) est bien dans les dernières écritures
- [ ] Les 3 missions sont initialisées dans `/missions` en « À faire »

### Produits et prix
- [ ] Choisir un produit depuis le catalogue, fixer un prix TTC
- [ ] La simulation de marge brute s'affiche avant validation
- [ ] Modifier le prix d'un produit déjà choisi, la décision est bien appliquée

### Achats de matières
- [ ] Commander de la matière chez un fournisseur → événement de livraison planifié
- [ ] Vérifier que la livraison arrive à la bonne date jeu et crée la dette fournisseur en compta
- [ ] Impossible de commander sans trésorerie suffisante

### Atelier et façonniers
- [ ] Passer une production façonnier → événement de fin de production
- [ ] La fin de production crée bien le stock de produits finis
- [ ] L'atelier français coûte environ 20 € / t-shirt, le façonnier portugais 8 à 11 €

### Salariés
- [ ] Embauche : création d'une ligne employé, salaire en compta chaque mois
- [ ] Licenciement : indemnités en compta, employé retiré

### Marketing
- [ ] Lancer une action marketing → impact visible sur la marque

### Banque et prêts
- [ ] Demander un prêt → échéancier affiché
- [ ] Les échéances passent automatiquement (amortissement + intérêts)

### Finances
- [ ] Le bilan, le compte de résultat et le tableau de trésorerie s'affichent
- [ ] Actif = Passif (critère essentiel)
- [ ] Les bulles d'aide expliquent chaque indicateur

### Missions
- [ ] Mission 1 se valide après 50 pièces vendues en marge positive
- [ ] Mission 2 se valide après 6 mois sans découvert
- [ ] Mission 3 se valide quand le CA mensuel double sans découvert

### Classement
- [ ] La page classement liste les entreprises par valeur
- [ ] Le dernier calcul affiché date de moins de 30 minutes
- [ ] Le classement contient les PNJ en plus des joueurs

### Robustesse
- [ ] Se déconnecter, revenir plus tard : l'entreprise a avancé
- [ ] Passer plusieurs jours sans se connecter : les charges ont bien couru, les événements programmés se sont déclenchés

## Recueil des retours

Mettre en place une des options suivantes :

**Option simple** : adresse mail dédiée (`kapital-recette@…`) ou lien `mailto:` dans le pied de nav latérale. Chaque retour est copié dans un document partagé.

**Option recommandée** : un Google Form avec champs
- Type (bug / idée / confusion)
- Parcours concerné
- Ce qui s'est passé
- Ce qui était attendu
- Capture d'écran (optionnel)

Puis coller le lien du formulaire dans le pied de la nav latérale (`apps/web/app/(authentifie)/layout.tsx`).

## Clôture de la recette

- [ ] Agréger les retours par thème (bug, UX, règle de jeu)
- [ ] Trier par criticité (bloquant / gênant / idée)
- [ ] Trancher : correction avant lancement public vs ticket V2
- [ ] Documenter les décisions dans un nouveau fichier `docs/retours-recette-v1.md`
