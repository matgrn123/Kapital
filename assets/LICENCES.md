# Registre des licences — modèles 3D

Tous les modèles 3D utilisés dans Kapital doivent figurer ici, avec leur source et leur licence.
Seuls les modèles listés ci-dessous peuvent être committés dans `apps/web/public/models/`.

## Quaternius — Downtown City MegaKit

- **Licence** : CC0 (domaine public, aucune restriction d'usage)
- **Source** : https://quaternius.com/packs/downtowncitymegakit.html
- **Version téléchargée** : Standard (sans textures), export glTF (Godot)
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

---

*Ce fichier est mis à jour à chaque ajout de modèle. Ne pas committer de modèle sans l'enregistrer ici.*
