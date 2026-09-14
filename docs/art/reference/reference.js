import {
  buildingCanvas,
  projectedTree,
} from '../../../packages/client/src/rendering/art/volumeArt.js';
import {
  materialRelief,
  shallowHollow,
  shrubCanvas,
} from '../../../packages/client/src/rendering/art/landscapeArt.js';
/* global document, window */
/* Ninjarena art bible 1.6. Original integer-grid studies, not production atlases. */
import {
  P,
  teams,
  surface,
  pen,
  rect,
  line,
  ellipse,
  poly,
  text,
  blit,
  ninja,
  tile,
  symbol,
  marker,
  ring,
  brackets,
  chevron,
  impact,
  shield,
  portal,
  ability,
  hash,
  slab,
  tuft,
  bush,
  lantern,
} from '../../../packages/client/src/rendering/art/nativeArt.js';
(() => {
  'use strict';
  function attackFrame(c, id, phase, x, y) {
    rect(c, x, y, 192, 76, P.stone[1]);
    rect(c, x, y + 75, 192, 1, P.stone[0]);
    for (const [dx, dy] of [
      [12, 65],
      [79, 14],
      [164, 59],
    ])
      rect(c, x + dx, y + dy, 3, 1, P.stone[0]);
    const foot = y + 59,
      mid = y + 43;
    const actor = (px, enemy = false, alpha = 1) => {
      c.globalAlpha = alpha;
      ellipse(c, px, foot, 9, 3, P.stone[0]);
      blit(
        c,
        ninja({ direction: enemy ? 'w' : 'e', cloth: enemy ? P.wood : P.indigo }),
        px - 16,
        foot - 29,
      );
      c.globalAlpha = 1;
    };
    if (id === 0) {
      actor(x + 25);
      actor(x + 157, true);
      if (phase === 0) ability(c, 0, x + 43, mid, false);
      if (phase === 1) ability(c, 0, x + 100, mid, true);
      if (phase === 2) {
        impact(c, x + 145, mid);
        line(c, x + 165, mid - 5, x + 171, mid - 5, P.wood[0]);
      }
    }
    if (id === 1) {
      actor(x + 23);
      ring(c, x + 138, y + 45, 21, P.danger, phase === 1);
      actor(x + 139, true);
      if (phase === 0) {
        line(c, x + 132, y + 42, x + 132, y + 35, P.gold);
        line(c, x + 145, y + 50, x + 145, y + 56, P.gold);
      }
      if (phase === 1) ability(c, 1, x + 138, y + 45, true);
      if (phase === 2) {
        impact(c, x + 138, y + 37, P.danger);
        rect(c, x + 127, y + 16, 22, 3, P.ink);
        rect(c, x + 128, y + 17, 10, 1, P.danger);
      }
    }
    if (id === 2) {
      actor(x + 157, true);
      if (phase === 0) {
        actor(x + 26);
        ability(c, 2, x + 62, y + 48, false);
      }
      if (phase === 1) {
        actor(x + 28, false, 0.18);
        actor(x + 53, false, 0.35);
        actor(x + 92);
        ability(c, 2, x + 64, y + 49, true);
      }
      if (phase === 2) {
        actor(x + 130);
        impact(c, x + 148, y + 42, P.cyan);
      }
    }
    if (id === 3) {
      actor(x + 24);
      const tx = x + 130;
      if (phase < 2) {
        ability(c, 3, tx, y + 57, false);
        actor(x + (phase === 0 ? 170 : 137), true);
      } else {
        actor(tx, true);
        ability(c, 3, tx, y + 56, true);
        impact(c, tx, y + 47, P.gold);
      }
    }
    if (id === 4) {
      actor(x + 28);
      if (phase === 0) {
        brackets(c, x + 28, y + 42, P.mint, 14);
        c.save();
        c.translate(x + 108, y + 42);
        c.scale(-1, 1);
        ability(c, 0, 0, 0, true);
        c.restore();
      } else {
        shield(c, x + 28, y + 42, true);
        if (phase === 1) {
          impact(c, x + 44, y + 40, P.mint);
          rect(c, x + 53, y + 33, 2, 2, P.gold);
          rect(c, x + 58, y + 40, 2, 2, P.danger);
          rect(c, x + 54, y + 44, 3, 1, P.danger);
        } else {
          rect(c, x + 17, y + 17, 23, 3, P.ink);
          rect(c, x + 18, y + 18, 21, 1, P.mint);
        }
      }
      actor(x + 159, true);
    }
    if (id === 5) {
      if (phase === 0) {
        actor(x + 30);
        portal(c, x + 30, y + 45, false);
        portal(c, x + 151, y + 45, false);
      }
      if (phase === 1) {
        portal(c, x + 30, y + 45, true);
        portal(c, x + 151, y + 45, true);
      }
      if (phase === 2) {
        portal(c, x + 151, y + 45, false);
        actor(x + 151);
      }
    }
    if (id === 6) {
      actor(x + 26);
      actor(x + 147, true);
      if (phase === 0) ability(c, 6, x + 147, y + 47, false);
      if (phase === 1) {
        for (let i = 0; i < 7; i++) {
          let bx = x + 44 + i * 13;
          line(c, bx, y + 46, bx + 7, y + 43, P.violet);
          rect(c, bx + 5, y + 43, 2, 3, P.ivory);
        }
        ability(c, 6, x + 147, y + 47, true);
      }
      if (phase === 2) ability(c, 6, x + 147, y + 47, true);
    }
  }
  function setup(id) {
    const c = pen(document.getElementById(id));
    rect(c, 0, 0, c.canvas.width, c.canvas.height, P.ink);
    return c;
  }
  const detail = setup('detail');
  [{}, { cloth: P.wood, skin: P.darkSkin, hat: true }, { cloth: P.green, weapon: true }].forEach(
    (options, i) => {
      blit(detail, ninja(options), 8 + i * 112, 8, 3);
    },
  );
  blit(detail, tile('tree'), 354, 8, 3);
  blit(detail, buildingCanvas(64, 32), 336, 102, 1);
  text(detail, 'INDIGO', 25, 116, P.stone[2]);
  text(detail, 'CUIVRE', 137, 116, P.stone[2]);
  text(detail, 'JADE', 255, 116, P.stone[2]);
  text(detail, 'COL / PLIS / COUTURES', 12, 151, P.stone[2]);
  text(detail, 'MECHES / BANDAGES / FERMOIR', 12, 169, P.stone[2]);
  text(detail, 'MEME SPRITE NATIF 32 X 32', 12, 196, P.indigo[2]);
  const chars = setup('characters');
  ['s', 'n', 'e', 'w'].forEach((direction, i) => {
    blit(chars, ninja({ direction }), 8 + i * 53, 14, 1);
    text(chars, ['SUD', 'NORD', 'EST', 'OUEST'][i], 8 + i * 53, 61, P.stone[2]);
  });
  blit(chars, ninja({ cloth: P.wood, skin: P.darkSkin, hat: true }), 232, 14);
  blit(chars, ninja({ cloth: P.green }), 286, 14);
  text(chars, 'CUIVRE', 230, 61, P.stone[2]);
  text(chars, 'JADE', 288, 61, P.stone[2]);
  [-1, 0, 1].forEach((step, i) => {
    blit(chars, ninja({ step }), 352 + i * 48, 14);
    text(chars, `${i + 1}`, 365 + i * 48, 61, P.stone[2]);
  });
  // A native silhouette strip plus a large view to inspect the deliberately limited detail.
  blit(chars, ninja(), 10, 69, 1);
  blit(chars, ninja(), 57, 63, 2);
  text(chars, '32 x 32 / pivot 16,29', 144, 89, P.stone[2]);
  text(chars, 'COL HAUT + DEUX PANS + CUIVRE FENDU', 144, 106, P.indigo[2]);
  const lc = setup('layers');
  ['Body', 'Clothes', 'Hair', 'Headgear', 'Accessory', 'Weapon', null].forEach((layer, i) => {
    const x = 6 + i * 72;
    rect(lc, x, 8, 64, 64, P.ui);
    blit(lc, ninja({ layer, weapon: true }), x, 8, 2);
    text(lc, layer || 'ASSEMBLE', x, 86, P.stone[2]);
  });
  const tc = setup('tiles');
  ['ground', 'grass', 'water', 'wall', 'tree', 'building', 'rock', 'bridge'].forEach((name, i) => {
    blit(tc, tile(name), i * 64, 6, 2);
    text(tc, name.toUpperCase(), i * 64 + 2, 82, P.stone[2]);
  });
  text(tc, 'MEME GRILLE / MEME LUMIERE / SILHOUETTES SOLIDES FERMEES', 4, 111, P.indigo[2]);
  const ac = setup('abilities');
  ['1. PREPARATION', '2. ACTIVATION', '3. RESULTAT'].forEach((name, i) =>
    text(ac, name, 12 + i * 212, 13, P.ivory),
  );
  const attackRows = [
    [
      'PROJECTILE / BRAISE FILEE',
      ['CHARGE DANS LA MAIN', 'LE FEU AVANCE VERS LA CIBLE', 'IMPACT SUR UNE CIBLE'],
    ],
    [
      'ZONE / ERUPTION DE BRAISE',
      ['SORTIR DU CERCLE', 'TOUTE LA SURFACE FRAPPE', 'DEGATS DANS LA ZONE'],
    ],
    [
      'DASH / PERCUSSION FOUDRE',
      ['LIRE LE COULOIR', 'LE NINJA TRAVERSE', 'CONTACT EN FIN DE COURSE'],
    ],
    [
      'PIEGE / SCEAU A RESSORT',
      ['SCEAU POSE AU SOL', 'LA CIBLE MARCHE DESSUS', 'LE SCEAU SE REFERME'],
    ],
    [
      'DEFENSE / GARDE DE JADE',
      ['LA GARDE SE FORME', 'LE TIR SE BRISE AU BORD', 'LE NINJA RESTE PROTEGE'],
    ],
    [
      'TELEPORT / PAS ENTRE DEUX',
      ['DEPART ET DESTINATION', 'DISPARITION SANS TRAJET', 'REAPPARITION PLUS LOIN'],
    ],
    [
      'CONTROLE / LIEN ENTRAVANT',
      ['LA CIBLE EST DESIGNEE', 'LE LIEN ATTEINT LES PIEDS', 'PIEDS LIES / IMMOBILISE'],
    ],
  ];
  attackRows.forEach(([title, captions], id) => {
    const row = 22 + id * 120;
    text(ac, title, 12, row + 12, P.stone[2]);
    for (let phase = 0; phase < 3; phase++) {
      attackFrame(ac, id, phase, 12 + phase * 212, row + 20);
      text(ac, captions[phase], 12 + phase * 212, row + 111, P.indigo[2]);
    }
  });
  const teamc = setup('teams');
  for (let i = 0; i < 8; i++) {
    let x = 32 + i * 64;
    blit(teamc, ninja(), x - 16, 7);
    marker(teamc, x, 36, i, i === 0);
  }
  const pc = setup('palette');
  [[P.ink, P.ui, P.edge], P.indigo, P.stone, P.green, P.water, P.wood, P.skin, P.darkSkin].forEach(
    (row, i) => {
      row.forEach((co, j) => rect(pc, i * 64 + j * 19 + 2, 3, 18, 28, co));
    },
  );
  [P.ivory, P.danger, P.gold, P.cyan, P.violet, P.mint].forEach((co, i) => {
    rect(pc, 2 + i * 85, 45, 76, 22, co);
  });
  Object.values(P.landscape).forEach((color, i) => rect(pc, 2 + i * 64, 80, 57, 22, color));
  // Native landscape study: light, materials and geometry share the 640x360 grid.
  const L = P.landscape;
  const landscape = surface(640, 360),
    land = pen(landscape);
  // Broken lawn edge around the open courtyard, with quiet stone in its fighting lanes.
  rect(land, 0, 0, 640, 360, L.soil);
  for (let y = 0; y < 360; y++) {
    const edge = 120 + Math.round(Math.sin(y / 29) * 9) + Math.round(Math.sin(y / 11) * 3);
    rect(land, 0, y, edge, 1, L.grass);
    rect(land, edge, y, 3, 1, P.green[2]);
    rect(land, edge + 3, y, 4, 1, L.sand);
    rect(land, edge + 7, y, 510 - edge, 1, P.stone[1]);
  }
  for (const kind of ['grass', 'ground']) {
    land.save();
    land.beginPath();
    if (kind === 'grass') {
      land.moveTo(0, 0);
      land.lineTo(116, 0);
      for (let y = 0; y <= 360; y++)
        land.lineTo(116 + Math.round(Math.sin(y / 29) * 9) + Math.round(Math.sin(y / 11) * 3), y);
      land.lineTo(0, 360);
    } else {
      land.moveTo(136, 0);
      for (let y = 0; y <= 360; y++)
        land.lineTo(132 + Math.round(Math.sin(y / 29) * 9) + Math.round(Math.sin(y / 11) * 3), y);
      land.lineTo(503, 360);
      land.lineTo(503, 0);
    }
    land.closePath();
    land.clip();
    for (let y = 0; y < 360; y += 32)
      for (let x = 0; x < 512; x += 32) {
        land.save();
        land.translate(x, y);
        materialRelief(land, kind, x, y);
        land.restore();
      }
    land.restore();
  }
  for (const [x, y] of [
    [155, 130],
    [172, 225],
    [188, 318],
    [450, 81],
  ])
    shallowHollow(land, x, y, 11);
  for (let i = 0; i < 80; i++) {
    const x = 12 + (hash(i, 19) % 478),
      y = hash(i, 23) % 360;
    land.globalAlpha = 0.16;
    ellipse(land, x, y, 9 + (i % 17), 4 + (i % 6), x < 108 ? P.green[0] : i % 2 ? L.sand : L.soil);
  }
  land.globalAlpha = 1;
  for (let y = 4; y < 354; y += 8)
    for (let x = 5; x < 502; x += 9) {
      const n = hash(x, y);
      if (x < 115) {
        if (n % 4 === 0) tuft(land, x, y, P.green[2]);
      } else if (n % 7 === 0) {
        rect(land, x + (n % 4), y, 2 + (n % 3), 1, n % 2 ? L.sand : L.soil);
      }
    }
  // Courtyard paving uses irregular slab sizes; it does not cover every playable pixel.
  for (let y = 112; y < 294; y += 24)
    for (let x = 204; x < 473; x += 34) {
      slab(land, x + (y % 48 ? 5 : 0), y, 29 + (hash(x, y) % 3), 20, hash(x, y));
    }
  // Water is continuous along the bank: shallow shelf, deeper channel, eddies and small glints.
  const bank = (y) => 504 + Math.round(Math.sin(y / 43) * 9) + Math.round(Math.sin(y / 17) * 3);
  for (let y = 0; y < 360; y++) {
    const x = bank(y);
    rect(land, x - 7, y, 5, 1, P.stone[0]);
    rect(land, x - 2, y, 3, 1, P.stone[2]);
    rect(land, x + 1, y, 640 - x, 1, P.water[1]);
    rect(land, x + 1, y, 10, 1, L.shallows);
    rect(land, x + 11, y, 5, 1, P.water[2]);
    rect(land, x + 16, y, 6, 1, L.shallows);
    rect(land, x + 57 + Math.round(Math.sin(y / 25) * 8), y, 90, 1, L.deep);
  }
  for (let i = 0; i < 145; i++) {
    const y = (hash(i, 3) % 354) + 3,
      x = bank(y) + 6 + (hash(i, 11) % 125);
    const near = x < bank(y) + 22;
    const col = near ? P.water[2] : i % 4 ? P.water[1] : P.water[2];
    rect(land, x, y, 3 + (hash(i, 1) % 9), 1, col);
    if (i % 5 === 0) {
      rect(land, x - 2, y - 1, 3, 1, col);
      rect(land, x + 7, y + 1, 2, 1, col);
    }
  }
  // Pale short foam ribbons follow bank curvature; never the coral hazard language.
  for (let y = 7; y < 355; y += 19) {
    let x = bank(y) + 3;
    line(land, x, y, x + 2, y + 5, L.foam);
    rect(land, x + 2, y + 6, 3, 1, P.water[2]);
  }
  for (const [x, y] of [
    [534, 92],
    [609, 130],
    [578, 295],
    [630, 235],
  ]) {
    ellipse(land, x, y, 12, 4, P.water[2], true);
    rect(land, x - 5, y - 4, 7, 1, L.foam);
    ellipse(land, x + 2, y + 2, 5, 2, L.deep, true);
  }
  // North embankment has a visible face and a clear crest, with layered rock and roots.
  for (let x = 0; x < 640; x += 32) {
    if (x > 510) continue;
    rect(land, x, 8, 32, 31, P.stone[0]);
    rect(land, x, 8, 32, 7, P.stone[1]);
    rect(land, x, 8, 32, 2, P.stone[2]);
    for (let y = 19; y < 38; y += 7) {
      rect(land, x + 2, y, 25, 1, L.soil);
      rect(land, x + (y % 3) * 6, y - 4, 1, 4, P.edge);
    }
    rect(land, x, 38, 32, 3, P.green[0]);
    rect(land, x + 4, 32, 7, 3, P.green[1]);
  }
  // Small cascade feeds the channel from above, bounded by substantial river rocks.
  rect(land, 552, 0, 41, 35, P.water[0]);
  for (let x = 554; x < 591; x += 4) {
    rect(land, x, 0, 2, 32, x % 3 ? P.water[2] : L.foam);
    rect(land, x, 13 + (x % 7), 1, 8, P.water[1]);
  }
  ellipse(land, 572, 36, 27, 6, P.water[2]);
  ellipse(land, 572, 37, 20, 3, L.foam, true);
  // The same projected roof/facade/porch volume as the playable renderer.
  poly(
    land,
    [
      [178, 88],
      [290, 88],
      [310, 127],
      [197, 126],
    ],
    L.shade,
  );
  blit(land, buildingCanvas(112, 56), 170, 0);
  lantern(land, 169, 106);
  lantern(land, 302, 106);
  // Strategic ruined wall: consistent visible bases, worn caps and interrupted segments.
  for (const [x, y] of [
    [150, 137],
    [150, 169],
    [150, 201],
    [380, 81],
  ]) {
    poly(
      land,
      [
        [x, y + 26],
        [x + 32, y + 26],
        [x + 44, y + 36],
        [x + 10, y + 36],
      ],
      L.shade,
    );
    blit(land, tile('wall'), x, y);
  }
  // Bridge has a shadow on the water, spaced planks, cross braces, stone abutments and posts.
  rect(land, 500, 205, 140, 16, P.water[0]);
  for (let x = 499; x < 640; x += 7) {
    rect(land, x, 172, 6, 33, P.wood[1]);
    rect(land, x, 172, 1, 33, P.wood[2]);
    rect(land, x + 2, 181 + (x % 7), 1, 11, P.wood[0]);
    rect(land, x + 2, 176, 1, 1, P.ink);
  }
  line(land, 508, 202, 628, 175, P.wood[0]);
  for (const y of [168, 207]) {
    rect(land, 496, y, 144, 3, P.wood[0]);
    rect(land, 496, y, 144, 1, P.wood[2]);
    for (let x = 500; x < 640; x += 29) {
      rect(land, x, y - 7, 5, 11, P.wood[0]);
      rect(land, x, y - 7, 5, 2, P.wood[2]);
      rect(land, x + 1, y - 5, 1, 6, P.wood[1]);
    }
  }
  slab(land, 482, 173, 16, 31, 1);
  // Peripheral plants carry detail; tree modules vary natively in shape and cluster pattern.
  for (const [x, y, v] of [
    [23, 76, 1],
    [82, 102, 2],
    [20, 157, 3],
    [48, 251, 4],
    [18, 309, 5],
    [92, 324, 6],
    [465, 47, 7],
  ])
    projectedTree(land, x, y, v);
  for (const [x, y] of [
    [91, 55],
    [108, 224],
    [22, 194],
    [100, 282],
    [436, 60],
    [474, 312],
  ])
    bush(land, x, y, 11);
  for (const y of [78, 132, 251, 314]) {
    const x = bank(y) - 8;
    tuft(land, x, y);
    tuft(land, x - 5, y + 5, P.green[1]);
  }
  // Sparse warm accents are embedded in materials, not bright combat-like particles.
  for (const [x, y] of [
    [103, 214],
    [42, 191],
    [461, 303],
  ]) {
    rect(land, x, y, 2, 2, P.wood[2]);
    rect(land, x + 4, y + 2, 2, 2, P.wood[1]);
  }
  for (const [x, y, v] of [
    [22, 114, 0],
    [77, 161, 1],
    [87, 173, 2],
    [32, 278, 3],
    [93, 296, 0],
    [476, 61, 1],
  ]) {
    land.globalAlpha = 0.22;
    ellipse(land, x + 26, y + 44, 23, 7, P.ink);
    land.globalAlpha = 1;
    blit(land, shrubCanvas(v), x, y);
  }
  const ec = setup('environment');
  blit(ec, landscape, 0, 0);
  const c = setup('scene');
  blit(c, landscape, 0, 0);
  // Threats are sparse inside, exact perimeter remains legible.
  ring(c, 371, 194, 43, P.danger, true);
  rect(c, 367, 188, 3, 3, P.gold);
  rect(c, 374, 197, 3, 3, P.gold);
  line(c, 367, 175, 367, 182, P.gold);
  line(c, 377, 206, 377, 213, P.gold);
  ability(c, 2, 277, 228, true);
  ability(c, 3, 215, 128, false);
  ability(c, 5, 454, 133, false);
  // Water interaction study is confined to a small affected zone.
  ring(c, 564, 264, 27, P.danger, true);
  line(c, 547, 254, 560, 258, P.cyan);
  line(c, 560, 258, 553, 267, P.cyan);
  line(c, 553, 267, 579, 270, P.cyan);
  const actors = [
    { x: 316, y: 186, id: 0, local: true },
    { x: 391, y: 199, id: 1, cloth: P.wood },
    { x: 272, y: 121, id: 0, direction: 'e' },
    { x: 218, y: 250, id: 2, cloth: P.green },
    { x: 444, y: 277, id: 3, direction: 'n' },
    { x: 472, y: 104, id: 1, cloth: P.wood },
    { x: 91, y: 158, id: 2, cloth: P.green },
    { x: 551, y: 192, id: 3, direction: 'w' },
  ];
  actors.sort((a, b) => a.y - b.y);
  for (const a of actors) {
    ellipse(c, a.x, a.y, 9, 3, P.stone[0]);
    blit(c, ninja(a), a.x - 16, a.y - 29);
  }
  ability(c, 0, 354, 153, true);
  ability(c, 0, 422, 247, true);
  ability(c, 4, 272, 108, true);
  for (const a of actors) {
    marker(c, a.x, a.y, a.id, a.local);
    if (a.id === 1) {
      rect(c, a.x - 10, a.y - 37, 20, 3, P.ink);
      rect(c, a.x - 9, a.y - 36, 14, 1, P.danger);
    }
  }
  // Local reticle: hollow center with dark underlay.
  brackets(c, 381, 171, P.ink, 5);
  brackets(c, 381, 171, P.ivory, 4);
  // Bottom HUD: five actions, vitals separate from the center of combat.
  rect(c, 8, 318, 144, 34, P.ink);
  rect(c, 9, 319, 142, 1, P.edge);
  text(c, 'VEILLEUR', 16, 329, P.stone[2]);
  text(c, '84 / 100', 100, 329, P.ivory);
  rect(c, 16, 334, 127, 5, P.ui);
  rect(c, 16, 334, 106, 5, P.danger);
  rect(c, 16, 343, 127, 3, P.ui);
  rect(c, 16, 343, 85, 3, P.cyan);
  ['LMB', 'Q', 'E', 'R', 'SPC'].forEach((name, i) => {
    let x = 246 + i * 31;
    rect(c, x, 319, 25, 25, P.ink);
    rect(c, x + 1, 320, 23, 1, P.edge);
    c.save();
    c.beginPath();
    c.rect(x + 3, 322, 19, 19);
    c.clip();
    if (i === 0) ability(c, 0, x + 12, 332, true);
    if (i === 1) ring(c, x + 12, 332, 7, P.danger);
    if (i === 2) brackets(c, x + 12, 332, P.mint, 7);
    if (i === 3) {
      brackets(c, x + 12, 332, P.violet, 7);
      symbol(c, 2, x + 10, 330, P.ivory);
    }
    if (i === 4) {
      chevron(c, x + 10, 332, P.cyan);
      chevron(c, x + 16, 332, P.cyan);
    }
    c.restore();
    if (i === 1) {
      rect(c, x + 1, 321, 23, 14, P.ui);
      text(c, '2.4', x + 5, 332, P.ivory);
    }
    text(c, name, x + 1, 353, P.stone[2], 6);
  });
  rect(c, 276, 7, 89, 16, P.ink);
  symbol(c, 0, 282, 12, P.cyan);
  text(c, '02  01:42  01', 292, 18, P.ivory, 7);
  document.querySelectorAll('[data-map-view]').forEach((button) =>
    button.addEventListener('click', () => {
      ec.clearRect(0, 0, 640, 360);
      blit(ec, button.dataset.mapView === 'combat' ? c.canvas : landscape, 0, 0);
      document
        .querySelectorAll('[data-map-view]')
        .forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    }),
  );
  document.querySelector('[data-map-zoom]').addEventListener('click', (event) => {
    const canvas = ec.canvas;
    const zoomed = canvas.classList.toggle('zoomed');
    event.currentTarget.textContent = zoomed ? 'Échelle ×1' : 'Agrandir ×2';
    event.currentTarget.setAttribute('aria-pressed', String(zoomed));
  });
  // Export only the requested local canvas, preserving exact native dimensions.
  document.querySelectorAll('[data-export]').forEach((button) =>
    button.addEventListener('click', () => {
      const canvas = document.getElementById(button.dataset.export);
      const a = document.createElement('a');
      a.download = `ninjarena-study-${canvas.id}-1x.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    }),
  );
  window.ninjarenaArtReference = {
    palette: P,
    teams,
    canvasIds: [
      'environment',
      'detail',
      'scene',
      'characters',
      'layers',
      'tiles',
      'abilities',
      'teams',
      'palette',
    ],
  };
})();
