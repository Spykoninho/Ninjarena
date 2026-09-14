// Native decor recipes, Ninjarena art bible 1.7. Coordinates are art pixels, light from top-left.
import { P, ellipse, hash, line, pen, poly, rect, surface } from './nativeArt.js';
import { earth, lawn } from './landscapeArt.js';

// Terre battue: la rampe `earth` décalée d'un cran vers l'ombre.
export const packed = ['#80806A', earth[0], earth[1], earth[2], earth[3]];
// Rouge du portique: accent de décor, il ne rejoint pas la palette maîtresse.
export const TORII = ['#7E2A1D', '#B4442E', '#D9624A'];

const FLOWERS = [P.ivory, P.danger];

// Un relief de sol reste continu d'une tile à l'autre: la houle se calcule en pixels monde.
function groundSwell(c, ramp, worldX, worldY, scale) {
  for (let y = 0; y < 32; y += 2)
    for (let x = 0; x < 32; x += 2) {
      const gx = worldX + x,
        gy = worldY + y;
      const wave =
        Math.sin(gx / scale + Math.sin(gy / (scale * 0.83))) + 0.55 * Math.sin(gy / 23 + gx / 89);
      const level = Math.max(0, Math.min(4, Math.floor(2 + wave * 1.12)));
      rect(c, x, y, 2, 2, ramp[level]);
    }
}

export function pathTile(variant = 0, neighbors = 255, worldX = 0, worldY = 0) {
  const cv = surface(32, 32),
    c = pen(cv);
  rect(c, 0, 0, 32, 32, packed[1]);
  groundSwell(c, packed, worldX, worldY, 41);
  const seed = hash(worldX + variant, worldY);
  for (let i = 0; i < 9; i++) {
    const x = 2 + (hash(seed, i) % 28),
      y = 2 + (hash(i, seed) % 28);
    rect(c, x, y, 1 + (i % 3), 1, i % 3 ? packed[0] : packed[4]);
  }
  const north = neighbors & 1,
    east = neighbors & 2,
    south = neighbors & 4,
    west = neighbors & 8;
  // Ornières continues: elles suivent l'axe du tracé et se raccordent d'une tile à la suivante.
  if (east || west)
    for (const y of [10, 20]) {
      rect(c, 0, y, 32, 2, packed[0]);
      rect(c, 0, y + 2, 32, 1, packed[3]);
    }
  if (north || south)
    for (const x of [10, 20]) {
      rect(c, x, 0, 2, 32, packed[0]);
      rect(c, x + 2, 0, 1, 32, packed[3]);
    }
  if (!north && !east && !south && !west) {
    ellipse(c, 16, 17, 9, 6, packed[0]);
    ellipse(c, 15, 16, 7, 4, packed[2]);
  }
  // Bord usé là où la terre battue s'arrête: une lèvre irrégulière, jamais un liseré net.
  for (let side = 0; side < 4; side++) {
    if (neighbors & (1 << side)) continue;
    c.save();
    c.translate(16, 16);
    c.rotate((side * Math.PI) / 2);
    c.translate(-16, -16);
    for (let x = 0; x < 32; x += 2) rect(c, x, 0, 2, 1 + (hash(x, side + seed) % 2), packed[1]);
    c.restore();
  }
  return cv;
}

export function flowersTile(variant = 0, worldX = 0, worldY = 0) {
  const cv = surface(32, 32),
    c = pen(cv);
  rect(c, 0, 0, 32, 32, lawn[1]);
  groundSwell(c, lawn, worldX, worldY, 47);
  const seed = hash(worldX + variant * 7, worldY);
  for (let i = 0; i < 11; i++) {
    const x = 3 + (hash(seed, i) % 26),
      y = 4 + (hash(i, seed) % 24);
    rect(c, x - 2, y + 1, 6, 2, lawn[1]);
    rect(c, x - 1, y - 1, 3, 2, lawn[3]);
    rect(c, x, y - 3, 2, 4, lawn[4]);
  }
  const count = 3 + (seed % 3);
  for (let i = 0; i < count; i++) {
    const x = 5 + (hash(seed + i, i * 3) % 22),
      y = 7 + (hash(i * 5, seed + i) % 18),
      petal = FLOWERS[i % 2],
      core = FLOWERS[(i + 1) % 2];
    // Touffe sombre et tige sous la corolle: la fleur se détache sans halo.
    rect(c, x - 1, y + 3, 5, 2, lawn[0]);
    line(c, x + 1, y + 3, x + 1, y, P.green[0]);
    rect(c, x, y - 1, 2, 2, petal);
    rect(c, x - 1, y, 1, 1, petal);
    rect(c, x + 2, y, 1, 1, petal);
    rect(c, x, y - 2, 1, 1, core);
  }
  return cv;
}

export function lanternCanvas() {
  const cv = surface(32, 44),
    c = pen(cv),
    cx = 16;
  // Socle, fût et plateau: trois assises de pierre, arête gauche éclairée.
  ellipse(c, cx, 40, 11, 4, P.stone[0]);
  rect(c, cx - 10, 36, 20, 5, P.stone[0]);
  rect(c, cx - 10, 36, 20, 2, P.stone[1]);
  ellipse(c, cx - 3, 37, 6, 2, P.stone[2]);
  rect(c, cx - 4, 22, 9, 15, P.stone[0]);
  rect(c, cx - 4, 22, 3, 15, P.stone[1]);
  rect(c, cx - 4, 22, 1, 15, P.stone[2]);
  rect(c, cx - 8, 18, 17, 5, P.stone[0]);
  rect(c, cx - 8, 18, 17, 2, P.stone[1]);
  rect(c, cx - 8, 18, 14, 1, P.stone[2]);
  // Chambre de feu et fenêtre: couleur chaude dans la matière, sans halo permanent.
  rect(c, cx - 7, 8, 15, 11, P.stone[0]);
  rect(c, cx - 7, 8, 5, 11, P.stone[1]);
  rect(c, cx - 5, 10, 10, 8, P.ink);
  rect(c, cx - 4, 11, 8, 6, P.gold);
  rect(c, cx - 3, 12, 4, 3, P.ivory);
  rect(c, cx, 11, 1, 6, P.stone[0]);
  rect(c, cx - 5, 18, 10, 1, P.gold);
  // Toit à quatre pans et bouton faîtier.
  poly(
    c,
    [
      [cx - 12, 9],
      [cx - 7, 2],
      [cx + 7, 2],
      [cx + 12, 9],
    ],
    P.stone[0],
  );
  poly(
    c,
    [
      [cx - 10, 8],
      [cx - 6, 3],
      [cx, 3],
      [cx, 8],
    ],
    P.stone[2],
  );
  rect(c, cx - 12, 8, 24, 2, P.edge);
  rect(c, cx - 2, 0, 4, 3, P.stone[1]);
  rect(c, cx - 2, 0, 2, 2, P.stone[2]);
  return cv;
}

// Trois blocs dessinés, jamais un même galet retourné: la lumière ne s'inverse pas.
const ROCKS = [
  {
    outline: [
      [3, 29],
      [3, 19],
      [8, 11],
      [17, 8],
      [26, 13],
      [29, 22],
      [27, 30],
      [9, 31],
    ],
    lit: [
      [5, 20],
      [9, 13],
      [17, 10],
      [21, 17],
      [12, 22],
      [6, 23],
    ],
    mid: [
      [21, 17],
      [26, 15],
      [28, 23],
      [22, 27],
      [14, 25],
      [12, 22],
    ],
    cracks: [[16, 23, 19, 28]],
  },
  {
    outline: [
      [6, 29],
      [5, 20],
      [11, 14],
      [20, 15],
      [25, 21],
      [23, 30],
    ],
    lit: [
      [7, 20],
      [12, 15],
      [19, 16],
      [18, 21],
      [10, 23],
    ],
    mid: [
      [19, 16],
      [24, 21],
      [22, 29],
      [14, 27],
      [18, 21],
    ],
    cracks: [[13, 22, 15, 27]],
  },
  {
    outline: [
      [2, 29],
      [3, 17],
      [10, 8],
      [21, 7],
      [28, 14],
      [30, 25],
      [24, 31],
      [8, 31],
    ],
    lit: [
      [5, 18],
      [11, 9],
      [20, 9],
      [22, 17],
      [13, 22],
      [6, 22],
    ],
    mid: [
      [22, 17],
      [28, 15],
      [30, 25],
      [22, 29],
      [14, 26],
      [13, 22],
    ],
    cracks: [
      [14, 23, 18, 29],
      [7, 23, 9, 28],
    ],
  },
];

function inset(points, amount) {
  const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length,
    cy = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  return points.map(([x, y]) => {
    const dx = x - cx,
      dy = y - cy,
      d = Math.hypot(dx, dy) || 1;
    return [Math.round(x - (dx / d) * amount), Math.round(y - (dy / d) * amount)];
  });
}

export function rockCanvas(variant = 0) {
  const spec = ROCKS[variant % ROCKS.length],
    cv = surface(32, 32),
    c = pen(cv);
  poly(c, spec.outline, P.ink);
  poly(c, inset(spec.outline, 1.8), P.stone[0]);
  poly(c, spec.mid, P.stone[1]);
  poly(c, spec.lit, P.stone[2]);
  for (const [x0, y0, x1, y1] of spec.cracks) line(c, x0, y0, x1, y1, P.edge);
  const seed = hash(variant + 5, 17);
  for (let i = 0; i < 5; i++) {
    const x = 6 + (hash(seed, i) % 19),
      y = 26 + (hash(i, seed) % 5);
    rect(c, x, y, 2, 1, i % 2 ? P.green[1] : P.landscape.leaf);
  }
  return cv;
}

// Hauteur de barrière (20 px) plus la profondeur d'une tile: une lisse en profondeur ne coupe pas.
export const FENCE_FRAME = 52;

export function fenceCanvas(mask = 0, mid = false) {
  const cv = surface(32, FENCE_FRAME),
    c = pen(cv),
    top = FENCE_FRAME - 20;
  const north = mask & 1,
    east = mask & 2,
    south = mask & 4,
    west = mask & 8;
  if (north || south) {
    // À hauteur constante, une lisse qui fuit vers le haut se voit de profil: une bande étroite.
    const from = north ? 0 : 14;
    rect(c, 14, from, 4, top - from, P.wood[1]);
    rect(c, 14, from, 1, top - from, P.wood[2]);
    rect(c, 17, from, 1, top - from, P.wood[0]);
    rect(c, 14, from, 4, 1, P.wood[2]);
  }
  if (east || west) {
    const left = west ? 0 : 5,
      right = east ? 32 : 27;
    for (const y of [top + 2, top + 9]) {
      rect(c, left, y, right - left, 4, P.wood[1]);
      rect(c, left, y, right - left, 1, P.wood[2]);
      rect(c, left, y + 3, right - left, 1, P.wood[0]);
    }
  }
  const posts = [];
  if (east || west) {
    if (!west) posts.push(2);
    if (!east) posts.push(25);
    if (north || south || mid) posts.push(14);
  } else if ((north || south) && (!north || !south || mid)) {
    posts.push(13);
  } else if (!north && !south) {
    posts.push(14);
  }
  for (const x of posts) {
    rect(c, x, top, 5, 20, P.wood[0]);
    rect(c, x, top, 2, 20, P.wood[1]);
    rect(c, x, top, 5, 2, P.wood[2]);
    rect(c, x + 4, top + 2, 1, 18, P.ink);
  }
  return cv;
}

export function wellCanvas() {
  const cv = surface(32, 48),
    c = pen(cv);
  for (const x of [6, 22]) {
    rect(c, x, 14, 4, 26, P.wood[0]);
    rect(c, x, 14, 1, 26, P.wood[2]);
  }
  // Petit toit à deux pans, faîtage arrière-avant, puis treuil et seau suspendu.
  for (let y = 0; y < 12; y++) {
    const half = Math.round((y / 11) * 15);
    rect(c, 16 - half, 3 + y, half * 2 + 1, 1, y % 4 === 1 ? P.water[2] : P.water[1]);
  }
  rect(c, 1, 14, 30, 2, P.wood[0]);
  rect(c, 1, 14, 30, 1, P.wood[2]);
  rect(c, 7, 18, 18, 3, P.wood[0]);
  rect(c, 7, 18, 18, 1, P.wood[2]);
  // Margelle: anneau de pierre, ouverture sombre et reflet d'eau au fond.
  ellipse(c, 16, 41, 14, 7, P.ink);
  rect(c, 2, 34, 29, 8, P.stone[0]);
  ellipse(c, 16, 34, 14, 7, P.stone[0]);
  ellipse(c, 15, 33, 12, 6, P.stone[1]);
  ellipse(c, 15, 33, 9, 4, P.edge);
  ellipse(c, 14, 33, 7, 3, P.water[0]);
  rect(c, 12, 32, 3, 1, P.water[2]);
  for (let x = 3; x < 29; x += 7) {
    rect(c, x, 38, 6, 5, P.stone[1]);
    rect(c, x, 38, 6, 1, P.stone[2]);
  }
  rect(c, 2, 43, 29, 2, P.ink);
  line(c, 16, 21, 16, 26, P.stone[2]);
  rect(c, 13, 26, 7, 6, P.wood[0]);
  rect(c, 14, 27, 5, 4, P.wood[1]);
  rect(c, 13, 26, 7, 1, P.wood[2]);
  return cv;
}

function crateBox(c, x, y, w, h, depth) {
  // Dessus éclairé puis face avant: les arêtes restent parallèles aux axes (bible, section 4).
  rect(c, x, y, w, depth, P.wood[2]);
  rect(c, x, y, w, 1, P.wood[1]);
  rect(c, x, y + depth - 1, w, 1, P.wood[0]);
  rect(c, x, y + depth, w, h, P.wood[1]);
  // Cadre et croix de renfort: la silhouette de caisse, sans bruit de planches.
  rect(c, x, y + depth, w, 2, P.wood[0]);
  rect(c, x, y + depth + h - 3, w, 3, P.wood[0]);
  rect(c, x, y + depth, 2, h, P.wood[0]);
  rect(c, x + w - 2, y + depth, 2, h, P.wood[0]);
  line(c, x + 2, y + depth + 2, x + w - 3, y + depth + h - 4, P.wood[0]);
  line(c, x + w - 3, y + depth + 2, x + 2, y + depth + h - 4, P.wood[0]);
  rect(c, x + 1, y + depth + 1, 1, h - 4, P.wood[2]);
  rect(c, x, y + depth + h - 1, w, 1, P.ink);
}

// Corde claire sur bois sombre, avec son ombre d'un pixel: le cerclage reste lisible.
function cord(c, x, y, w, h) {
  rect(c, x, y, w, h, P.stone[1]);
  rect(c, w > h ? x : x + w, w > h ? y + h : y, w > h ? w : 1, w > h ? 1 : h, P.ink);
}

export function crateCanvas(variant = 0) {
  const stacked = variant % 2 === 1,
    cv = surface(32, stacked ? 44 : 30),
    c = pen(cv),
    base = cv.height;
  if (stacked) {
    crateBox(c, 9, base - 42, 17, 12, 5);
    cord(c, 16, base - 42, 2, 17);
  }
  const x = stacked ? 3 : 4,
    w = stacked ? 26 : 24;
  crateBox(c, x, base - 24, w, 18, 6);
  cord(c, x + Math.round(w / 2) - 1, base - 24, 2, 23);
  cord(c, x, base - 13, w, 2);
  return cv;
}

export const TORII_FRAME = 72;

export function toriiPostsCanvas(span = 2) {
  const width = span === 2 ? 72 : 40,
    cv = surface(width, TORII_FRAME),
    c = pen(cv),
    centers = span === 2 ? [20, 52] : [20];
  for (const cx of centers) {
    rect(c, cx - 6, 20, 12, 46, TORII[1]);
    rect(c, cx - 6, 20, 3, 46, TORII[2]);
    rect(c, cx + 3, 20, 3, 46, TORII[0]);
    rect(c, cx - 7, 64, 14, 4, P.stone[0]);
    rect(c, cx - 7, 64, 14, 1, P.stone[2]);
    rect(c, cx - 8, 68, 16, 3, P.stone[1]);
    rect(c, cx - 8, 70, 16, 2, P.ink);
  }
  return cv;
}

export const TORII_LINTEL_HEIGHT = 28;

export function toriiLintelCanvas(span = 2) {
  const width = span === 2 ? 72 : 40,
    cv = surface(width, TORII_LINTEL_HEIGHT),
    c = pen(cv),
    mid = Math.round(width / 2);
  // Kasagi aux extrémités relevées, shimaki d'ombre dessous, puis nuki et gakuzuka.
  poly(
    c,
    [
      [0, 9],
      [6, 1],
      [width - 7, 1],
      [width - 1, 9],
      [width - 1, 12],
      [0, 12],
    ],
    TORII[1],
  );
  poly(
    c,
    [
      [0, 9],
      [6, 1],
      [width - 7, 1],
      [width - 1, 9],
      [width - 1, 10],
      [0, 10],
    ],
    TORII[2],
  );
  rect(c, 2, 13, width - 4, 2, TORII[0]);
  rect(c, mid - 3, 14, 6, 5, TORII[0]);
  rect(c, mid - 3, 14, 2, 5, TORII[1]);
  rect(c, 6, 18, width - 12, 6, TORII[1]);
  rect(c, 6, 18, width - 12, 2, TORII[2]);
  rect(c, 6, 23, width - 12, 1, P.ink);
  return cv;
}
