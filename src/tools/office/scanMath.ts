// Document scanner maths (no libraries): straighten a photographed page from its
// four corners (perspective transform), then clean it up (auto levels, or crisp
// black and white with an adaptive threshold). Works on ImageData-like objects.

export interface Pt { x: number; y: number }
export interface Img { width: number; height: number; data: Uint8ClampedArray }

/** Solve A·x = b (n×n) by Gaussian elimination with partial pivoting. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) throw new Error("degenerate corners");
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/** The 3×3 homography (row-major, h33 = 1) mapping each `from` point onto its `to` point. */
export function homography(from: Pt[], to: Pt[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  return [...solve(A, b), 1];
}

export const apply = (H: number[], p: Pt): Pt => {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w, y: (H[3] * p.x + H[4] * p.y + H[5]) / w };
};

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Output size for corners [top-left, top-right, bottom-right, bottom-left], longest side capped. */
export function outputSize(q: Pt[], max = 2200): { width: number; height: number } {
  const w = Math.max(dist(q[0], q[1]), dist(q[3], q[2]));
  const h = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
  const s = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) };
}

/** Straighten: corners [TL, TR, BR, BL] of `src` → a width × height rectangle (bilinear sampling). */
export function warp(src: Img, q: Pt[], width: number, height: number): Img {
  // Map each output pixel back into the photo (inverse transform).
  const H = homography([{ x: 0, y: 0 }, { x: width - 1, y: 0 }, { x: width - 1, y: height - 1 }, { x: 0, y: height - 1 }], q);
  const out = new Uint8ClampedArray(width * height * 4);
  const sw = src.width, sh = src.height, sd = src.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const w = H[6] * x + H[7] * y + H[8];
      const fx = (H[0] * x + H[1] * y + H[2]) / w;
      const fy = (H[3] * x + H[4] * y + H[5]) / w;
      const o = (y * width + x) * 4;
      if (fx < 0 || fy < 0 || fx > sw - 1 || fy > sh - 1) {
        out[o] = out[o + 1] = out[o + 2] = 255;
        out[o + 3] = 255;
        continue;
      }
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1);
      const ax = fx - x0, ay = fy - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4, i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4;
      for (let c = 0; c < 3; c++) {
        const top = sd[i00 + c] * (1 - ax) + sd[i10 + c] * ax;
        const bot = sd[i01 + c] * (1 - ax) + sd[i11 + c] * ax;
        out[o + c] = top * (1 - ay) + bot * ay;
      }
      out[o + 3] = 255;
    }
  }
  return { width, height, data: out };
}

const luma = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/** Cleaner colour: stretch each image so 1 % of pixels are black and 1 % white (paper looks white). */
export function autoLevels(img: Img): Img {
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) hist[Math.round(luma(d, i))]++;
  const n = d.length / 4;
  let lo = 0, hi = 255, acc = 0;
  while (lo < 255 && (acc += hist[lo]) < n * 0.01) lo++;
  acc = 0;
  while (hi > 0 && (acc += hist[hi]) < n * 0.01) hi--;
  if (hi - lo < 10) return { ...img, data: d.slice() };
  const out = new Uint8ClampedArray(d.length);
  const k = 255 / (hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    out[i] = (d[i] - lo) * k;
    out[i + 1] = (d[i + 1] - lo) * k;
    out[i + 2] = (d[i + 2] - lo) * k;
    out[i + 3] = 255;
  }
  return { width: img.width, height: img.height, data: out };
}

/**
 * Crisp black and white: each pixel against the mean of its neighbourhood
 * (integral image, so shadows across the page don't turn it black).
 */
export function blackAndWhite(img: Img, radius = Math.max(8, Math.round(Math.min(img.width, img.height) / 40)), offset = 12): Img {
  const { width: w, height: h, data: d } = img;
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) gray[i] = luma(d, i * 4);
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 1; y <= h; y++) {
    let row = 0;
    for (let x = 1; x <= w; x++) {
      row += gray[(y - 1) * w + (x - 1)];
      integral[y * (w + 1) + x] = integral[(y - 1) * (w + 1) + x] + row;
    }
  }
  const out = new Uint8ClampedArray(d.length);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius), y1 = Math.min(h, y + radius + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius), x1 = Math.min(w, x + radius + 1);
      const sum = integral[y1 * (w + 1) + x1] - integral[y0 * (w + 1) + x1] - integral[y1 * (w + 1) + x0] + integral[y0 * (w + 1) + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      const v = gray[y * w + x] < mean - offset ? 0 : 255;
      const o = (y * w + x) * 4;
      out[o] = out[o + 1] = out[o + 2] = v;
      out[o + 3] = 255;
    }
  }
  return { width: w, height: h, data: out };
}

/** Starting corners: a little inside the photo's edges, [TL, TR, BR, BL]. */
export const defaultCorners = (w: number, h: number, inset = 0.06): Pt[] => [
  { x: w * inset, y: h * inset },
  { x: w * (1 - inset), y: h * inset },
  { x: w * (1 - inset), y: h * (1 - inset) },
  { x: w * inset, y: h * (1 - inset) },
];

/** Otsu's threshold on a 256-bin histogram. */
export function otsu(hist: ArrayLike<number>): number {
  let total = 0, sum = 0;
  for (let i = 0; i < 256; i++) { total += hist[i]; sum += i * hist[i]; }
  let wB = 0, sumB = 0, best = 0, at = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; at = t; }
  }
  return at;
}

/**
 * Guess the page's corners: the largest light region (paper on a darker desk), its
 * four extreme points. Works on a small copy; null when there's no clear page.
 */
export function detectCorners(img: Img, work = 220): Pt[] | null {
  const s = Math.min(1, work / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * s)), h = Math.max(1, Math.round(img.height * s));
  const gray = new Uint8Array(w * h);
  const hist = new Uint32Array(256);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.min(img.width - 1, Math.round(x / s)), sy = Math.min(img.height - 1, Math.round(y / s));
    const v = Math.round(luma(img.data, (sy * img.width + sx) * 4));
    gray[y * w + x] = v;
    hist[v]++;
  }
  const t = otsu(hist);
  // Largest 4-connected light component (iterative flood fill).
  const label = new Int32Array(w * h).fill(-1);
  let bestId = -1, bestSize = 0;
  const stack: number[] = [];
  for (let i = 0, id = 0; i < w * h; i++) {
    if (label[i] !== -1 || gray[i] <= t) continue;
    let size = 0;
    stack.push(i);
    label[i] = id;
    while (stack.length) {
      const k = stack.pop()!;
      size++;
      const x = k % w, y = (k - x) / w;
      const next = [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, y > 0 ? k - w : -1, y < h - 1 ? k + w : -1];
      for (const n of next) if (n >= 0 && label[n] === -1 && gray[n] > t) { label[n] = id; stack.push(n); }
    }
    if (size > bestSize) { bestSize = size; bestId = id; }
    id++;
  }
  // No clear page: too small, or the whole photo (nothing to crop).
  if (bestId < 0 || bestSize < w * h * 0.15 || bestSize > w * h * 0.97) return null;
  let tl = Infinity, br = -Infinity, tr = -Infinity, bl = Infinity;
  const pts: Record<string, Pt> = {};
  for (let i = 0; i < w * h; i++) {
    if (label[i] !== bestId) continue;
    const x = i % w, y = (i - x) / w;
    if (x + y < tl) { tl = x + y; pts.tl = { x, y }; }
    if (x + y > br) { br = x + y; pts.br = { x, y }; }
    if (x - y > tr) { tr = x - y; pts.tr = { x, y }; }
    if (x - y < bl) { bl = x - y; pts.bl = { x, y }; }
  }
  return [pts.tl, pts.tr, pts.br, pts.bl].map((p) => ({ x: Math.min(img.width, (p.x + 0.5) / s), y: Math.min(img.height, (p.y + 0.5) / s) }));
}
