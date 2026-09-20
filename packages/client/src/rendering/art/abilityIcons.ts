import { P, ellipse, line, pen, poly, rect, surface } from './nativeArt';
import { iconCanvas } from './spriteArt';

type Pen = CanvasRenderingContext2D;
type IconPainter = (c: Pen) => void;

const SIZE = 24;

// Une illustration par capacité, 24 x 24, même grammaire que les icônes de famille: sans texte.
const PAINTERS: Record<string, IconPainter> = {
  'kunai-strike': (c) => {
    kunai(c, 4, 20, 19, 5, P.ivory);
    slashArc(c, 17, 5, P.cyan);
  },
  'shuriken-throw': (c) => {
    star(c, 12, 12, 10, P.ink, P.ivory);
    rect(c, 11, 11, 2, 2, P.gold);
    line(c, 1, 19, 4, 16, P.ivory);
  },
  'staff-sweep': (c) => {
    for (let i = 0; i < 17; i++) rect(c, 4 + i, 19 - i, 2, 2, i % 5 === 2 ? P.wood[0] : P.wood[1]);
    rect(c, 3, 19, 2, 2, P.wood[2]);
    rect(c, 20, 3, 2, 2, P.wood[2]);
    for (let i = 0; i < 6; i++) rect(c, 14 + i, 20 - i * 0.6, 1, 1, P.cyan);
    for (let i = 0; i < 6; i++) rect(c, 3 + i * 0.6, 10 - i, 1, 1, P.cyan);
    rect(c, 18, 19, 3, 1, P.cyan);
    rect(c, 3, 4, 1, 3, P.cyan);
  },
  'iron-fist': (c) => {
    rect(c, 4, 7, 12, 11, P.ink);
    rect(c, 5, 8, 10, 9, P.skin[1]);
    for (const x of [5, 8, 11]) rect(c, x, 8, 2, 3, P.skin[2]);
    for (const x of [7, 10, 13]) rect(c, x, 8, 1, 4, P.ink);
    rect(c, 5, 12, 10, 1, P.skin[0]);
    rect(c, 5, 14, 9, 3, P.ink);
    rect(c, 6, 14, 7, 2, P.skin[2]);
    rect(c, 3, 17, 14, 3, P.ink);
    rect(c, 4, 18, 12, 1, P.ivory);
    for (const [x, y] of [
      [19, 6],
      [20, 12],
      [19, 18],
    ] as const)
      rect(c, x, y, 3, 1, P.gold);
    rect(c, 18, 9, 1, 1, P.ivory);
    rect(c, 18, 15, 1, 1, P.ivory);
  },
  'senbon-volley': (c) => {
    for (const [dx, dy] of [
      [0, 0],
      [4, 3],
      [-4, -3],
    ] as const) {
      line(c, 4 + dx, 18 + dy, 19 + dx, 5 + dy, P.ivory);
      rect(c, 18 + dx, 5 + dy, 2, 2, P.stone[0]);
      rect(c, 4 + dx, 17 + dy, 2, 2, P.stone[1]);
    }
  },
  'lightning-dash': (c) => {
    poly(
      c,
      [
        [13, 2],
        [6, 13],
        [11, 13],
        [9, 22],
        [18, 10],
        [13, 10],
        [16, 2],
      ],
      P.gold,
    );
    line(c, 12, 4, 8, 12, P.ivory);
    for (const x of [2, 20]) {
      rect(c, x, 8, 2, 2, P.cyan);
      rect(c, x + 1, 10, 2, 2, P.cyan);
      rect(c, x, 12, 2, 2, P.cyan);
    }
  },
  'chakra-shield': (c) => {
    shieldOutline(c, P.mint);
    rect(c, 9, 8, 6, 1, P.mint);
    rect(c, 11, 6, 2, 8, P.mint);
    rect(c, 8, 12, 8, 1, P.mint);
  },
  'paralysis-seal': (c) => {
    poly(
      c,
      [
        [12, 2],
        [21, 12],
        [12, 22],
        [3, 12],
      ],
      P.violet,
    );
    poly(
      c,
      [
        [12, 5],
        [18, 12],
        [12, 19],
        [6, 12],
      ],
      P.ink,
    );
    rect(c, 9, 11, 6, 5, P.violet);
    rect(c, 10, 8, 1, 4, P.violet);
    rect(c, 13, 8, 1, 4, P.violet);
    rect(c, 11, 7, 2, 1, P.violet);
    rect(c, 11, 12, 2, 2, P.ink);
  },
  fireball: (c) => {
    poly(
      c,
      [
        [12, 1],
        [16, 7],
        [21, 9],
        [19, 15],
        [15, 21],
        [8, 21],
        [3, 15],
        [5, 8],
        [9, 6],
      ],
      P.danger,
    );
    poly(
      c,
      [
        [12, 7],
        [16, 12],
        [15, 18],
        [9, 18],
        [7, 12],
      ],
      P.gold,
    );
    ellipse(c, 12, 15, 2, 2, P.ivory);
  },
  'seismic-slam': (c) => {
    // Une vague de terre qui avance vers la droite: crête de sol, éclats devant, sol fissuré derrière.
    rect(c, 2, 17, 20, 5, P.wood[0]);
    rect(c, 2, 17, 20, 1, P.stone[1]);
    line(c, 5, 18, 4, 21, P.ink);
    line(c, 9, 18, 10, 21, P.ink);
    poly(
      c,
      [
        [8, 17],
        [10, 9],
        [13, 4],
        [17, 6],
        [19, 11],
        [20, 17],
      ],
      P.wood[1],
    );
    poly(
      c,
      [
        [11, 17],
        [12, 11],
        [14, 7],
        [16, 9],
        [17, 13],
        [17, 17],
      ],
      P.stone[2],
    );
    for (const [x, y] of [
      [21, 8],
      [22, 12],
      [21, 15],
    ] as const)
      rect(c, x, y, 1, 1, P.stone[1]);
    for (const x of [3, 5, 7]) rect(c, x, 12, 1, 1, P.cyan);
    rect(c, 2, 9, 3, 1, P.cyan);
  },
  'explosive-mine': (c) => {
    // Une grappe de petites mines: chacune un disque d'encre à pointes et un voyant rouge.
    for (const [x, y] of [
      [12, 12],
      [4, 6],
      [20, 6],
      [4, 19],
      [20, 19],
    ] as const) {
      ellipse(c, x, y, 3, 2, P.ink);
      ellipse(c, x, y - 1, 2, 1, P.stone[0]);
      for (const [dx, dy] of [
        [-4, 0],
        [4, 0],
        [0, -3],
        [-3, -2],
        [3, -2],
      ] as const)
        rect(c, x + dx, y + dy, 1, 1, P.stone[2]);
      rect(c, x, y - 1, 1, 1, P.danger);
    }
    line(c, 7, 9, 10, 11, P.danger);
    line(c, 17, 9, 14, 11, P.danger);
    line(c, 7, 16, 10, 13, P.danger);
    line(c, 17, 16, 14, 13, P.danger);
  },
  'blade-whirlwind': (c) => {
    ellipse(c, 12, 12, 9, 9, P.cyan, true);
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3 + Math.PI / 6;
      const x0 = 12 + Math.cos(a) * 3,
        y0 = 12 + Math.sin(a) * 3;
      const x1 = 12 + Math.cos(a + 0.9) * 9,
        y1 = 12 + Math.sin(a + 0.9) * 9;
      line(c, x0, y0, x1, y1, P.ink);
      line(c, x0 + 1, y0, x1 + 1, y1, P.ivory);
    }
    ellipse(c, 12, 12, 2, 2, P.ink);
    rect(c, 11, 11, 2, 2, P.gold);
  },
  'ram-charge': (c) => {
    poly(
      c,
      [
        [2, 8],
        [13, 8],
        [13, 4],
        [21, 12],
        [13, 20],
        [13, 16],
        [2, 16],
      ],
      P.gold,
    );
    poly(
      c,
      [
        [4, 10],
        [13, 10],
        [13, 14],
        [4, 14],
      ],
      P.ivory,
    );
    for (const [x, y] of [
      [22, 6],
      [23, 12],
      [22, 18],
    ] as const)
      rect(c, x, y, 1, 1, P.danger);
    rect(c, 20, 3, 1, 1, P.danger);
    rect(c, 20, 20, 1, 1, P.danger);
  },
  'pinning-kunai': (c) => {
    kunai(c, 12, 3, 12, 18, P.stone[2]);
    for (let x = 4; x < 21; x += 2) rect(c, x, 20, 1, 1, P.stone[1]);
    rect(c, 8, 19, 9, 1, P.stone[1]);
    rect(c, 6, 21, 12, 1, P.wood[0]);
    line(c, 13, 6, 18, 2, P.ivory);
    rect(c, 18, 1, 2, 2, P.ivory);
  },
  'shuriken-fan': (c) => {
    star(c, 12, 6, 5, P.ink, P.ivory);
    star(c, 5, 15, 5, P.ink, P.ivory);
    star(c, 19, 15, 5, P.ink, P.ivory);
    for (const [x, y] of [
      [12, 6],
      [5, 15],
      [19, 15],
    ] as const)
      rect(c, x - 1, y - 1, 2, 2, P.gold);
  },
  'frost-breath': (c) => {
    poly(
      c,
      [
        [2, 12],
        [21, 3],
        [21, 21],
      ],
      P.water[1],
    );
    poly(
      c,
      [
        [5, 12],
        [19, 6],
        [19, 18],
      ],
      P.cyan,
    );
    for (const [dx, dy] of [
      [-3, 0],
      [3, 0],
      [0, -3],
      [0, 3],
      [-2, -2],
      [2, 2],
      [-2, 2],
      [2, -2],
    ] as const)
      line(c, 14, 12, 14 + dx, 12 + dy, P.ivory);
    rect(c, 13, 11, 2, 2, P.ivory);
  },
  'sky-strike': (c) => {
    ellipse(c, 12, 18, 9, 4, P.danger, true);
    ellipse(c, 12, 18, 5, 2, P.gold);
    rect(c, 9, 1, 6, 17, P.gold);
    rect(c, 11, 1, 2, 17, P.ivory);
    rect(c, 8, 1, 1, 6, P.gold);
    rect(c, 15, 1, 1, 6, P.gold);
    for (const [x, y] of [
      [3, 14],
      [20, 14],
      [4, 20],
      [19, 20],
    ] as const)
      rect(c, x, y, 1, 1, P.ivory);
  },
  'smoke-veil': (c) => {
    ellipse(c, 12, 15, 4, 6, P.ink);
    rect(c, 10, 8, 4, 4, P.ink);
    rect(c, 10, 9, 4, 1, P.skin[2]);
    for (const [x, y, r] of [
      [6, 14, 4],
      [17, 12, 4],
      [12, 19, 5],
      [8, 7, 3],
      [16, 6, 3],
    ] as const) {
      ellipse(c, x, y, r, r - 1, P.stone[1]);
      ellipse(c, x - 1, y - 1, r - 2, r - 2, P.stone[2]);
    }
  },
  'wind-stride': (c) => {
    for (const [x, y, w] of [
      [2, 6, 9],
      [4, 10, 12],
      [2, 14, 8],
      [5, 18, 10],
    ] as const) {
      rect(c, x, y, w, 1, P.mint);
      rect(c, x + w, y, 2, 1, P.ivory);
    }
    poly(
      c,
      [
        [15, 4],
        [22, 9],
        [15, 14],
        [17, 9],
      ],
      P.cyan,
    );
    poly(
      c,
      [
        [15, 12],
        [22, 17],
        [15, 22],
        [17, 17],
      ],
      P.cyan,
    );
  },
  meditation: (c) => {
    ellipse(c, 12, 8, 3, 3, P.ink);
    rect(c, 10, 8, 4, 1, P.skin[2]);
    poly(
      c,
      [
        [12, 11],
        [19, 19],
        [5, 19],
      ],
      P.ink,
    );
    rect(c, 4, 19, 16, 2, P.indigo[1]);
    ellipse(c, 12, 12, 11, 10, P.mint, true);
    for (const [x, y] of [
      [3, 4],
      [20, 4],
    ] as const) {
      rect(c, x, y - 1, 1, 3, P.mint);
      rect(c, x - 1, y, 3, 1, P.mint);
    }
  },
};

// Une capacité sans dessin dédié retombe sur l'icône de sa famille: rien ne s'affiche vide.
export function abilityIconCanvas(abilityId: string, family: string): HTMLCanvasElement {
  const painter = PAINTERS[abilityId];
  if (painter === undefined) return iconCanvas(family);
  const canvas = surface(SIZE, SIZE),
    c = pen(canvas);
  painter(c);
  return canvas;
}

export function hasAbilityIcon(abilityId: string): boolean {
  return abilityId in PAINTERS;
}

function kunai(c: Pen, x0: number, y0: number, x1: number, y1: number, color: string): void {
  const dx = x1 - x0,
    dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const ux = dx / len,
    uy = dy / len;
  const px = -uy,
    py = ux;
  const grip = len * 0.38;
  // Lame en losange allongé sur deux pixels de large, poignée de bois, anneau d'encre au bout.
  const at = (d: number, side: number): number[] => [
    Math.round(x0 + ux * d + px * side),
    Math.round(y0 + uy * d + py * side),
  ];
  poly(c, [at(grip, -2), at(len - 1, -1), at(len + 1, 0), at(len - 1, 1), at(grip, 2)], P.ink);
  poly(c, [at(grip, -1), at(len - 1, 0), at(grip, 1)], color);
  poly(c, [at(0, -2), at(grip, -2), at(grip, 2), at(0, 2)], P.ink);
  poly(c, [at(1, -1), at(grip - 1, -1), at(grip - 1, 1), at(1, 1)], P.wood[1]);
  rect(c, at(grip * 0.5, 0)[0] ?? 0, at(grip * 0.5, 0)[1] ?? 0, 1, 1, P.wood[2]);
  ellipse(c, x0 - ux * 2, y0 - uy * 2, 2, 2, P.ink, true);
}

function slashArc(c: Pen, cx: number, cy: number, color: string): void {
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2);
    rect(c, cx + Math.cos(a) * 6, cy + Math.sin(a) * 6, 1, 1, color);
  }
}

function star(c: Pen, cx: number, cy: number, r: number, rim: string, fill: string): void {
  const points: number[][] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const d = i % 2 === 0 ? r : r * 0.42;
    points.push([Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d)]);
  }
  poly(c, points, rim);
  const inner = points.map(([x = 0, y = 0]) => [
    Math.round(cx + (x - cx) * 0.7),
    Math.round(cy + (y - cy) * 0.7),
  ]);
  poly(c, inner, fill);
}

function shieldOutline(c: Pen, color: string): void {
  for (let y = 4; y < 18; y++) {
    const inset = Math.max(0, y - 12);
    rect(c, 4 + inset, y, 2, 1, color);
    rect(c, 18 - inset, y, 2, 1, color);
  }
  rect(c, 5, 3, 14, 2, color);
  rect(c, 10, 17, 4, 2, color);
}
