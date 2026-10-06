// Ships the OCR engine and language data with the app (plan Phase 7.3): served at
// /ocr/* by the dev server and copied into dist/ocr/ under fixed names, so
// tesseract.js finds them offline (no CDN, nothing downloaded at run time).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const dir = (pkg) => dirname(require.resolve(`${pkg}/package.json`));

/** Published name → file on disk. */
export function ocrFiles() {
  const core = dir("tesseract.js-core");
  const tjs = dir("tesseract.js");
  return {
    "worker.min.js": join(tjs, "dist/worker.min.js"),
    // With and without SIMD (older WebKit on macOS 11–12 has no wasm SIMD); LSTM engine only.
    "tesseract-core-simd-lstm.wasm.js": join(core, "tesseract-core-simd-lstm.wasm.js"),
    "tesseract-core-lstm.wasm.js": join(core, "tesseract-core-lstm.wasm.js"),
    // "best_int" models: accurate and small.
    "eng.traineddata.gz": join(dir("@tesseract.js-data/eng"), "4.0.0_best_int/eng.traineddata.gz"),
    "fra.traineddata.gz": join(dir("@tesseract.js-data/fra"), "4.0.0_best_int/fra.traineddata.gz"),
  };
}

export default function ocrAssets() {
  const files = ocrFiles();
  return {
    name: "nga-ocr-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = /^\/ocr\/([^?]+)/.exec(req.url ?? "");
        const file = m && files[m[1]];
        if (!file) return next();
        res.setHeader("Content-Type", m[1].endsWith(".js") ? "text/javascript" : "application/octet-stream");
        res.end(readFileSync(file));
      });
    },
    generateBundle() {
      for (const [name, file] of Object.entries(files)) {
        this.emitFile({ type: "asset", fileName: `ocr/${name}`, source: readFileSync(file) });
      }
    },
  };
}
