import { ellipse, hash, line, pen, poly, rect, surface } from './nativeArt';

/** Shared by the editor and match renderer: each obstacle has a one-cell footprint. */
export const BIOME_OBJECTS = [
  'sandstone-wall',
  'palisade',
  'ice-wall',
  'bamboo',
  'pine',
  'barrel',
  'statue',
];

export function biomeFloor(kind: string, variant: number): HTMLCanvasElement | null {
  const colors: Record<string, [string, string, string]> = {
    sand: ['#C9AE79', '#DCC596', '#B59A69'],
    snow: ['#CEDDDF', '#E8F0EA', '#B5C9CF'],
    gravel: ['#8E9390', '#A7ADA4', '#767D7C'],
    tatami: ['#A6A575', '#BCBA87', '#727952'],
    basalt: ['#535B65', '#68737A', '#3E4753'],
    mud: ['#786348', '#8E7856', '#62533F'],
  };
  const palette = colors[kind];
  if (!palette) return null;
  const cv = surface(32, 32),
    c = pen(cv);
  const [base, light, dark] = palette;
  rect(c, 0, 0, 32, 32, base);
  if (kind === 'tatami') {
    for (let y = 2; y < 32; y += 3) line(c, 2, y, 29, y, light);
    rect(c, 0, 0, 2, 32, dark);
    rect(c, 30, 0, 2, 32, dark);
    rect(c, 2, 0, 28, 1, dark);
  } else if (kind === 'basalt') {
    line(c, 0, 15, 31, 15, dark);
    line(c, 15, 0, 15, 14, dark);
    line(c, 7, 16, 7, 31, dark);
    line(c, 1, 1, 13, 1, light);
    line(c, 9, 17, 29, 17, light);
  } else {
    const count = kind === 'gravel' ? 32 : 9;
    for (let i = 0; i < count; i++) {
      const x = hash(variant + 9, i) % 29,
        y = hash(i, variant + 51) % 30;
      rect(c, x, y, kind === 'sand' ? 5 : 2, 1, i % 3 ? light : dark);
      if (kind === 'gravel') rect(c, x + 1, y + 1, 2, 1, dark);
      if (kind === 'mud' && i % 3 === 0) ellipse(c, x, y, 3, 1, dark);
    }
    if (kind === 'snow' && variant % 3 === 0) {
      line(c, 5, 23, 14, 21, light);
      line(c, 14, 21, 23, 22, light);
    }
  }
  return cv;
}

export function biomeObject(kind: string, variant = 0, neighbors = 0): HTMLCanvasElement | null {
  if (!BIOME_OBJECTS.includes(kind)) return null;
  const cv = surface(32, 48),
    c = pen(cv);
  const ink = '#303F40';
  if (kind === 'sandstone-wall' || kind === 'ice-wall') {
    const ice = kind === 'ice-wall';
    const base = ice ? '#9FC7D5' : '#BA9563',
      light = ice ? '#D7E8E7' : '#D5B582',
      dark = ice ? '#6895AC' : '#896A49';
    rect(c, 0, 0, 32, 48, dark);
    rect(c, 0, 0, 32, neighbors & 4 ? 48 : 32, base);
    for (let y = 0; y < 48; y += 8) {
      rect(c, 0, y, 32, 1, dark);
      for (let x = y % 16 ? 8 : 0; x < 32; x += 16) {
        rect(c, x, y, 1, 8, dark);
        rect(c, x + 2, y + 1, 12, 1, light);
      }
    }
    if (!(neighbors & 1)) rect(c, 0, 0, 32, 2, light);
    if (!(neighbors & 4)) rect(c, 0, 32, 32, 2, light);
    if (!(neighbors & 8)) rect(c, 0, 0, 1, 48, ink);
    if (!(neighbors & 2)) rect(c, 31, 0, 1, 48, ink);
    if (ice) {
      line(c, 9, 5, 17, 17, light);
      line(c, 17, 17, 13, 25, light);
    }
  } else if (kind === 'palisade') {
    for (let x = 0; x < 32; x += 8) {
      poly(
        c,
        [
          [x, 48],
          [x, 9],
          [x + 4, 2],
          [x + 7, 9],
          [x + 7, 48],
        ],
        '#796343',
      );
      line(c, x + 2, 10, x + 2, 46, '#B49B67');
      line(c, x + 7, 9, x + 7, 47, ink);
    }
    rect(c, 0, 23, 32, 3, '#4D503A');
    rect(c, 0, 38, 32, 3, '#4D503A');
  } else if (kind === 'bamboo') {
    for (const [x, top] of [
      [5, 7],
      [14, 1],
      [24, 10],
    ]) {
      rect(c, x!, top!, 5, 48 - top!, '#4F7141');
      rect(c, x! + 1, top!, 2, 48 - top!, '#9BB668');
      for (let y = top! + 7; y < 47; y += 9) rect(c, x!, y, 5, 2, '#304F3D');
      poly(
        c,
        [
          [x!, 20],
          [x! - 5, 10],
          [x! + 2, 15],
        ],
        '#67894B',
      );
      poly(
        c,
        [
          [x! + 2, 29],
          [x! + 9, 18],
          [x! + 7, 28],
        ],
        '#7C9B50',
      );
    }
  } else if (kind === 'pine') {
    rect(c, 13, 29, 6, 19, '#655440');
    for (let tier = 0; tier < 3; tier++) {
      const y = 2 + tier * 9,
        width = 9 + tier * 3;
      poly(
        c,
        [
          [16, y],
          [16 - width, y + 20],
          [16 + width, y + 20],
        ],
        '#34534F',
      );
      poly(
        c,
        [
          [16, y],
          [16 - width + 2, y + 15],
          [17, y + 12],
        ],
        '#628879',
      );
      line(c, 16, y + 1, 22, y + 11, '#D5E4DF');
    }
  } else if (kind === 'barrel') {
    rect(c, 4, 21, 24, 23, ink);
    rect(c, 5, 22, 22, 21, '#A67B51');
    for (let x = 7; x < 27; x += 5) line(c, x, 23, x, 43, '#74583F');
    ellipse(c, 16, 22, 12, 5, '#C29C69');
    ellipse(c, 16, 22, 9, 3, '#896945', true);
    rect(c, 4, 28, 24, 3, '#505D5D');
    rect(c, 4, 39, 24, 3, '#505D5D');
    rect(c, 9 + (variant % 4), 21, 3, 2, ink);
  } else {
    rect(c, 2, 40, 28, 8, '#657575');
    rect(c, 3, 39, 26, 3, '#B7C4BC');
    poly(
      c,
      [
        [8, 38],
        [10, 20],
        [22, 20],
        [24, 38],
      ],
      '#929F9D',
    );
    rect(c, 13, 11, 7, 12, '#A8B6AF');
    poly(
      c,
      [
        [6, 14],
        [16, 3],
        [26, 14],
      ],
      '#687D7C',
    );
    rect(c, 7, 14, 18, 3, ink);
    rect(c, 13, 24, 3, 13, '#C6D0C3');
    line(c, 24, 20, 24, 40, '#645741');
  }
  return cv;
}
