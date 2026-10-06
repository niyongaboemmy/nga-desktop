import { describe, expect, it } from "vitest";
import { apply, autoLevels, blackAndWhite, defaultCorners, detectCorners, homography, otsu, outputSize, warp, type Img } from "./scanMath";

const img = (w: number, h: number, f: (x: number, y: number) => [number, number, number]): Img => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = f(x, y);
    data.set([r, g, b, 255], (y * w + x) * 4);
  }
  return { width: w, height: h, data };
};
const px = (im: Img, x: number, y: number) => [...im.data.slice((y * im.width + x) * 4, (y * im.width + x) * 4 + 3)];

describe("scanner maths", () => {
  it("finds the perspective transform between two quadrilaterals", () => {
    const from = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    const to = [{ x: 10, y: 20 }, { x: 90, y: 10 }, { x: 110, y: 120 }, { x: 0, y: 90 }];
    const H = homography(from, to);
    from.forEach((p, i) => {
      const q = apply(H, p);
      expect(q.x).toBeCloseTo(to[i].x, 6);
      expect(q.y).toBeCloseTo(to[i].y, 6);
    });
    expect(() => homography([from[0], from[0], from[0], from[0]], to)).toThrow();
  });

  it("straightens a page: the quad's corners land on the output's corners", () => {
    // A white photo with a dark square at its top-left quarter.
    const photo = img(200, 200, (x, y) => (x < 100 && y < 100 ? [20, 20, 20] : [240, 240, 240]));
    const out = warp(photo, [{ x: 0, y: 0 }, { x: 199, y: 0 }, { x: 199, y: 199 }, { x: 0, y: 199 }], 100, 100);
    expect(px(out, 10, 10)).toEqual([20, 20, 20]);
    expect(px(out, 90, 90)).toEqual([240, 240, 240]);
    // Cropping to the dark quarter only gives a dark page.
    const crop = warp(photo, [{ x: 5, y: 5 }, { x: 90, y: 5 }, { x: 90, y: 90 }, { x: 5, y: 90 }], 40, 40);
    expect(px(crop, 20, 20)).toEqual([20, 20, 20]);
  });

  it("sizes the output from the corners, capped", () => {
    expect(outputSize([{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 400 }, { x: 0, y: 400 }])).toEqual({ width: 300, height: 400 });
    expect(outputSize([{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 4000 }, { x: 0, y: 4000 }], 2000)).toEqual({ width: 1500, height: 2000 });
    expect(defaultCorners(100, 200, 0.1)[2]).toEqual({ x: 90, y: 180 });
  });

  it("auto levels makes grey paper white and grey ink black", () => {
    const dull = img(50, 50, (x) => (x < 10 ? [80, 80, 80] : [180, 180, 180]));
    const out = autoLevels(dull);
    expect(px(out, 2, 2)).toEqual([0, 0, 0]);
    expect(px(out, 40, 40)).toEqual([255, 255, 255]);
  });

  it("black and white keeps text and ignores a shadow across the page", () => {
    // Paper fades from 230 to 120 (shadow); text strokes are 60 darker than the paper around them.
    const page = img(120, 60, (x, y) => {
      const paper = 230 - x;
      const ink = y > 25 && y < 35 && x % 20 < 4;
      const v = ink ? paper - 60 : paper;
      return [v, v, v];
    });
    const bw = blackAndWhite(page, 8, 12);
    expect(px(bw, 100, 10)).toEqual([255, 255, 255]); // shadowed paper stays white
    expect(px(bw, 101, 30)).toEqual([0, 0, 0]); // ink in the shadow is black
    expect(px(bw, 1, 30)).toEqual([0, 0, 0]); // ink in the light is black
    expect(px(bw, 10, 30)).toEqual([255, 255, 255]);
  });

  it("finds a light page on a dark desk", () => {
    // A skewed quadrilateral page (like the harness photo), drawn with a point-in-polygon test.
    const quad = [{ x: 260, y: 120 }, { x: 930, y: 170 }, { x: 980, y: 800 }, { x: 200, y: 760 }];
    const inside = (x: number, y: number) => {
      let c = false;
      for (let i = 0, j = 3; i < 4; j = i++) {
        const a = quad[i], b = quad[j];
        if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
      }
      return c;
    };
    const photo = img(1200, 900, (x, y) => (inside(x, y) ? [225, 222, 215] : [60, 50, 45]));
    const found = detectCorners(photo)!;
    expect(found).not.toBeNull();
    found.forEach((p, i) => {
      expect(Math.abs(p.x - quad[i].x), `corner ${i} x`).toBeLessThan(15);
      expect(Math.abs(p.y - quad[i].y), `corner ${i} y`).toBeLessThan(15);
    });
  });

  it("gives up when there's no clear page", () => {
    expect(detectCorners(img(300, 200, () => [128, 128, 128]))).toBeNull();
    expect(detectCorners(img(300, 200, (x, y) => (x < 20 && y < 20 ? [250, 250, 250] : [30, 30, 30])))).toBeNull();
    const hist = new Array(256).fill(0);
    hist[40] = 100; hist[200] = 100;
    expect(otsu(hist)).toBeGreaterThanOrEqual(40);
    expect(otsu(hist)).toBeLessThan(200);
  });
});
