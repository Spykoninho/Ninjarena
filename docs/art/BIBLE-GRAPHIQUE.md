# NINJARENA — Bible graphique

**Version 1.6 · 14 septembre 2026 · Direction intégrée au prototype jouable**

> Des ninjas aux silhouettes compactes affrontent leurs rivaux dans des cours de pierre et des jardins de roseaux. Les étoffes indigo, les attaches de cuivre et les sceaux fendus signent le monde. La couleur décrit les matières ; la forme annonce le danger.

Ce document fixe la référence de production. Les chiffres artistiques sont des cibles de départ, à éprouver en PvP ; ils ne changent pas les règles du jeu existant. La [planche de référence](reference/index.html) contient des dessins pixel par pixel, une scène de combat et un aperçu du HUD. La révision 1.4 intègre leurs recettes au moteur ; les études illustrent aussi des capacités futures et ne sont pas des atlas PNG.

## 1. Résolution de référence

| Élément                        | Convention retenue                                                   |
| ------------------------------ | -------------------------------------------------------------------- |
| Vue logique du combat          | **640 × 360 pixels** au format 16:9                                  |
| Tile                           | **32 × 32 px**                                                       |
| Cellule de personnage standard | **32 × 32 px**                                                       |
| Silhouette courante            | Environ **20 × 28 px**, accessoires compris dans le budget courant   |
| Cellule d’animation étendue    | 64 × 64 px ; même densité de pixels                                  |
| Icône de technique             | 24 × 24 px, affichage ×1 ou ×2 dans le HUD                           |
| Affichage                      | Facteur entier : ×2 = 1280 × 720, ×3 = 1920 × 1080, ×4 = 2560 × 1440 |

32 px permet de séparer masque, mains, vêtements et indicateur avec un dessin de matières et de vêtements plus travaillé. À 16 px, les équipements personnalisés se confondraient ; à 48 ou 64 px, la production et le détail augmenteraient sans avantage prioritaire pour ce PvP. On retient donc la base envisagée.

La zone visible représente 20 × 11,25 tiles. Garder le même champ de vision entre joueurs : letterboxing plutôt qu’un avantage de visibilité sur écran ultralarge. Sous 1280 × 720, proposer ×1 centré ; un mode ajusté non entier est un confort optionnel explicitement moins net. Le HUD garde ses marges à l’intérieur de la vue logique.

**Compatibilité avec le prototype.** Le tileset actuel utilise 16 unités par tile. Retenir **2 pixels artistiques pour 1 unité monde** : `artPosition = worldPosition × 2`, avant le zoom entier d’écran. Une tile garde ses 16 unités, ses tags et ses collisions. La vue de référence couvre donc 320 × 180 unités monde. Les vitesses et rayons restent inchangés. Cette conversion est intégrée au renderer en version 1.4, avec vue fixe et zoom entier. Les graphismes de télégraphes existants doivent subir la même conversion que le décor et les joueurs.

## 2. Pixel scale et fabrication

- Un pixel dessiné devient exactement un pixel de la vue logique. Aucun asset « haute résolution » réduit pour imiter le style.
- Filtrage nearest-neighbor, pas de mipmaps ni d’antialiasing. Pas de lissage CSS des canvas.
- Contour extérieur des acteurs : 1 px encre. Un second pixel clair n’est autorisé que pour le repère du joueur local ou un flash temporaire.
- Dessiner par masses de 2–5 px ; utiliser les pixels isolés pour les yeux, les attaches, les coutures courtes et les étincelles. Pas de dithering systématique, de bruit photo ou de gradients.
- Éclairage commun venant du haut-gauche de l’image. Ombres petites et compactes ; aucun éclairage dynamique ne doit annuler un signal de danger.
- Positions physiques continues. Arrondir uniquement la projection finale dans la grille logique, après soustraction de la caméra ; utiliser la même transformation pour tout le monde. Ne jamais arrondir la simulation.
- Une rotation libre d’un sprite pixel peut changer ses amas de pixels : préférer 16 orientations dessinées/rastérisées à taille native pour les projectiles et 8 poses directionnelles pour les effets allongés. La trajectoire réelle reste à angle libre. Les surfaces de collision sont dessinées depuis leur géométrie exacte sur le canvas logique, sans antialiasing.
- Export PNG RGBA, sRGB, sans redimensionnement ; coordonnées et pivots entiers. Un atlas ne change jamais l’échelle d’un élément.

### Niveau de détail retenu — révision 1.1

Le niveau de détail de la première planche était trop sommaire. La nouvelle cible est un **pixel art artisanal plus riche**, toujours sur une grille native de 32 pixels : volumes construits, bords irréguliers choisis et matières identifiables. Le détail doit décrire la forme, sans devenir un bruit uniforme.

- **Ninjas** : col à plis superposés, revers diagonaux, coutures d’épaule, bandages aux poignets et chevilles, cheveux en trois petites mèches éclairées, attache métallique facettée et étui fermé. Les grands aplats du torse restent lisibles.
- **Végétation** : canopée en bouquets chevauchants, petits groupes de feuilles de 3–5 px, creux ombrés, tronc et racines exposés. Éviter les arbres réduits à une boule uniforme.
- **Architecture** : rangées de tuiles avec joints alternés, fenêtres à croisillons, poutres, ferrures et seuils. Les accents les plus clairs se concentrent sur les arêtes exposées.
- **Pierre et bois** : éclats d’angle, facettes, fissures courtes, veinures regroupées et quelques fixations. Pas de texture répétée à haute fréquence sur toutes les surfaces.
- **Sols et VFX** : conserver de grandes zones calmes et des contours de danger simples. Le budget supplémentaire se porte sur les acteurs et les volumes du décor.

Conserver les rampes de palette existantes et les pivots. Les gros plans de la planche agrandissent les mêmes sprites par facteur entier ; ils ne sont pas des assets d’une autre résolution. Une tenue conserve environ 10–14 couleurs : davantage de dessin ne nécessite pas davantage de teintes.

## 3. Proportions et ancrages

Le ninja est compact, souple, avec une tête importante mais sans proportions de bébé : **tête 11–12 px de haut, torse 9–10 px, jambes visibles 6–7 px** ; les volumes se chevauchent. Tête 12–14 px de large, épaules 18–20 px, pieds séparés. Pas de grands yeux expressifs ni de visage détaillé.

Dans une cellule 32 × 32, origine en haut-gauche : pivot au sol **(16, 29)**, sommet courant vers y=2, pieds à y=28. Le pivot est le centre de référence de la collision, pas le centre de la tête. L’ombre est un disque aplati d’environ 18 × 6 px, dans une couche séparée. Elle n’est ni une hitbox ni un indicateur d’équipe.

Les petites variations morphologiques restent dans ±2 px de largeur ; toutes partagent les mêmes points d’attache et les mêmes collisions. Les grandes morphologies exigeraient un autre rig complet et ne font pas partie du premier lot. Les extensions de tissu n’augmentent jamais la hitbox.

Pour une cellule 64 × 64, déplacer tous les contenus de (+16, +16) et utiliser le pivot **(32, 45)**. Ne pas recentrer visuellement chaque frame : cela ferait flotter le personnage.

## 4. Perspective et construction du monde

Vue orthographique top-down en trois quarts, sans point de fuite, avec axes de déplacement horizontaux et verticaux. Les tiles sont carrées à l’écran. La référence GBA/DS sert à l’organisation lisible des volumes et aux faces visibles, pas à reprendre des sprites ou des architectures identifiables.

Le sol appartient au plan XY ; la hauteur visuelle se projette vers le haut de l’image. Convention de volume : pour un module d’obstacle bas, une emprise 32 × 32 et une élévation visuelle de 16 px. Une face sud est donc visible ; les toits montrent principalement leur surface supérieure. Les lignes du sol restent parallèles aux axes. Pas d’isométrie à losanges.

**Important :** un cercle d’attaque horizontal reste un cercle dans le plan de jeu ; ne pas l’aplatir en ellipse pour « faire perspective ». L’ellipse de l’ombre est un pictogramme de contact, sans valeur de portée.

Trier les objets et les personnages sur la profondeur de leur base (`groundY`), jamais sur le haut de leur image. Scinder un grand bâtiment en base et couverture si nécessaire. La base solide demeure lisible ; un toit ou une canopée peut s’effacer quand il masque un acteur que le joueur a le droit de voir. Aucune silhouette à travers un obstacle ne doit révéler un adversaire caché par les règles du jeu.

## 5. Palette commune

Pas de couleur unique obligatoire pour les costumes. Tous les skins utilisent cependant les mêmes familles de valeurs et des rampes courtes. Palette maîtresse initiale :

| Usage                 | Ombre     | Ton moyen | Lumière   |
| --------------------- | --------- | --------- | --------- |
| Encre / UI            | `#172631` | `#293C49` | `#49616B` |
| Tissu indigo          | `#29334F` | `#465677` | `#7888A0` |
| Pierre sable          | `#777B70` | `#A7AA8B` | `#D1C9A0` |
| Végétation            | `#294F49` | `#47705B` | `#78916A` |
| Eau / toiture pétrole | `#264956` | `#386C78` | `#65949A` |
| Bois / cuivre         | `#63463F` | `#A16C50` | `#CF9565` |
| Peau claire           | `#A76F59` | `#D29A75` | `#ECC49A` |
| Peau foncée           | `#523C39` | `#855844` | `#B7805C` |

Couleurs de signal : ivoire `#F5EDCD`, danger corail `#FF7867`, énergie or `#FFD16A`, électrique cyan `#75DCE4`, contrôle lilas `#BEA0EF`, défense menthe `#92D8B4`. Ces teintes très claires sont principalement réservées au combat et à l’UI. Les petits accents de cuivre du costume utilisent la rampe matière, pas l’or lumineux des attaques.

Budget indicatif : tile de sol 3 couleurs, obstacle 4–6, acteur composé 10–14 hors indicateurs/VFX, effet 3–4. Réutiliser les couleurs entre layers. Une variante de peau ne change ni les yeux, ni les contours, ni la clarté des signaux.

Décor : grandes surfaces de valeur moyenne, texture peu contrastée ; éviter de juxtaposer l’ombre la plus sombre et la lumière la plus claire sur le sol. Acteurs : contour franc et visage/mains séparés du torse. Attaques : petits noyaux lumineux et contours nets. Vérifier en niveaux de gris sur chaque biome ; ces budgets ne remplacent pas un contrôle visuel.

## 6. Silhouette originale : les Veilleurs du Sceau Fendu

Nom de travail pour l’identité du monde, indépendant du nom commercial du jeu.

Trois signatures récurrentes :

1. **Col enveloppant et demi-masque**, qui forment un bloc sombre autour d’une étroite ouverture du visage.
2. **Veste courte à deux pans séparés**, donnant un bas de silhouette fendu et des jambes toujours distinctes.
3. **Attache de cuivre en deux segments décalés**, répétée sur les vêtements, portes et objets rituels ; le « sceau fendu » n’est ni un alphabet ni un texte.

Le casque, la coiffure et le masque peuvent varier. Le col, la coupe à deux pans et la pose ramassée maintiennent l’identité. Éviter l’accumulation chapeau + chevelure volumineuse + cape + arme gigantesque. Un seul accessoire de volume par combinaison.

Les armes évoquent un artisanat original : lame courte à poignée de cuivre, disque à deux encoches opposées, cordon lesté. Aucun bandeau frontal à plaque gravée emblématique, symbole de clan emprunté, nuage rouge sur manteau noir, coiffure ou costume reconnaissable d’une licence. L’originalité vient de la répétition de formes et de matières propres au projet, pas de l’ajout de détails.

## 7. Customisation modulaire

Layers logiques obligatoires : **Body, Clothes, Hair, Headgear, Accessory, Weapon**. Tous partagent l’identifiant de rig, la direction, l’animation, la frame, le pivot et la durée. Le costume ne contient ni ombre, ni HP, ni repère d’équipe.

| Layer     | Contenu                                   | Contrat de compatibilité                                                                  |
| --------- | ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| Body      | Peau, tête, mains, pieds                  | Masques de couverture fournis par les vêtements ; aucune peau peinte dans Clothes         |
| Clothes   | Col, masque textile, veste, pantalon      | Se cale sur les mêmes poignets et chevilles ; 3 tons de tissu + cuivre partagé            |
| Hair      | Masse de cheveux et éventuellement frange | Séparation back/front ; profils de masquage standard                                      |
| Headgear  | Capuche, bande textile, petit chapeau     | Déclare `hairCoverage: none / crown / full` ; pas une liste de combinaisons individuelles |
| Accessory | Cordon court, étui, talisman sans texte   | Back/front, volume limité ; points d’attache communs                                      |
| Weapon    | Arme tenue, optionnelle                   | Main principale et ancre de visée ; aucune modification implicite de portée               |

L’ordre fixe des six layers ne suffit pas : une arme ou une mèche passe devant ou derrière selon la direction. À l’export, les layers logiques peuvent fournir des sous-plans `back` et `front`. Ordre type sud : ombre → Accessory.back → Hair.back → Body → Clothes → Hair.front → Headgear → Accessory.front → Weapon.front. Au nord, arme et mains peuvent passer derrière le torse ; le rig contient la table d’ordre par frame. Clothes fournit les masques qui cachent les zones Body correspondantes. Headgear masque Hair, sans effacer Clothes.

Chaque frame fournit les sockets `head`, `handMain`, `handOff`, `back`, `waist`, `muzzle`. Coordonnées relatives au pivot. Le décalage de marche se propage à tous les layers et sockets. Un socket `muzzle` sert à la présentation ; l’origine physique du projectile reste celle définie par le gameplay. Relier les deux par un très court flash si nécessaire.

**Flip horizontal :** produire Est, dériver Ouest pour les volumes symétriques. Miroiter les sockets autour de l’axe du pivot (`x' = -x` en coordonnées locales), jamais recalculer depuis les limites opaques de l’image. Un accessoire latéral ou une arme qui doit rester dans la même main reçoit une variante Ouest propre. Pas de flip Nord/Sud ; pas de flip de l’éclairage : corriger les highlights asymétriques des layers concernés. Le sceau à deux segments reste abstrait, sans sens de lecture.

Le changement de skin ne peut modifier taille apparente de plus de 2 px, opacité, timing de cast, bord de hitbox ou luminosité maximale. Interdire des couleurs de costume quasi invisibles sur un biome : conserver le contour partagé et une seconde valeur de tissu.

## 8. Environnements, tiles et obstacles

Le monde est construit avec du basalte vert-gris, de la pierre sable, du bois sombre, du cuivre patiné et des toits pétrole. Motif récurrent : deux encoches rectangulaires décalées. Routes dégagées et cours ouvertes ; les détails se regroupent en périphérie et aux pieds des volumes.

| Lieu            | Identité                                                | Protection de la lecture                                                               |
| --------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Village ninja   | Maisons basses, toits pétrole, portes à double encoche  | Façades calmes ; sol sable uniforme dans les voies                                     |
| Forêt           | Canopées en grosses masses, troncs à contreforts        | Touffes interactives séparées des feuillages décoratifs ; couvertures masquables       |
| Temple          | Pierre claire, bandes de cuivre, bassins rectangulaires | Motifs rituels sur les façades, jamais grands cercles lumineux au sol                  |
| Rivière         | Eau en rubans horizontaux peu contrastés, berges nettes | Eau jouable peu profonde ; profondeur interdite matérialisée par une bordure bloquante |
| Pont            | Planches transversales, deux longerons, piles de pierre | Tablier clair, rambardes solides explicitement dessinées                               |
| Dojo            | Bois chaud, murs indigo, nattes rectangulaires          | Trame de nattes discrète ; aucune ligne assimilable à un télégraphe                    |
| Ruines          | Même architecture cassée en modules massifs             | Gravats décoratifs plats ; blocs solides avec face verticale et base sombre            |
| Falaises        | Strates larges, sommet sable et face désaturée          | Rupture continue ; entrée/escalier explicite si traversable                            |
| Terrain rocheux | Dalles larges, quelques fissures groupées               | Ne pas parsemer les voies de cailloux ressemblant à des projectiles                    |

### Finition de la map — révision 1.3

La map doit dépasser le stade de la juxtaposition de tiles simples. La **Cour des berges** devient l’étude d’environnement de référence : dojo à avant-toit profond, cour partiellement pavée, murs usés, végétation en plusieurs étages et rivière continue. Cette direction est proposée après la validation 1.2 des personnages et attaques ; elle ne vaut pas validation d’une map jouable en production.

- **Composition** : petits détails regroupés autour des bâtiments, obstacles et berges. Sol moins texturé au cœur de la mêlée. Éviter les objets identiques espacés mécaniquement.
- **Profondeur** : sommet éclairé, face verticale intermédiaire, ombre de contact sombre et ombre portée vers le bas-droite. Les ombres n’ajoutent ni collision ni effet de terrain.
- **Architecture** : six rangées de toiture avec joints, rive de cuivre, chevrons visibles, façade à croisillons et marches. Les lanternes portent une couleur chaude dans leur matière, sans grand halo permanent.
- **Végétation** : arbres natifs d’environ 64 × 64 px, sans agrandir une tile de 32 px. Plusieurs bouquets de feuilles, racines visibles, arbustes et touffes. Leur densité se concentre aux bordures de la scène.
- **Eau** : rive irrégulière continue, plateau peu profond, nuances plus sombres dans le chenal, pierres immergées, petits rubans d’écume, rides et cascade localisée. Le courant se lit dans le regroupement des traits, pas dans des tirets identiques sur chaque tile. Les différences de profondeur sont ici visuelles ; toute différence de traversabilité devra être signalée séparément.
- **Pont** : ombre sur l’eau, planches individualisées, grain discret, poteaux, assemblages et appuis de pierre. Les rambardes correspondent aux bords bloquants lors de l’intégration.
- **Variation** : déterministe par position et identifiant d’objet ; aucune texture aléatoire par frame. Les formes de rive doivent être raccordées lors de la production du tileset complet.

Extension limitée de palette pour le paysage : terre `#929780`, sable `#B6B293`, pelouse `#5C7D60`, feuille éclairée `#91A976`, ombre portée `#536F67`, eau peu profonde `#568B88`, écume `#A7C7B1`, chenal `#305D6C`. Ces teintes intermédiaires enrichissent les matières sans employer les couleurs saturées des signaux de combat. Un grand objet peut désormais réunir 6–9 tons, contre 4–6 pour un petit obstacle.

La planche présente le même fond sans puis avec les combattants, et un agrandissement entier ×2. L’eau montrée est une image fixe. Pour la future animation : 4 frames, 4–6 poses/s, déplacement de quelques reflets et de la chute d’eau seulement ; berge, profondeur, collisions et bords de danger restent stables. Pas de scintillement blanc généralisé.

**Critères de passage vers la production** : vérifier navigation réelle aux marches et aux berges, taille des collisions des arbres, occlusion de leurs canopées, contraste des attaques sur l’écume, coût de rendu et mouvement avec latence. La scène de référence ne fournit pas encore ces garanties ; son niveau de finition visuelle devient la nouvelle cible.

### Plan du tileset

| Famille  | Lot de départ après validation                               | Raccords / variations                                                                                                |
| -------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Ground   | 4 centres terre + 4 centres dalle                            | Texture interne, bord de tile inchangé ; répartition 60/20/15/5 %                                                    |
| Grass    | Jeu de bordures blob à 47 configurations valides + 4 centres | Index voisinage 8 directions, diagonale active seulement avec les deux voisins cardinaux ; contour gameplay conservé |
| Water    | Même topologie à 47 configurations + 3 centres               | 4 frames de vague pour les parties animées ; contour de berge stable                                                 |
| Wall     | 16 connexions cardinales + éléments de faces et terminaisons | Composer le sommet et la face sud selon les voisins ; vérifier angles intérieurs et murs isolés                      |
| Tree     | 3 arbres de 64 × 64, 2 troncs                                | Base et canopée séparées, empreinte explicite ; pas de flip qui inverse la lumière                                   |
| Building | Modules de 32 px : façade, toit, angle, rive, porte          | Premier bâtiment assemblé en 3 × 3 tiles d’emprise ; toit peut dépasser visuellement                                 |
| Rock     | 3 petits blocs 32 × 32 et 2 grands 64 × 64                   | Faces pleines + contour de base ; gravier plat dans une autre catégorie                                              |
| Bridge   | Centre, deux extrémités et deux rives par orientation        | 2 variantes internes de planches ; rampes d’accès dédiées                                                            |
| Lantern  | 1 lanterne de pierre de 32 × 44                              | Fenêtre chaude dans la matière, socle, fût et toit à quatre pans ; aucun halo permanent                              |
| Fence    | 4 connexions cardinales + poteaux d’extrémité et d’angle     | Lisses horizontales continues, lisse en profondeur pour les runs verticaux ; poteau à chaque rupture                 |
| Well     | 1 puits de 32 × 48                                           | Margelle, montants, petit toit et seau suspendu ; l’ouverture reste sombre, sans effet de terrain                    |
| Crate    | 2 empilements de caisses                                     | Dessus éclairé, face avant à planches et cerclage de corde ; une ou deux caisses                                     |
| Torii    | Portique de 2 tiles + pilier isolé                           | Dessiné depuis la tile de gauche ; le linteau déborde de 40 px et s’efface comme une canopée                         |
| Path     | Terre battue, raccords cardinaux                             | Rampe terre assombrie d’un cran, ornières suivant l’axe du tracé, lèvre usée sur les bords libres                    |
| Flowers  | Herbe fleurie, 3 à 5 corolles                                | Rampe pelouse, accents ivoire et corail de 1–2 px, touffe sombre sous chaque fleur ; tag `grass`                     |

Les 47 configurations sont des assemblages topologiques, pas 47 images nécessairement dessinées à la main : les produire depuis des sous-tiles de 16 × 16 et contrôler les jointures. Il faut ensuite valider toutes les configurations, pas seulement les quatre coins d’une île. Pas de rotation automatique d’une face éclairée.

Priorité de composition : sol neutre → terrain à tag → berges/bordures → base d’obstacle → objets de hauteur. Une variante décorative ne change jamais le tag, la collision ou le contour de passage. Choisir les variantes par graine de map ; elles ne clignotent pas d’une frame à l’autre.

### Grammaire de collision

**Traversable :** texture plate, pas de bande de base sombre continue, pas de face verticale. **Solide :** silhouette fermée, face visible, base sombre continue au bord de l’emprise. Une ombre portée ne suffit jamais à signifier un blocage. Ne pas dessiner une porte ouverte sur une façade infranchissable : porte fermée ou passage réellement ouvert.

La face et le socle doivent expliquer la zone bloquée, y compris au nord d’un bâtiment. Afficher les collisions en mode debug sur toutes les études avant intégration. Une voie standard fait au moins 32 px artistiques ; les étranglements doivent offrir au minimum le diamètre réel du collider converti en pixels + 4 px de marge visuelle. Ne pas déduire ce diamètre de la silhouette.

### Terrains interactifs

- **WATER** : surface bleue-pétrole, tirets horizontaux et berge claire ; traversable dans le prototype, avec ralentissement. Ne pas utiliser la même apparence pour de l’eau infranchissable sans ajouter un obstacle distinct.
- **GRASS** : petits groupes de brins verticaux formant des V ; limite identifiable même sans couleur. Le tag ne signifie pas automatiquement invisibilité : celle-ci dépend du gameplay.
- **WALL** : volume fermé avec face et socle ; ses décorations ne changent pas son blocage.

Préparer un masque d’interaction par zone/tile. Électricité + eau : branchements anguleux cyan et petits points de contact, bord dangereux explicite. Feu + herbe : pointes corail au ras des brins et pulsation lente par groupes. Ne dessiner que la portion réellement affectée, pas toute la rivière connectée par simple effet graphique. À expiration, retirer l’overlay : aucune destruction, terrain brûlé permanent ou changement de collision implicite. Les interactions sont des propositions futures, pas des mécaniques annoncées comme déjà présentes.

## 9. Langage visuel des capacités et télégraphie

Trois informations indépendantes : **forme = famille**, **texture/couleur intérieure = élément**, **bordure = danger pour l’observateur**. Un sort de feu défensif reste un bouclier ; un projectile de contrôle garde une pointe directionnelle et ajoute un signe de verrouillage.

Une bordure dangereuse combine 1 px d’encre extérieure et 1 px de corail intérieur, avec de petites dents orientées vers la zone affectée. Une capacité alliée sans dégâts alliés utilise un contour discontinu ivoire et le symbole de son équipe. Si le friendly fire est actif, elle reprend le bord dangereux. Ne jamais coder la menace uniquement par la couleur du lanceur.

| Famille         | Anticipation / signe appris                                                  | Activation                                                                           | Ce qui la différencie                                                          |
| --------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Projectile      | Mains rapprochées, noyau 4–6 px devant elles, pointe dans la direction visée | Tête compacte 6–10 px, queue 8–16 px                                                 | Pointe mobile, intérieur dense ; jamais un grand anneau                        |
| Area Attack     | Périmètre exact, quatre encoches internes, progression sur le bord           | Onde brève à l’intérieur ; contour persistant si dégâts persistants                  | Zone fermée à intérieur largement vide                                         |
| Dash Attack     | Corps tassé, deux chevrons au sol et étincelles si électrique                | Capsule/corridor réel et deux images résiduelles au maximum                          | Chevrons alignés avec le déplacement                                           |
| Trap            | Petit losange à quatre angles et centre ponctuel à la pose                   | Dents se ferment lors du déclenchement ; portée révélée quand elle est censée l’être | Losange fixe bas, sans halo permanent                                          |
| Defensive Skill | Bras écartés, deux crochets qui se referment autour du torse                 | Bouclier ouvert par endroits, facettes épaisses localisées                           | Crochets tournés vers l’extérieur ; pas de dents de danger sauf effet offensif |
| Teleport        | Deux paires d’équerres, compression du corps à la source                     | Disparition, puis expansion à destination ; aucun trail de parcours                  | Deux points disjoints, jamais un corridor                                      |
| Control Ability | Quatre barreaux s’approchent d’un centre, symbole de verrou                  | Lien segmenté ou cage ouverte ; symbole d’état au-dessus de la cible                 | Barreaux droits et mouvement de fermeture                                      |

**Attaque venant du ciel :** ajouter au télégraphe de zone une croix à centre vide et quatre traits convergents. Au déclenchement, une colonne fine arrive sur cette marque puis disparaît ; elle ne recouvre pas la zone pendant toute l’anticipation. **Projectile feu :** noyau or entre les mains, bord corail, queue en pointes irrégulières. **Dash électrique :** préparation ramassée + zigzags cyan + chevrons ; la couleur seule ne porte pas le message.

### Compréhension de l’action — révision 1.2

La forme de famille doit être accompagnée d’un mouvement ou d’une conséquence reconnaissable. La planche présente désormais chaque attaque en trois vues : préparation, activation et résultat, avec lanceur et cible. Les légendes restent hors des sprites. Un symbole abstrait seul ne suffit pas.

| Exemple de technique | Ce que l’image doit faire comprendre                                                                                                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Braise filée         | Une flamme à tête dense avance de la main vers la cible. La queue reste derrière ; l’impact se produit au contact, jamais au milieu du trajet.                                                                                |
| Éruption de braise   | Un cercle indique la surface à quitter. Des pointes de feu montent à l’intérieur au déclenchement. Le contour extérieur est la portée ; le motif intérieur est décoratif.                                                     |
| Percussion foudre    | Un corridor fléché précède le déplacement du ninja lui-même. Les silhouettes résiduelles restent derrière son corps opaque. L’impact indique un contact offensif, sans promettre de dégâts supplémentaires à l’arrivée.       |
| Sceau à ressort      | Un objet bas reste fixé au sol. Il se referme quand une cible entre dans sa zone. La vignette illustre un piège visible ; un piège caché conserve les règles de visibilité prévues.                                           |
| Garde de jade        | Un contour de bouclier facetté entoure le corps. Un projectile se fragmente à son bord ; le joueur reste visible et indemne dans cet exemple de blocage. Ne pas montrer un rebond si la capacité ne réfléchit pas le tir.     |
| Pas entre deux       | La silhouette se fragmente au départ et se reforme à destination, sans ligne entre les deux. Afficher la destination uniquement si cette information est publique.                                                            |
| Lien entravant       | Un lien segmenté atteint la cible, puis entoure ses pieds. Un cadenas au-dessus de la tête indique une immobilisation, pas une blessure générique. Ne pas confondre immobilisation des déplacements et stun empêchant d’agir. |

Ces noms sont des exemples de direction artistique, pas de nouvelles capacités implémentées. L’impact, la perte de HP, le blocage et l’immobilisation doivent correspondre aux événements réels du gameplay. Le bouclier ne garantit donc aucune invulnérabilité universelle : la vignette explique une technique de blocage précise.

La version 1.2 enrichit les noyaux, flammes, facettes de bouclier et maillons de contrôle, mais conserve des zones intérieures transparentes. La lecture doit d’abord réussir en silhouette et dans le temps ; ne pas remplacer la direction ou la conséquence par davantage de particules.

### Temps et vérité des signaux

Les durées suivantes sont des intentions d’animation, pas une modification automatique de l’équilibrage : projectile rapide 100–180 ms, dash offensif 150–250 ms, zone/ciel 400–700 ms, contrôle fort 300–500 ms, défense ou téléport 150–300 ms. Un dash de mobilité instantané peut n’avoir qu’un signal concomitant ; ne pas lui dessiner une préparation inexistante.

Le moteur définit `start`, `activate`, `end` : l’art se cale dessus, sans retarder les dégâts. Le périmètre final apparaît dès que la zone est connue ; la progression remplit des segments du bord, **pas un cercle qui laisse croire que le rayon augmente**. La zone active conserve un bord plein ; l’annulation coupe la progression et rétracte le motif en moins de 100 ms. Si un cast reçu tardivement est déjà actif, montrer son état actif, sans rejouer toute l’anticipation.

Ne promettre une esquive réactive que si le temps réellement visible, après réseau et affichage, le permet ; sinon la capacité relève de l’anticipation stratégique. Les timings seront éprouvés avec la latence cible du jeu.

Le télégraphe copie la géométrie du gameplay : cercle, capsule, cône, polygone, obstruction et origine. Le rayon artistique ne doit pas être un rayon décoratif approximatif. Tolérance de rasterisation au bord : ±1 px. Pour une attaque qui traverse un mur, montrer les portions affectées visibles de l’autre côté ; pour une attaque bloquée, couper sa surface au bon endroit. Piège caché et destination secrète de téléport respectent la visibilité autorisée par le serveur : pas de fuite d’information pour rendre l’effet plus spectaculaire.

## 10. VFX et game feel

| Événement           | Traitement                                                                         | Budget initial                                                              |
| ------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Hit flash           | Remplacer brièvement les couleurs internes par ivoire, contour et repère conservés | 50–70 ms ; regrouper les impacts simultanés, pas de stroboscope continu     |
| Impact              | Étoile anguleuse de 4 branches, orientée selon le choc                             | 12–20 px, 3–4 frames, 100–150 ms                                            |
| Trail de projectile | Ruban discontinu, opacité décroissante                                             | 8–16 px ; la tête indique seule la collision                                |
| Dash                | Pose allongée de 2–3 px, silhouette opaque et deux fantômes                        | 80–140 ms de persistance, sans particules autour de tout le corps           |
| Particules          | Fragments carrés ou traits de 1–3 px                                               | 4–8 par impact ; durée 120–250 ms                                           |
| Dégâts              | Petits nombres dans la couche UI, décalage stable                                  | Afficher en priorité dégâts infligés/subis ; agréger 120 ms ; désactivables |
| Stun                | Petit verrou avec deux barres au-dessus de la tête                                 | 7 × 7 px, stable ; pas de constellation tournante                           |
| Knockback           | Impact à l’origine + deux traits dans l’axe de poussée                             | 100–150 ms ; déplacement du sprite suit la simulation                       |
| Mort                | Genou au sol, effondrement compact, 3 fragments de tissu                           | 450–650 ms ; corps résiduel au sol assourdi puis retiré                     |

Une défense active peut conserver deux fragments de contour, sans grosse bulle opaque. Les numéros, indicateurs de contrôle et flashs appartiennent au rendu, jamais au sprite de costume.

Budget de densité initial pour 8 combattants visibles : au plus 64 particules purement décoratives simultanées ; supprimer d’abord poussières et vieux trails, puis réduire les étincelles. **Ne jamais supprimer une tête de projectile, un contour de danger, un état de contrôle ou un indicateur d’équipe.** Les effets de grande surface occupent surtout leur bord ; remplissage à 10–18 % d’opacité et accents d’activation brefs. Ces transparences d’overlay sont autorisées, contrairement aux pixels lissés sur les contours des assets.

Secousse caméra optionnelle : 1–2 pixels logiques pendant 60–100 ms, jamais répétée à chaque tick de dégâts. Pas de gel de simulation réseau ; un hit-stop éventuel ne fige que la pose locale pendant 30–40 ms et ne suspend ni input ni indicateurs. Prévoir options secousse, flash atténué et nombres de dégâts. Pas de flash plein écran.

## 11. Équipes et UI

### Indicateurs indépendants du skin

| Option                        | Décision                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------- |
| Outline d’équipe complet      | Écarté en permanence : se confond avec hit flash et recolore la silhouette        |
| Symbole                       | Retenu, 5 × 5 px sur une petite plaque sombre au pied                             |
| Indicateur au sol             | Retenu : deux arcs latéraux de 1 px autour de l’ombre, ouverts devant et derrière |
| Couleur secondaire du costume | Non requise ; trop dépendante des personnalisations                               |

Le joueur local ajoute un petit chevron ivoire fixe au-dessus de la tête, séparé des statuts de 3 px. Le symbole d’équipe reste identique chez tous les membres et dans le HUD. Les arcs restent sous le personnage, mais leur plaque est rendue au-dessus des remplissages de zone ; ils ne doivent pas faire croire à un bouclier. Aucun contour clair permanent sur tous les adversaires.

Première série de **8 codes** : cyan/cercle, corail/triangle, or/carré, lilas/losange, menthe/plus, rose/deux barres, ivoire/X, bleu clair/point encadré. Assigner les codes de façon unique depuis la liste des équipes du match, pas via un hash modulo qui peut produire des doublons. Les couleurs se personnalisent ; les formes restent redondantes. Au-delà de 8 équipes, étendre avec identifiant court UI et nouveau motif après test : ne pas recycler silencieusement les mêmes codes. En FFA, chaque joueur reçoit son code. Le code de danger reste relatif à l’observateur, indépendant de ces 8 couleurs.

### HUD proposé à 640 × 360

- Marge sûre : 8 px. En bas à gauche, panneau HP/Chakra d’environ 140 × 34 px ; HP corail doux, chakra cyan. Hauteurs de remplissage 5 px et 3 px, icônes cœur/réserve différentes, valeurs numériques lisibles.
- En bas au centre/droite, cinq emplacements : **attaque basique + trois techniques + dash**. Boutons 24 × 24 px, espacés de 4 px, icônes 16 × 16 px. Bindings dans la marge sous l’icône, issus des réglages réels.
- Cooldown : voile sombre qui se retire verticalement + nombre de secondes, une décimale sous 1 s. Prêt = bord stable et bref trait ivoire ; chakra insuffisant = icône réserve barrée ; désactivé par contrôle = verrou. Aucun gris ambigu pour trois états différents.
- Petit réticule 7 × 7 px, centre vide, avec sous-contour sombre. Indication de portée uniquement sur demande/visée d’une technique appropriée.
- HP adverses près du personnage quand pertinent, même comportement pour alliés ; nom optionnel et tronqué. Pas de barre de chakra adverse si cette information n’est pas publique.
- Score/temps en haut, panneau discret ; aucun widget permanent dans les 60 % centraux de l’écran. Les télégraphes gameplay peuvent évidemment traverser cette zone.

UI : panneaux encre opaques à 85–95 %, bord de 1 px, coins coupés d’un pixel, séparation intérieure sobre. Police de lecture moderne dans les menus ; chiffres et raccourcis de combat en police pixel de 7–9 px de haut logique, avec accents français pour les libellés nécessaires. Le texte reste une couche UI, pas une partie des sprites. Un réglage HUD ×1,25 exige un rendu UI séparé pour garder le monde pixel-perfect ; commencer avec paliers entiers et taille de texte indépendante dans les menus.

## 12. Animations et visée souris

Animation dessinée en poses limitées ; déplacement et visée interpolés au rythme du rendu. Les fps ci-dessous décrivent la cadence des poses, pas celle du jeu.

| Animation    | Frames uniques / direction | Durée / cadence                             | Consigne                                                             |
| ------------ | -------------------------- | ------------------------------------------- | -------------------------------------------------------------------- |
| Idle         | 4                          | Cycle 800 ms, poses tenues                  | Respiration de 1 px du torse, pieds fixes                            |
| Walk North   | 6                          | 10–12 poses/s à vitesse de référence        | Dos, col et mains alternées visibles                                 |
| Walk South   | 6                          | Idem                                        | Deux appuis lisibles, tête stable ±1 px                              |
| Walk East    | 6                          | Idem                                        | Profil trois quarts, deux pieds séparés                              |
| Walk West    | Dérivée Est + exceptions   | Idem                                        | Flip du rig, correctifs lumière et accessoires                       |
| Dash         | 3                          | Pose départ / traversée / sortie            | Durée étirée sur phase réelle ; 8 directions de corps compact        |
| Basic Attack | 4                          | Environ 80 / 40 / 50 / 80 ms si compatibles | Préparation, libération, extension, récupération ; muzzle explicite  |
| Cast         | 5                          | 2 entrée + 2 boucle + 1 sortie              | Boucle tenue jusqu’au tick d’activation ; signe de famille dans VFX  |
| Hit          | 2                          | 50 + 50 ms                                  | Recul bref du haut du corps ; ne remplace pas un cast non interrompu |
| Death        | 6                          | 550 ms, puis dernière pose                  | Perte d’appui, genou, affaissement ; corps n’occulte plus le combat  |

Produire Nord, Sud et Est pour idle, marche, attaque, cast, hit et mort ; Ouest dérivé avec exceptions. Dash : cinq directions sources N, NE, E, SE, S, les trois autres par miroir avec correctifs. Les 8 directions ne changent pas la direction physique libre.

**Déplacement et visée indépendants :** jambes animées selon la locomotion ; haut du corps quantifié selon la visée en N/S/E/W avec une petite hystérésis de 8° pour éviter le clignotement aux diagonales. Au repos, suivre la visée. Pour un tir dans le dos ou une direction incompatible avec les jambes, utiliser une marche latérale/recul commune avec jambes sous le bassin, sans tordre le sprite à 180°. Le rig distingue zone basse et haute à l’intérieur de Body/Clothes ; ce ne sont pas de nouveaux choix de customisation. Prévoir une pose de bras diagonale si les tests montrent un décalage excessif entre mains et viseur.

Une transition de direction conserve la phase des pas. La cadence de marche suit la distance réellement parcourue, y compris le ralentissement dans l’eau. La pose de dash ne s’étire pas en scale non entier ; dessiner son allongement. Priorité visuelle : mort → déplacement imposé/stun → dash → cast/attaque → locomotion → idle. Hit flash et repères se superposent sans effacer les informations plus prioritaires ; une interruption suit l’état réel du serveur.

## 13. Lisibilité PvP et validation

Hiérarchie au repos : **moi → adversaires → dangers → obstacles → décoration**. Quand une capacité menace immédiatement le joueur, son bord peut temporairement attirer l’œil avant lui ; son repère local doit rester récupérable. Limiter la luminosité décorative est plus efficace que surligner tous les éléments.

Ordre de rendu recommandé : sol et terrain → overlays de terrain → ombres et télégraphes au sol → objets/acteurs triés par base → effets aériens/impacts → repères d’équipe et statuts visibles → HUD. Restaurer les contours de danger sur les surfaces exposées si un effet les masque ; ne pas les projeter artificiellement sur un mur hors de la surface affectée. Couvertures masquables selon visibilité autorisée.

### Porte de validation avant production massive

Une arène test doit combiner sol clair, herbe, eau, mur, arbre, bâtiment, pont et 8 acteurs avec vêtements proches. Cibles de recette proposées :

1. À ×1 puis ×3, sur une capture présentée 1 seconde, au moins 4 testeurs sur 5 retrouvent le joueur local et distinguent alliés/adversaires sans lire les noms.
2. Après apprentissage des 7 signes, au moins 90 % d’identifications correctes de famille sur 20 extraits mélangés, avec couleurs puis en gris. Le petit échantillon oriente l’itération, sans constituer une preuve statistique.
3. Tous les bords de danger coïncident avec les géométries actives à ±1 px de rasterisation. Vérifier spécialement cônes, angles de mur, diagonales et destination de téléport.
4. En 8 joueurs, 3 zones simultanées et 12 projectiles, aucune silhouette autorisée ne disparaît derrière un remplissage ; les têtes de projectiles restent détectables. Refaire avec VFX réduits.
5. Combiner au moins 3 Clothes × 3 Hair × 3 Headgear × 2 Accessory, toutes directions et frames critiques. Aucun trou au cou, socket déplacé, cheveu à travers le couvre-chef ou changement de pivot. Captures automatisables, revue visuelle nécessaire.
6. Parcourir les bords de tous les obstacles et chaque étranglement ; les passages visuels correspondent au collider. Aucun faux passage sous une toiture.
7. Examiner une grande surface de 10 × 10 tiles, les 47 configurations terrain et leurs coins intérieurs. Pas de couture, pixels parasites ou répétition à fort contraste.
8. Simulation des déficiences de perception rouge/vert et bleu/jaune, niveaux de gris et flash atténué : les formes suffisent à distinguer danger, équipe, eau et herbe.
9. Avec latence représentative, les signaux ne se terminent pas après les dégâts et les casts annulés ne semblent pas encore dangereux.

Ces validations restent à réaliser dans le jeu ; la planche sert de référence, pas de preuve de lisibilité multijoueur.

## 14. Exemples, formats et continuité artistique

La [planche locale](reference/index.html) montre : le ninja Sud/Nord/Est/Ouest, deux variantes de tenue, les six layers d’un rig frontal, trois poses de marche, les huit familles de tiles demandées, une cour de combat, les sept familles de signaux et les indicateurs de huit équipes. Les canvases sont dessinés à leur taille native puis agrandis par nearest-neighbor. Les boutons permettent d’exporter les études PNG, sans les confondre avec des atlas de production.

Les dessins de référence sont volontairement limités : le bâtiment est une vignette de matière, la scène utilise une île rectangulaire, les poses de marche sont des clés et les signaux sont des séquences de trois instantanés. Ils ne prétendent pas couvrir les autotiles, toutes les perspectives d’équipements ou les transitions animées décrites dans cette bible.

### Livraison d’un asset de production

Convention : `category/name/rig-v1/animation_direction.png`, spritesheets sur cellules fixes, frames de gauche à droite ; métadonnées adjacentes. Fournir source éditable à layers, PNG, palette, masque de couverture, pivot, sockets, ordre des sous-plans, durée par frame et événements visuels. Les events ne déclenchent pas les dégâts : ils suivent le gameplay.

Exemple de contrat **proposé, non encore implémenté** :

```json
{
  "assetId": "clothes/split-coat-indigo",
  "artBible": "1.4",
  "rig": "ninja-v1",
  "layer": "Clothes",
  "animation": "walk",
  "direction": "south",
  "cell": [32, 32],
  "pivot": [16, 29],
  "frameCount": 6,
  "frameDurationMs": [83, 83, 84, 83, 83, 84],
  "socketSource": "rigs/ninja-v1/walk_south.json",
  "coverageMask": "walk_south_coverage.png",
  "paletteSlots": ["clothShadow", "clothMid", "clothLight", "copper"],
  "mirrorPolicy": "direction-specific"
}
```

### Brief obligatoire pour chaque prochaine création

> NINJARENA, bible graphique 1.4, identité Veilleurs du Sceau Fendu. Pixel art natif, tile 32 px, acteur 20 × 28 px dans cellule 32 px, pivot (16,29). Perspective orthographique top-down trois quarts, sol carré, lumière haut-gauche. Contour acteur encre 1 px, masses compactes avec plis, coutures, mèches et attaches facettées, palette matière fournie, veste à deux pans et attaches de cuivre décalées. Combat prioritaire, aucune texture bruitée ni glow permanent. Respecter rig, direction, sockets, budget de couleurs et taille réelle fournis avec la demande. Aucun symbole, costume ou asset emprunté à une licence. Livrer la source éditable et la vue à ×1.

Une image générée peut servir à explorer une idée, mais elle doit être reconstruite/vérifiée sur la grille pour devenir un asset. Ne pas intégrer des sorties simplement « ressemblantes » : contrôler palette, pivots, lumière, échelle et lecture à taille native.

### Ordre de production

1. Valider silhouette Sud/Nord/Est, un costume et ses masques ; construire le rig et ses poses clés.
2. Intégrer une seule arène avec ground/grass/water/wall, puis une technique de chacune des 7 familles et le HUD.
3. Éprouver les collisions, les durées visibles et les 8 codes d’équipe en jeu.
4. Produire les animations complètes du rig, puis le premier petit lot de customisation et ses combinaisons.
5. Étendre les autotiles et les neuf environnements uniquement après cette validation.

Toute exception doit être notée avec sa raison dans une nouvelle version de la bible. Ne pas agrandir un sprite isolément pour résoudre un problème de lecture ; corriger d’abord silhouette, contraste ou encombrement.

## 15. Révision intégrée 1.4 — sol, forêt et jeu

Le terrain jouable utilise des matières explicites : sol minéral, pavage, herbe, eau et pont. Ne pas ajouter de rochers aléatoires ou de dalles isolées sur les voies de déplacement. Le pavage remplit chaque cellule déclarée ; ses joints et éclats sont un dessin de surface, jamais un trou. Le pont garde ses planches continues et ses rambardes uniquement aux bords extérieurs.

Le sol combine plages tonales discrètes et grains regroupés. La forêt ajoute herbes orientées, feuilles mortes, bouquets éclairés, racines et ombres. Les feuillages s’effacent partiellement devant un joueur visible ; cette transparence ne révèle pas un adversaire caché par le gameplay. Les troncs restent visibles et bloquants.

L’eau utilise quatre phases à 5 Hz, partagées entre les tiles, avec hauts-fonds aux berges et traitement des coins. Le moteur dessine les textures natives à 2 pixels par unité monde dans une cible 640 × 360 ; aucun changement des dimensions physiques, vitesses ou rayons. Les HUD se rapprochent de cette vue lorsque la fenêtre contient de larges marges.

La map **Cour des berges** (32 × 24 tiles) est livrée et sélectionnée par défaut. Elle transpose les matières de l’étude dans une géométrie de collisions explicite. Le renderer assemble les rectangles de bâtiment en une façade et un toit continus.

Les poses sont composées et mises en cache en cellules 64 × 64, pivot (32,45). La marche avance avec la distance parcourue. Les états du serveur déterminent dash, cast, stun, recul et mort. Le HUD utilise des icônes 24 × 24 ; les effets sont plafonnés à 64 particules, 32 impacts, 16 afterimages et 16 portails simultanés. L’aperçu de dash montre la première portion droite dégagée ; le glissement éventuel le long d’un mur reste piloté par la simulation.

La section 14 décrit le contrat d’export d’assets futurs ; l’implémentation actuelle conserve les recettes de dessin dans le dépôt. La liste exacte des composants intégrés et des fonctionnalités futures se trouve dans le [README artistique](README.md).

## 16. Relief 1.5 — volumes, sol vivant et végétation

La profondeur reste dessinée en 2D sur la grille native. Chaque obstacle possède un dessus éclairé au nord-ouest, une face plus sombre et une ombre orientée au sud-est. Les murs reçoivent un chaperon épais ; le dojo une toiture à pans inclinés, un avant-toit ombré, un retour de façade et un seuil en marches. Les ombres restent sous les acteurs et télégraphes.

Le sol utilise cinq valeurs proches, des contours qui traversent plusieurs tiles, des rides de sable et de rares cuvettes peu profondes. Ces creux sont traversables : pas de fond noir, de cercle fermé ou de bord de falaise qui annoncerait une collision. Les dalles restent continues. L’herbe associe un tapis de feuillage en petites masses, des feuilles mortes et des bordures dont la lèvre sud est ombrée. La texture doit laisser lire les pieds et les signaux de danger.

Les buissons sont une nouvelle tile d’objet **bush / 8**, avec collision explicite de 32 × 32 pixels artistiques. Ils forment des massifs sur les côtés de la cour et de la forêt ; aucun placement aléatoire dans le moteur. Leur silhouette déborde légèrement, comme la canopée d’un arbre. Les spawns et les accès au pont restent ouverts.

Le vent anime seulement quelques brins et grains de sable, en quatre phases discrètes à environ 3 Hz. Le terrain ne glisse pas et ne change pas d’état. Le réglage « Vent et eau animés » fige ces animations ambiantes, sans supprimer la télégraphie de combat. Les matières et buissons sont dessinés dans `landscapeArt.js`, partagé avec la planche. Les recettes de la rivière restent inchangées.

Rampes de surface ajoutées (réservées au décor, ombre vers lumière) :

| Matière        | Couleurs                                              |
| -------------- | ----------------------------------------------------- |
| Terre et sable | `#96977A`, `#A4A184`, `#B1AC8C`, `#BBB392`, `#C6BC9A` |
| Tapis d’herbe  | `#486A50`, `#527758`, `#60835D`, `#6D8C63`, `#829B6E` |

Les signaux de combat conservent leurs couleurs plus saturées et leur contour encre.

## 17. Perspective 1.6 — profondeur construite

La révision 1.5 enrichissait les matières mais gardait un toit en trapèze frontal. Cette construction est remplacée. La profondeur du bâtiment se projette selon l’axe nord-sud de la map ; sa hauteur remonte verticalement dans l’image. La caméra reste orthographique, sans rotation du sol ni changement des hitboxes.

**Bâtiment :** dessiner un faîtage qui relie un sommet arrière à un sommet avant. Les deux versants sont des parallélogrammes dont la longueur traduit la profondeur au sol. Les rangs et joints suivent chacun de ces plans. Le pignon avant est un triangle vertical distinct, puis vient la façade sous la ligne d’égout. L’auvent de porte projette un petit toit supplémentaire vers l’avant. Les marches prolongent le volume sur le sol traversable. Ne plus utiliser un simple trapèze posé sur un rectangle de façade.

Le gabarit du jeu garde 36 px de façade et 48 px de décalage vertical pour l’ancrage. Pour une emprise de 160 × 96 px artistiques, le canvas vaut 176 × 160, l’origine de l’emprise (8,48) et la base solide y=144. Les 16 derniers pixels servent aux marches décoratives traversables. La fonction `buildingGeometry` porte ce contrat ; la profondeur supplémentaire allonge le toit et non les fenêtres ou la hauteur du mur.

**Arbre :** la canopée occupe un volume large de 64 × 64 px, avec couronne supérieure, épaules latérales et frange avant ombrée. Le tronc reste court, en partie masqué sous le feuillage ; la vue du dessus domine. Le feuillage et les racines conservent deux textures séparées pour l’occlusion PvP. L’emprise solide demeure une cellule de la map.

`volumeArt.js` dessine les bâtiments et arbres du jeu et de la planche. L’[aperçu des volumes](http://localhost:5173/art-review.html), disponible avec `pnpm dev`, utilise le renderer et la map réels, sans salon multijoueur. Il présente le dojo, la forêt et les berges avec un ninja donnant l’échelle.
