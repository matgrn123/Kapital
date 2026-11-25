# Registre des licences — modèles 3D

Tous les modèles 3D utilisés dans Kapital doivent figurer ici, avec leur source et leur licence.
Seuls les modèles listés ci-dessous peuvent être committés dans `apps/web/public/models/`.

## Quaternius — Downtown City MegaKit

- **Licence** : CC0 (domaine public, aucune restriction d'usage)
- **Source** : https://quaternius.com/packs/downtowncitymegakit.html
- **Version téléchargée** : Standard, export glTF (Godot) ; les textures PNG référencées par les .gltf sont fournies dans le pack et ajoutées ci-dessous
- **Date d'acquisition** : 2026-11-22

### Modèles utilisés

| Fichier | Usage dans le jeu | Catalogue |
|---------|-------------------|-----------|
| `Building_Small_1.gltf` + `.bin` | Extérieur « Petit atelier » (TypeBatiment `petit_atelier`) | `batiments-v1.json` |
| `Building_Medium_2_001.gltf` + `.bin` | Extérieur « Atelier spécialisé » (TypeBatiment `atelier_specialise`) | `batiments-v1.json` |
| `Building_Large_2.gltf` + `.bin` | Extérieur « Bâtiment industriel » (TypeBatiment `batiment_industriel`) | `batiments-v1.json` |
| `Street_Asphalt_9x9.gltf` + `.bin` | Tuile de sol (scène vue d'ensemble) | — |
| `Sidewalk_Straight_3m.gltf` + `.bin` | Trottoir (scène vue d'ensemble) | — |
| `Sidewalk_Corner_Flat_3m.gltf` + `.bin` | Coin de trottoir (réserve) | — |
| `Street_2Lane.gltf` + `.bin` | Rue (réserve) | — |
| `Prop_Bollard.gltf` + `.bin` | Bollard décoratif (réserve) | — |
| `Prop_Planter_Single.gltf` + `.bin` | Jardinière décorative (réserve) | — |

> Les fichiers « réserve » sont présents dans `public/models/` mais pas encore référencés dans un catalogue.
> Ils peuvent être supprimés s'ils restent inutilisés à la fin du ticket 3D-4.

### Textures utilisées (ajoutées le 2026-11-24)

Les 9 fichiers .gltf référencent par URI relative 23 textures PNG, désormais présentes dans `public/models/` (seules ces 23 ont été copiées, pas le pack complet) :
`T_Concrete_BaseColor`, `T_Concrete_Normal`, `T_Concrete_ORM`, `T_Concrete_Asphalt_BaseColor`, `T_Trim_BaseColor`, `T_Trim_Normal`, `T_Trim_ORM`, `T_RedBrick_BaseColor`, `T_RedBrick_Normal`, `T_RedBrick_ORM`, `T_MarbleFloor_BaseColor`, `T_MarbleFloor_Normal`, `T_MarbleFloor_ORM`, `T_MetalConcrete_BaseColor`, `T_MetalConcrete_Normal`, `T_MetalConcrete_ORM`, `T_Dirt_BaseColor`, `T_Dirt_Normal`, `T_Dirt_ORM`, `T_Street_Decals`, `T_dark_interior`, `T_lit_interior_1`, `T_lit_interior_2` (toutes en `.png`).

- **Provenance** : Quaternius, Downtown City MegaKit (dossier Textures / export glTF Godot), licence CC0.
- **Compression** : originaux 55 Mo au total (2048 px pour la plupart). Réduits avec `sips` en restant en PNG : couleurs et ORM à 1024 px maximum, cartes de normales à 512 px. Poids final : environ 13 Mo pour les 23 textures.

## Kenney — Furniture Pack (1.0)

- **Auteur** : Kenney (www.kenney.nl)
- **Licence** : CC0 1.0 (domaine public), http://creativecommons.org/publicdomain/zero/1.0/ ; vérifiée sur https://kenney.nl/assets/furniture-kit et https://opengameart.org/content/furniture-kit, et dans le fichier `License.txt` du pack
- **Source** : https://opengameart.org/sites/default/files/kenney_furniturePack.zip (page officielle : https://kenney.nl/assets/furniture-kit)
- **Date d'acquisition** : 2026-11-25
- **Conversion** : le pack ne fournit que de l'OBJ/FBX. Les 8 modèles ci-dessous ont été convertis en GLB (couleurs unies du .mtl, sans texture) par un petit script local ; seuls ces 8 fichiers sont dans le dépôt, pas le pack.

### Modèles utilisés (`apps/web/public/models/atelier/`)

| Fichier | Usage dans le jeu (type d'effet du module) |
|---------|--------------------------------------------|
| `tableCross.glb` | Poste d'artisan (`poste_artisan`) |
| `deskCorner.glb` | Poste d'artisan spécialisé (`poste_artisan_specialise`) |
| `tableCloth.glb` | Table de coupe (`table_coupe`) |
| `bookcaseOpen.glb` | Stockage (`stockage`) |
| `desk.glb` | Bureau (`bureau`) |
| `tableRound.glb` | Salle de réunion (`salle_reunion`) |
| `coatRackStanding.glb` | Showroom (`showroom`) |
| `loungeSofa.glb` | Espace pause (`pause`) |

Poids total : environ 115 Ko.

> Note du 2026-11-25 : `Street_Asphalt_9x9` n'est plus affiché dans la vue d'ensemble (remplacé par un socle pelouse + rue dessiné en code) ; il passe en « réserve ».

---

*Ce fichier est mis à jour à chaque ajout de modèle. Ne pas committer de modèle sans l'enregistrer ici.*
