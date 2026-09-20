// Orthographic three-quarter objects: world depth runs down-screen; height runs up-screen.
import { P, ellipse, hash, line, pen, poly, rect, surface } from './nativeArt.js';

export function buildingGeometry(width, depth) {
  const wallHeight = 36,
    lift = 48,
    overhang = 8;
  const base = depth + lift,
    eave = base - wallHeight;
  const rise = Math.min(26, Math.round(width / 5));
  const ridgeFront = eave - rise,
    ridgeBack = 4;
  return {
    width: width + overhang * 2,
    height: base + 16,
    footX: overhang,
    footY: lift,
    base,
    eave,
    rise,
    ridgeFront,
    ridgeBack,
    roofDepth: ridgeFront - ridgeBack,
  };
}

export function buildingCanvas(width, depth, style = 'building') {
  const roofs = {
    dojo: ['#653E3E', '#99544A', '#BF7960'],
    'tea-house': ['#3D5948', '#68825A', '#94A377'],
    warehouse: ['#424C60', '#6B778B', '#9AA7B2'],
  };
  const roof = roofs[style] ?? P.water;
  const g = buildingGeometry(width, depth),
    cv = surface(g.width, g.height),
    c = pen(cv);
  const mid = Math.floor(g.width / 2),
    left = 1,
    right = g.width - 2;
  // The actual walls occupy the full collision rectangle. Roof overhang is cosmetic.
  rect(c, 8, 48, width, depth, P.wood[0]);
  rect(c, 9, g.eave, width - 2, 36, P.stone[2]);
  rect(c, 9, g.eave + 4, width - 2, 5, P.stone[0]);
  for (let y = g.eave + 12; y < g.base - 4; y += 6) {
    rect(c, 10, y, width - 4, 1, P.landscape.sand);
  }
  rect(c, 8, g.base - 5, width, 5, P.stone[0]);
  rect(c, 8, g.base - 5, width, 1, P.stone[2]);
  // Roof planes are parallelograms, not a front-facing trapezoid. A seam at fixed u
  // runs from the rear to the front; cross rows follow the slope of each roof plane.
  for (const side of [-1, 1]) {
    const half = side < 0 ? mid - left : right - mid;
    for (let u = 0; u <= half; u++) {
      const x = mid + side * u,
        back = g.ridgeBack + Math.round((g.rise * u) / half);
      for (let v = 0; v < g.roofDepth; v++) {
        const seam = u % 9 === 0,
          row = (v + (Math.floor(u / 9) % 2) * 3) % 7;
        const colors = side < 0 ? [roof[1], roof[2], roof[0]] : [roof[0], roof[1], P.ink];
        rect(c, x, back + v, 1, 1, seam ? colors[2] : row === 1 ? colors[1] : colors[0]);
      }
    }
    const x = side < 0 ? left : right;
    line(c, mid, g.ridgeBack, x, g.ridgeBack + g.rise, P.wood[2]);
    line(c, x, g.ridgeBack + g.rise, x, g.eave + 3, P.wood[0]);
    line(c, x + side, g.ridgeBack + g.rise + 2, x + side, g.eave + 3, P.wood[2]);
  }
  // Front gable is a separate VERTICAL plane, with its own timber and inset vent.
  poly(
    c,
    [
      [left, g.eave],
      [mid, g.ridgeFront],
      [right, g.eave],
    ],
    P.wood[1],
  );
  for (let y = g.ridgeFront + 5; y < g.eave; y += 5) {
    const span = Math.floor(((y - g.ridgeFront) / g.rise) * (mid - left));
    rect(c, mid - span, y, span * 2, 1, P.wood[2]);
  }
  line(c, mid, g.ridgeFront + 2, mid, g.eave, P.wood[0]);
  const ventW = Math.min(16, Math.floor(width / 4));
  rect(c, mid - Math.floor(ventW / 2), g.eave - 11, ventW, 7, P.wood[0]);
  rect(c, mid - Math.floor(ventW / 2) + 2, g.eave - 10, ventW - 4, 3, roof[0]);
  // Copper ridge follows the depth axis. Front bargeboards meet it at the gable.
  rect(c, mid - 1, g.ridgeBack, 3, g.roofDepth + 1, P.wood[2]);
  line(c, left, g.eave, mid, g.ridgeFront, P.wood[0]);
  line(c, mid, g.ridgeFront, right, g.eave, P.wood[0]);
  line(c, left, g.eave + 2, mid, g.ridgeFront + 2, P.wood[2]);
  line(c, mid, g.ridgeFront + 2, right, g.eave + 2, P.wood[2]);
  rect(c, 5, g.eave + 2, g.width - 10, 4, P.wood[0]);
  rect(c, 5, g.eave + 2, g.width - 10, 1, P.wood[2]);
  // Posts, recessed closed door and windows sit on the façade below the roof volume.
  for (const x of [10, g.width - 14]) {
    rect(c, x, g.eave + 5, 4, 30, P.wood[0]);
    rect(c, x, g.eave + 5, 1, 28, P.wood[2]);
  }
  const doorW = Math.min(22, width - 14),
    door = mid - Math.floor(doorW / 2);
  rect(c, door - 2, g.eave + 10, doorW + 4, 26, P.wood[0]);
  rect(c, door, g.eave + 12, doorW, 23, P.wood[1]);
  line(c, mid, g.eave + 12, mid, g.base - 3, P.wood[0]);
  rect(c, mid - 3, g.eave + 22, 2, 4, P.wood[2]);
  if (width >= 80)
    for (const x of [19, g.width - 42]) {
      rect(c, x, g.eave + 13, 23, 16, P.wood[0]);
      rect(c, x + 2, g.eave + 15, 19, 11, roof[0]);
      for (let i = 4; i < 21; i += 4) rect(c, x + i, g.eave + 15, 1, 11, P.wood[1]);
      rect(c, x + 2, g.eave + 19, 19, 1, P.wood[1]);
      rect(c, x - 1, g.eave + 29, 25, 2, P.wood[2]);
    }
  // Small porch roof projects forward from the facade. Its top surface is visible.
  const pw = Math.min(42, width - 8),
    pl = mid - Math.floor(pw / 2),
    py = g.eave + 9;
  poly(
    c,
    [
      [pl + 4, py],
      [pl + pw - 4, py],
      [pl + pw, py + 10],
      [pl, py + 10],
    ],
    roof[1],
  );
  for (let y = py + 2; y < py + 10; y += 3) line(c, pl + 3, y, pl + pw - 3, y, roof[2]);
  rect(c, pl, py + 10, pw, 3, P.wood[0]);
  rect(c, pl, py + 10, pw, 1, P.wood[2]);
  for (const x of [pl + 1, pl + pw - 4]) {
    rect(c, x, py + 13, 3, g.base - py - 11, P.wood[0]);
    rect(c, x, py + 13, 1, g.base - py - 12, P.wood[2]);
  }
  // Steps extend onto walkable ground; the solid front remains anchored at g.base.
  for (let i = 0; i < 4; i++) {
    const y = g.base + i * 3;
    rect(c, pl - i * 2, y, pw + i * 4, 3, P.stone[0]);
    rect(c, pl - i * 2, y, pw + i * 4, 1, P.stone[2]);
  }
  if (style === 'dojo' || style === 'tea-house') {
    for (let i = 0; i < 3; i++) {
      rect(
        c,
        door + (i * doorW) / 3,
        g.eave + 12,
        doorW / 3 - 1,
        9,
        style === 'dojo' ? '#D3BE8A' : '#93A77D',
      );
    }
  } else if (style === 'warehouse') {
    for (let y = g.eave + 13; y < g.base - 3; y += 4) rect(c, door, y, doorW, 2, '#9AA7B2');
  }
  return cv;
}

export function treeTrunkCanvas() {
  const cv = surface(32, 32),
    c = pen(cv);
  ellipse(c, 16, 24, 16, 8, P.green[0]);
  ellipse(c, 15, 23, 14, 6, P.green[1]);
  poly(
    c,
    [
      [12, 13],
      [20, 13],
      [21, 24],
      [27, 29],
      [20, 28],
      [16, 25],
      [10, 29],
      [5, 28],
      [11, 24],
    ],
    P.wood[0],
  );
  rect(c, 13, 13, 3, 12, P.wood[1]);
  rect(c, 13, 15, 1, 8, P.wood[2]);
  line(c, 14, 24, 9, 27, P.wood[1]);
  line(c, 18, 24, 22, 27, P.wood[1]);
  return cv;
}
export function treeCanopyCanvas(variant = 0) {
  const cv = surface(64, 64),
    c = pen(cv);
  // Broad top-facing crown; the lower dark lip is the front volume, not a long trunk.
  ellipse(c, 32, 36, 29, 20, P.green[0]);
  ellipse(c, 30, 27, 27, 23, P.green[1]);
  ellipse(c, 28, 23, 22, 18, P.green[2]);
  const lobes = [
    [12, 29, 9],
    [17, 15, 10],
    [31, 10, 10],
    [45, 19, 12],
    [51, 32, 10],
    [40, 42, 12],
    [23, 43, 12],
    [9, 39, 7],
  ];
  for (let i = 0; i < lobes.length; i++) {
    const [x, y, r] = lobes[i];
    ellipse(c, x, y, r, Math.max(6, r - 2), i > 4 ? P.green[0] : P.green[1]);
    ellipse(c, x - 2, y - 3, r - 2, Math.max(3, r - 5), i > 4 ? P.green[1] : P.green[2]);
    for (let j = 0; j < 7; j++) {
      const xx = x - r + 3 + (hash(i + j, variant) % (r * 2 - 5)),
        yy = y - 4 + (hash(j, variant + i) % 7);
      rect(
        c,
        xx,
        yy,
        3 + (j % 2),
        1,
        i < 5 && j % 3 === 0 ? P.landscape.leaf : i > 4 ? P.green[2] : P.green[1],
      );
    }
  }
  // The crown is one connected upper plane with selected lit leaf clusters.
  for (let i = 0; i < 18; i++) {
    const x = 19 + (hash(i, variant) % 24),
      y = 18 + (hash(variant, i) % 17);
    rect(c, x, y, 4, 2, i % 3 ? P.green[2] : P.landscape.leaf);
  }
  return cv;
}
export function projectedTree(c, x, y, variant = 0) {
  c.drawImage(treeTrunkCanvas(), x - 16, y - 32);
  c.drawImage(treeCanopyCanvas(variant), x - 32, y - 64);
}
