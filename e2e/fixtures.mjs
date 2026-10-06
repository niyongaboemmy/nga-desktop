// Test pictures for the scanner and OCR suites, drawn with the browser's canvas
// (no Python/PIL needed): a skewed light page on a dark desk, and a photographed
// page of printed English text. Written to e2e/.fx/.
import { chromium } from "playwright";
import fs from "node:fs";

const FX = new URL("./.fx", import.meta.url).pathname;
fs.mkdirSync(FX, { recursive: true });

const b = await chromium.launch();
const p = await b.newPage();
const draw = async (fn, w, h) => Buffer.from((await p.evaluate(([src, w, h]) => {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  new Function("c", "g", src)(c, c.getContext("2d"));
  return c.toDataURL("image/jpeg", 0.92).split(",")[1];
}, [fn, w, h])), "base64");

// 1. page-photo.jpg: quad page (260,120)(930,170)(980,800)(200,760) with dark lines.
fs.writeFileSync(`${FX}/page-photo.jpg`, await draw(`
  g.fillStyle = "rgb(60,50,45)"; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "rgb(225,222,215)"; g.beginPath(); g.moveTo(260,120); g.lineTo(930,170); g.lineTo(980,800); g.lineTo(200,760); g.closePath(); g.fill();
  g.strokeStyle = "rgb(30,30,30)"; g.lineWidth = 9;
  for (let k = 0; k < 8; k++) { const y = 220 + k * 60; g.beginPath(); g.moveTo(330, y); g.lineTo(860, y + 30); g.stroke(); }
`, 1200, 900));

// 2. text-photo.jpg: a printed page, slightly turned, on a desk.
fs.writeFileSync(`${FX}/text-photo.jpg`, await draw(`
  g.fillStyle = "rgb(55,48,44)"; g.fillRect(0, 0, c.width, c.height);
  g.save(); g.translate(700, 500); g.rotate(-4 * Math.PI / 180);
  g.fillStyle = "rgb(236,234,228)"; g.fillRect(-310, -400, 620, 800);
  g.fillStyle = "rgb(20,20,20)"; g.font = "bold 34px Arial, Helvetica, sans-serif"; g.fillText("Photosynthesis", -260, -330);
  g.font = "26px Arial, Helvetica, sans-serif";
  ["Plants make their own food using", "sunlight, water and carbon dioxide.", "They release oxygen into the air.", "Chlorophyll gives leaves their green", "colour and absorbs light energy."]
    .forEach((l, i) => g.fillText(l, -260, -250 + i * 44));
  g.restore();
`, 1400, 1000));

await b.close();
console.log("fixtures written to", FX);
