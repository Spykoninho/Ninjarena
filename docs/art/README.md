# Direction artistique — Ninjarena

La [bible graphique 1.6](BIBLE-GRAPHIQUE.md) fixe les palettes, silhouettes, conventions de perspective, animations et signaux de combat. Les recettes pixel art sont désormais partagées entre la planche et le jeu.

## Ouvrir

Depuis la racine du dépôt, lancer `pnpm dev`, puis ouvrir [le jeu](http://localhost:5173/). Créer un salon, rejoindre avec un second navigateur, préparer les deux joueurs et démarrer. La map par défaut est **Cour des berges** ; Arena et l’éditeur restent disponibles.

Pour la [planche artistique](reference/index.html), lancer `python3 -m http.server 8768 --bind 127.0.0.1`, puis ouvrir [la référence](http://127.0.0.1:8768/docs/art/reference/index.html). Un serveur HTTP est nécessaire aux imports des recettes partagées. Les neuf planches s’exportent en PNG natif.

## Intégration 1.4

- Vue logique 640 × 360, deux pixels artistiques par unité physique, affichage entier nearest-neighbor et caméra limitée à la map.
- Sol minéral varié, pavage explicite sans trous aléatoires, herbe et feuilles, eau animée avec berges et coins concaves, pont raccordé, arbres à canopée séparée, bâtiments regroupés et murs visibles.
- Aucun rocher décoratif ajouté aux couloirs : les objets bloquants viennent des données de la map. Une tile de rocher reste disponible comme étude de matière.
- Personnages composés des six couches, quatre directions, idle, marche liée à la distance, dash, attaque, cast, hit et mort ; variantes de tenues déterministes par joueur.
- Télégraphes alimentés par les rayons, portées, délais et obstacles du gameplay. Impacts, dégâts, afterimages, portails, statuts et boucliers suivent les événements du jeu.
- HUD avec icônes, coûts, raccourcis, disponibilité et cooldowns ; repères d’équipe indépendants des tenues ; réglages eau animée, flashes et secousses mémorisés.
- Éditeur raccordé aux matières du renderer et aperçu des tiles à leur échelle native.

## Sources à conserver ensemble

- `packages/client/src/rendering/art/nativeArt.js` : palette et recettes des sprites, arbres et études. La planche importe ce fichier directement.
- `terrainArt.ts`, `buildingArt.ts`, `spriteArt.ts` : matières raccordables, bâtiments et poses mises en cache par le jeu.
- `mapArt.ts`, `entityLayer.ts`, `telegraphArt.ts`, `effectsLayer.ts` : assemblage, profondeur et rendu des états de gameplay.
- `packages/content/src/maps/cour-des-berges.json` : géométrie jouable, sols, obstacles et spawns.

Les textures sont générées à taille native et mises en cache, pas chargées depuis un atlas PNG externe. Le rig propose les six couches ; un écran de customisation et sa persistance réseau restent une fonctionnalité distincte. Les exemples de piège et de technique céleste dans la bible restent des briefs pour de futures capacités, sans inventer ces mécaniques dans le jeu actuel.

La recette multijoueur à grande charge, l’équilibrage de la nouvelle arène et les essais d’accessibilité avec des joueurs restent nécessaires avant une mise en production publique.

## Relief 1.5

Ombres portées des arbres, murs et bâtiments, toit à pans et avant-toit ombré, buissons solides, tapis d’herbe plus dense, sol minéral à grandes variations continues, cuvettes traversables et rides de sable. Le vent anime ponctuellement les herbes et le sable. `landscapeArt.js` contient les nouvelles recettes partagées. L’éditeur expose la tile **bush** ; les buissons de la Cour des berges sont placés explicitement dans sa map.

## Perspective 1.6

Les bâtiments utilisent désormais deux versants de toit en profondeur, un faîtage orienté arrière-avant, un pignon vertical et un porche projeté devant la façade. Les arbres montrent une large couronne vue du dessus et un tronc court. `volumeArt.js` est la source commune au renderer et à la planche. Avec `pnpm dev`, ouvrir [l’aperçu dans le moteur](http://localhost:5173/art-review.html) pour examiner ces volumes sans devoir réunir deux joueurs. Cette page est un outil local de revue artistique, pas un mode de jeu.
