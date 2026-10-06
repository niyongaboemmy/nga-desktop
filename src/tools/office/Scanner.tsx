import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { Camera, Check, ChevronLeft, ChevronRight, FileStack, ImagePlus, LoaderCircle, RotateCw, Trash2, X } from "lucide-react";
import { autoLevels, blackAndWhite, defaultCorners, detectCorners, outputSize, warp, type Img, type Pt } from "./scanMath";
import { baseName, buildPdf, move, toBase64, type PageRef, type Source } from "./pdfBuild";
import { toolsNative } from "../shared/native";
import type { ToolProps } from "../types";
import type { Key } from "../i18n";
import { OcrPanel } from "./OcrPanel";
import "./office.css";

type Look = "original" | "colour" | "bw";
const LOOKS: Look[] = ["colour", "bw", "original"];
const MAX_SIDE = 3000;

interface ScanPage { id: string; bytes: Uint8Array; thumb: string }

const newId = () => Math.random().toString(36).slice(2, 10);

/** The page's corners if they can be found, else a frame just inside the photo. */
function startCorners(c: HTMLCanvasElement): Pt[] {
  try {
    return detectCorners(c.getContext("2d")!.getImageData(0, 0, c.width, c.height)) ?? defaultCorners(c.width, c.height);
  } catch {
    return defaultCorners(c.width, c.height);
  }
}

/** A photo (camera or file) → an <canvas> at most MAX_SIDE px on its long side. */
function toCanvas(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const s = Math.min(1, MAX_SIDE / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * s);
  c.height = Math.round(h * s);
  c.getContext("2d")!.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/**
 * Scanner (plan Phase 7.2): photograph a page with the camera or pick a photo, drag
 * the four corners onto the page's corners, choose a look, add it; then save all the
 * pages as one PDF. Everything happens on this computer.
 */
export default function Scanner({ ctx }: ToolProps) {
  const { t } = ctx;
  const [photo, setPhoto] = useState<HTMLCanvasElement | null>(null);
  const [corners, setCorners] = useState<Pt[]>([]);
  const [look, setLook] = useState<Look>("colour");
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [camera, setCamera] = useState<MediaStream | null>(null);
  /** Waiting for the camera (the permission prompt can take a while). */
  const [starting, setStarting] = useState(false);
  const startToken = useRef(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [name, setName] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);

  useEffect(() => {
    if (video.current && camera) video.current.srcObject = camera;
    return undefined;
  }, [camera]);
  useEffect(() => () => camera?.getTracks().forEach((tr) => tr.stop()), [camera]);

  const stopCamera = () => {
    camera?.getTracks().forEach((tr) => tr.stop());
    setCamera(null);
  };

  const openCamera = async () => {
    setMessage(null);
    const token = ++startToken.current;
    setStarting(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("no camera API");
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: "environment" }, audio: false });
      // Cancelled while waiting: let the camera go at once.
      if (token !== startToken.current) return s.getTracks().forEach((tr) => tr.stop());
      setCamera(s);
    } catch {
      if (token === startToken.current) setMessage({ kind: "error", text: t("scan.noCamera") });
    } finally {
      if (token === startToken.current) setStarting(false);
    }
  };
  const cancelStart = () => {
    startToken.current++;
    setStarting(false);
  };

  const snap = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = toCanvas(v, v.videoWidth, v.videoHeight);
    stopCamera();
    setPhoto(c);
    setCorners(startCorners(c));
  };

  const pick = async (f: File) => {
    setMessage(null);
    stopCamera();
    cancelStart();
    try {
      const bmp = await createImageBitmap(f, { imageOrientation: "from-image" } as ImageBitmapOptions);
      const c = toCanvas(bmp, bmp.width, bmp.height);
      bmp.close();
      setPhoto(c);
      setCorners(startCorners(c));
    } catch {
      setMessage({ kind: "error", text: t("scan.badPhoto") });
    }
  };

  const turnPhoto = () => {
    if (!photo) return;
    const c = document.createElement("canvas");
    c.width = photo.height;
    c.height = photo.width;
    const g = c.getContext("2d")!;
    g.translate(c.width, 0);
    g.rotate(Math.PI / 2);
    g.drawImage(photo, 0, 0);
    setPhoto(c);
    setCorners(startCorners(c));
  };

  // Corner dragging: stage coordinates ↔ photo pixels.
  const toPhoto = (e: RPointerEvent) => {
    const r = stage.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(photo!.width, ((e.clientX - r.left) / r.width) * photo!.width)), y: Math.max(0, Math.min(photo!.height, ((e.clientY - r.top) / r.height) * photo!.height)) };
  };
  const onMove = (e: RPointerEvent) => {
    if (drag.current === null || !photo) return;
    const p = toPhoto(e);
    setCorners((cs) => cs.map((c, i) => (i === drag.current ? p : c)));
  };
  const nudge = (i: number, dx: number, dy: number) => setCorners((cs) => cs.map((c, k) => (k === i ? { x: c.x + dx, y: c.y + dy } : c)));

  const addPage = async () => {
    if (!photo) return;
    setBusy("add");
    await new Promise((r) => setTimeout(r, 30)); // let the spinner paint
    try {
      const g = photo.getContext("2d")!;
      const src: Img = g.getImageData(0, 0, photo.width, photo.height);
      const { width, height } = outputSize(corners);
      let out = warp(src, corners, width, height);
      if (look === "colour") out = autoLevels(out);
      if (look === "bw") out = blackAndWhite(out);
      const c = document.createElement("canvas");
      c.width = width;
      c.height = height;
      c.getContext("2d")!.putImageData(new ImageData(out.data as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0);
      const blob = await new Promise<Blob>((resolve) => c.toBlob((b) => resolve(b!), "image/jpeg", look === "bw" ? 0.8 : 0.85));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const tc = document.createElement("canvas");
      const s = 240 / Math.max(width, height);
      tc.width = Math.round(width * s);
      tc.height = Math.round(height * s);
      tc.getContext("2d")!.drawImage(c, 0, 0, tc.width, tc.height);
      setPages((ps) => [...ps, { id: newId(), bytes, thumb: tc.toDataURL("image/jpeg", 0.7) }]);
      setPhoto(null);
      setMessage(null);
    } catch {
      setMessage({ kind: "error", text: t("scan.badCorners") });
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy("save");
    setMessage(null);
    try {
      const sources: Source[] = pages.map((p) => ({ id: p.id, name: `${p.id}.jpg`, kind: "image", mime: "image/jpeg", bytes: p.bytes, pageCount: 1 }));
      const refs: PageRef[] = pages.map((p) => ({ key: `${p.id}:0`, src: p.id, index: 0, rotation: 0 }));
      const stem = baseName(name || t("scan.defaultName"));
      const bytes = await buildPdf(sources, refs, { title: stem });
      const path = await toolsNative.saveFile(`${stem}.pdf`, toBase64(bytes));
      setMessage({ kind: "ok", text: t("pdf.saved", { path, size: (bytes.length / 1024 / 1024).toFixed(1) }) });
    } catch (e) {
      setMessage({ kind: "error", text: String((e as Error)?.message ?? e) });
    } finally {
      setBusy(null);
    }
  };

  const poly = corners.map((c) => `${(c.x / (photo?.width || 1)) * 100},${(c.y / (photo?.height || 1)) * 100}`).join(" ");

  return (
    <div className="scan">
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ""; }} />

      {starting && !camera ? (
        <div className="scan-camera">
          <LoaderCircle size={22} className="spin muted" />
          <p className="muted small">{t("scan.starting")}</p>
          <button className="btn sm" onClick={cancelStart}><X size={14} /> {t("scan.cancel")}</button>
        </div>
      ) : camera ? (
        <div className="scan-camera">
          <video ref={video} autoPlay playsInline muted />
          <div className="row">
            <button className="btn primary" onClick={snap}><Camera size={15} /> {t("scan.snap")}</button>
            <button className="btn" onClick={stopCamera}><X size={14} /> {t("scan.cancel")}</button>
          </div>
        </div>
      ) : photo ? (
        <div className="scan-adjust">
          <p className="muted small">{t("scan.dragHint")}</p>
          <div className="scan-stage-wrap">
            <div
              ref={stage}
              className="scan-stage"
              style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
              onPointerMove={onMove}
              onPointerUp={() => (drag.current = null)}
              onPointerLeave={() => (drag.current = null)}
            >
              <img src={photo.toDataURL("image/jpeg", 0.8)} alt="" draggable={false} />
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
                <polygon points={poly} />
              </svg>
              {corners.map((c, i) => (
                <button
                  key={i}
                  className="scan-handle"
                  style={{ left: `${(c.x / photo.width) * 100}%`, top: `${(c.y / photo.height) * 100}%` }}
                  onPointerDown={(e) => { drag.current = i; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); }}
                  onPointerMove={onMove}
                  onPointerUp={() => (drag.current = null)}
                  onKeyDown={(e) => {
                    const step = e.shiftKey ? 40 : 8;
                    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
                    if (d[e.key]) { e.preventDefault(); nudge(i, ...d[e.key]); }
                  }}
                  aria-label={t(`scan.corner${i}` as Key)}
                />
              ))}
            </div>
          </div>
          <div className="scan-bar">
            <div className="segmented-sm" role="group" aria-label={t("scan.look")}>
              {LOOKS.map((l) => <button key={l} className={look === l ? "on" : ""} aria-pressed={look === l} onClick={() => setLook(l)}>{t(`scan.${l}` as Key)}</button>)}
            </div>
            <button className="btn sm" onClick={turnPhoto}><RotateCw size={13} /> {t("scan.turn")}</button>
            <button className="btn sm" onClick={() => photo && setCorners(defaultCorners(photo.width, photo.height))}>{t("scan.resetCorners")}</button>
            <span className="flex" />
            <button className="btn sm" onClick={() => setPhoto(null)}>{t("scan.cancel")}</button>
            <button className="btn sm primary" disabled={!!busy} onClick={() => void addPage()}>
              {busy === "add" ? <LoaderCircle size={13} className="spin" /> : <Check size={13} />} {t("scan.addPage")}
            </button>
          </div>
        </div>
      ) : (
        <div className="scan-start">
          <button className="pdf-drop scan-choice" onClick={() => void openCamera()}>
            <Camera size={28} />
            <strong>{t("scan.useCamera")}</strong>
            <span className="muted small">{t("scan.cameraHint")}</span>
          </button>
          <button className="pdf-drop scan-choice" onClick={() => file.current?.click()}>
            <ImagePlus size={28} />
            <strong>{t("scan.usePhoto")}</strong>
            <span className="muted small">{t("scan.photoHint")}</span>
          </button>
        </div>
      )}

      {message && <p className={message.kind === "ok" ? "pdf-ok" : "field-error"} role={message.kind === "ok" ? "status" : "alert"}>{message.text}</p>}

      {pages.length > 0 && (
        <>
          <ol className="scan-pages" aria-label={t("pdf.pagesLabel")}>
            {pages.map((p, i) => (
              <li key={p.id}>
                <img src={p.thumb} alt={t("pdf.pageOf", { n: i + 1, name: "" })} />
                <span className="pdf-num">{i + 1}</span>
                <span className="pdf-tools">
                  <button onClick={() => setPages((ps) => move(ps, i, i - 1))} disabled={i === 0} aria-label={t("pdf.left")}><ChevronLeft size={13} /></button>
                  <button onClick={() => setPages((ps) => ps.filter((x) => x.id !== p.id))} aria-label={t("pdf.delete")}><Trash2 size={13} /></button>
                  <button onClick={() => setPages((ps) => move(ps, i, i + 1))} disabled={i === pages.length - 1} aria-label={t("pdf.right")}><ChevronRight size={13} /></button>
                </span>
              </li>
            ))}
          </ol>
          <OcrPanel images={pages.map((p) => new Blob([p.bytes as Uint8Array<ArrayBuffer>], { type: "image/jpeg" }))} name={name} t={t} lang={ctx.lang} />
          <div className="pdf-actions">
            <label className="field scan-name">
              <span>{t("pdf.name")}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("scan.defaultName")} maxLength={60} />
            </label>
            <span className="flex" />
            <button className="btn sm primary" disabled={!!busy} onClick={() => void save()}>
              {busy === "save" ? <LoaderCircle size={13} className="spin" /> : <FileStack size={13} />} {t("scan.save", { n: pages.length })}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
