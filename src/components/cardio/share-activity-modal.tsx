"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  X,
  Pencil,
  Camera,
  Download,
  Share2,
  ImageOff,
  Move,
  Crosshair,
  Check,
} from "lucide-react";
import type { CardioSession } from "@/lib/store/cardio-store";
import { useToast } from "@/components/ui/toast";

type ShareFormat = "story" | "square";

const FORMATS: Record<ShareFormat, { w: number; h: number; label: string }> = {
  story: { w: 1080, h: 1920, label: "Historia" },
  square: { w: 1080, h: 1080, label: "Cuadrado" },
};

/** Temas del mapa: el mapa base se re-colorea con un duotono (oscuro→`low`,
 *  claro→`high`), dando un mapa monocromo en el tono del tema. `dark` decide el
 *  color de ruta/texto. */
type MapTheme = {
  id: string;
  label: string;
  dot: string;
  dark: boolean;
  low: string;
  high: string;
  fg: string;
};

const MAP_THEMES: MapTheme[] = [
  { id: "noche", label: "Noche", dot: "#17181c", dark: true, low: "#0a0a0c", high: "#52535a", fg: "#ffffff" },
  { id: "claro", label: "Claro", dot: "#e6e6e9", dark: false, low: "#ffffff", high: "#6b7280", fg: "#17181c" },
  { id: "lila", label: "Lila", dot: "#a99cf0", dark: false, low: "#ece9fb", high: "#4b3e7a", fg: "#3a2f63" },
  { id: "azul", label: "Azul", dot: "#7db8e8", dark: false, low: "#e1f1fc", high: "#2c5d7a", fg: "#22485f" },
  { id: "menta", label: "Menta", dot: "#79d3ad", dark: false, low: "#e2f7ee", high: "#276e51", fg: "#1d5a41" },
];

const TILE = 256;

function formatTime(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = m.toString().padStart(2, "0");
  const ss = s.toString().padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function paceDisplay(distanceKm: number, durationSec: number) {
  if (distanceKm <= 0) return "--";
  const pace = durationSec / 60 / distanceKm;
  const min = Math.floor(pace);
  const sec = Math.round((pace - min) * 60);
  return `${min}'${sec.toString().padStart(2, "0")}"`;
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

/** Web Mercator a pixeles de mundo al zoom (float) z. */
function worldPx(lat: number, lng: number, z: number) {
  const s = TILE * 2 ** z;
  const x = ((lng + 180) / 360) * s;
  const sin = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s;
  return { x, y };
}

function loadImage(src: string, cors = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Encuadre del mapa: zoom (float) + origen del canvas en pixeles de mundo. */
type View = { zoom: number; ox: number; oy: number };

export function ShareActivityModal({
  session,
  onClose,
}: {
  session: CardioSession;
  onClose: () => void;
}) {
  const { notify } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLImageElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const drawToken = useRef(0);
  const tileCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gestureRef = useRef<{ dist: number; cx: number; cy: number } | null>(null);

  const [format, setFormat] = useState<ShareFormat>("story");
  const [themeId, setThemeId] = useState("noche");
  const [hasPhoto, setHasPhoto] = useState(false);
  const [editing, setEditing] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [busy, setBusy] = useState(false);

  const theme = MAP_THEMES.find((t) => t.id === themeId) ?? MAP_THEMES[0];
  const hasRoute = session.coordinates.length > 1;
  const showMap = !hasPhoto && hasRoute;

  const dateStr = new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(session.dateISO));

  /** Encuadre inicial: centra la ruta con margen segun el formato. */
  const initialView = useCallback(
    (fmt: ShareFormat): View => {
      const { w: W, h: H } = FORMATS[fmt];
      const coords = session.coordinates;
      if (coords.length === 0) return { zoom: 14, ox: 0, oy: 0 };
      const lats = coords.map((c) => c.lat);
      const lngs = coords.map((c) => c.lng);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);
      let z = 2;
      for (let zz = 18; zz >= 2; zz--) {
        const a = worldPx(maxLat, minLng, zz);
        const b = worldPx(minLat, maxLng, zz);
        if (Math.abs(b.x - a.x) <= W * 0.8 && Math.abs(b.y - a.y) <= H * 0.48) {
          z = zz;
          break;
        }
      }
      const c = worldPx((minLat + maxLat) / 2, (minLng + maxLng) / 2, z);
      return { zoom: z, ox: c.x - W / 2, oy: c.y - H * 0.42 };
    },
    [session.coordinates],
  );

  const [view, setView] = useState<View>(() => initialView("story"));

  // Reencuadra al cambiar de formato.
  useEffect(() => {
    setView(initialView(format));
  }, [format, initialView]);

  const drawMap = useCallback(
    async (ctx: CanvasRenderingContext2D, W: number, H: number, th: MapTheme, v: View) => {
      const tz = clamp(Math.round(v.zoom), 0, 19);
      const sf = 2 ** (v.zoom - tz);
      const n = 2 ** tz;

      ctx.fillStyle = "#0a0a0c";
      ctx.fillRect(0, 0, W, H);

      const jobs: Promise<{ img: HTMLImageElement | null; dx: number; dy: number }>[] = [];
      const txMin = Math.floor(v.ox / sf / TILE);
      const txMax = Math.floor((v.ox + W) / sf / TILE);
      const tyMin = Math.floor(v.oy / sf / TILE);
      const tyMax = Math.floor((v.oy + H) / sf / TILE);
      for (let tx = txMin; tx <= txMax; tx++) {
        for (let ty = tyMin; ty <= tyMax; ty++) {
          if (ty < 0 || ty >= n) continue;
          const wx = ((tx % n) + n) % n;
          const sub = "abcd"[Math.abs(tx + ty) % 4];
          const url = `https://${sub}.basemaps.cartocdn.com/dark_nolabels/${tz}/${wx}/${ty}@2x.png`;
          const dx = tx * TILE * sf - v.ox;
          const dy = ty * TILE * sf - v.oy;
          const cached = tileCache.current.get(url);
          if (cached && cached.complete && cached.naturalWidth > 0) {
            jobs.push(Promise.resolve({ img: cached, dx, dy }));
          } else {
            jobs.push(
              loadImage(url, true)
                .then((img) => {
                  tileCache.current.set(url, img);
                  return { img, dx, dy };
                })
                .catch(() => ({ img: null, dx, dy })),
            );
          }
        }
      }
      const tiles = await Promise.all(jobs);
      const size = TILE * sf;
      for (const t of tiles) if (t.img) ctx.drawImage(t.img, t.dx, t.dy, size, size);

      const lo = hexToRgb(th.low);
      const hi = hexToRgb(th.high);
      const imgData = ctx.getImageData(0, 0, W, H);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
        d[i] = lo.r + (hi.r - lo.r) * lum;
        d[i + 1] = lo.g + (hi.g - lo.g) * lum;
        d[i + 2] = lo.b + (hi.b - lo.b) * lum;
      }
      ctx.putImageData(imgData, 0, 0);
    },
    [],
  );

  const draw = useCallback(async () => {
    const token = ++drawToken.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { w: W, h: H } = FORMATS[format];
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const photo = photoRef.current;
    const usingPhoto = !!(photo && photo.complete && photo.naturalWidth > 0);
    const withMap = !usingPhoto && hasRoute;
    const dark = usingPhoto ? true : theme.dark;
    const fg = usingPhoto ? "#ffffff" : theme.fg;

    if (usingPhoto && photo) {
      const scale = Math.max(W / photo.naturalWidth, H / photo.naturalHeight);
      const dw = photo.naturalWidth * scale;
      const dh = photo.naturalHeight * scale;
      ctx.drawImage(photo, (W - dw) / 2, (H - dh) / 2, dw, dh);
    } else if (withMap) {
      await drawMap(ctx, W, H, theme, view);
      if (token !== drawToken.current) return;
    } else {
      ctx.fillStyle = theme.low;
      ctx.fillRect(0, 0, W, H);
    }

    if (usingPhoto || (withMap && dark)) {
      const top = ctx.createLinearGradient(0, 0, 0, H * 0.26);
      top.addColorStop(0, "rgba(0,0,0,0.5)");
      top.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = top;
      ctx.fillRect(0, 0, W, H * 0.26);
      const bot = ctx.createLinearGradient(0, H * 0.52, 0, H);
      bot.addColorStop(0, "rgba(0,0,0,0)");
      bot.addColorStop(1, "rgba(0,0,0,0.8)");
      ctx.fillStyle = bot;
      ctx.fillRect(0, H * 0.52, W, H * 0.48);
    }

    const P = 72;
    const secondary = 0.72;

    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.globalAlpha = 1;
    ctx.fillStyle = fg;
    ctx.font = "800 48px system-ui, sans-serif";
    ctx.fillText("ROGUE", P, 108);
    ctx.globalAlpha = secondary;
    ctx.font = "500 30px system-ui, sans-serif";
    ctx.fillText(dateStr, P, 152);
    ctx.globalAlpha = 1;

    // Ruta (proyectada con el mismo zoom/origen del encuadre)
    const pts = session.coordinates.map((c) => {
      const p = worldPx(c.lat, c.lng, view.zoom);
      return { x: p.x - view.ox, y: p.y - view.oy };
    });
    if (withMap && pts.length > 1) {
      ctx.save();
      ctx.shadowColor = dark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.6)";
      ctx.shadowBlur = 18;
      ctx.strokeStyle = fg;
      ctx.lineWidth = 13;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
      ctx.restore();
      const start = pts[0];
      const end = pts[pts.length - 1];
      ctx.lineWidth = 6;
      ctx.strokeStyle = fg;
      ctx.fillStyle = dark ? "#0a0a0c" : "#ffffff";
      ctx.beginPath();
      ctx.arc(start.x, start.y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(end.x, end.y, 13, 0, Math.PI * 2);
      ctx.fill();
    }

    if (withMap) {
      ctx.textAlign = "right";
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = fg;
      ctx.font = "400 18px system-ui, sans-serif";
      ctx.fillText("© OpenStreetMap · CARTO", W - 20, H - 14);
      ctx.globalAlpha = 1;
      ctx.textAlign = "left";
    }

    const mono = 'ui-monospace, SFMono-Regular, Menlo, "Roboto Mono", monospace';
    const distValue = session.distanceKm.toFixed(2);
    ctx.globalAlpha = secondary;
    ctx.fillStyle = fg;
    ctx.font = "600 30px system-ui, sans-serif";
    ctx.fillText("DISTANCIA", P, H - 250);
    ctx.globalAlpha = 1;
    ctx.font = `800 148px ${mono}`;
    ctx.fillText(distValue, P - 4, H - 130);
    const distW = ctx.measureText(distValue).width;
    ctx.globalAlpha = 0.9;
    ctx.font = "700 48px system-ui, sans-serif";
    ctx.fillText("km", P + distW + 8, H - 130);
    ctx.globalAlpha = 1;

    const cols = [
      { label: "TIEMPO", value: formatTime(session.durationSec) },
      { label: "RITMO", value: paceDisplay(session.distanceKm, session.durationSec) },
    ];
    const colGap = (W - P * 2) / cols.length;
    cols.forEach((c, i) => {
      const x = P + i * colGap;
      ctx.globalAlpha = secondary;
      ctx.font = "600 28px system-ui, sans-serif";
      ctx.fillText(c.label, x, H - 78);
      ctx.globalAlpha = 1;
      ctx.font = `700 60px ${mono}`;
      ctx.fillText(c.value, x, H - 20);
    });
  }, [format, theme, dateStr, session, hasRoute, view, drawMap]);

  useEffect(() => {
    draw();
  }, [draw, hasPhoto]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  // --- Gestos (arrastrar + pellizcar) sobre el canvas ---
  const canvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    const ratio = c.width / r.width;
    return { x: (e.clientX - r.left) * ratio, y: (e.clientY - r.top) * ratio };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!adjusting || !showMap) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, canvasPoint(e));
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      gestureRef.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
      };
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!adjusting || !showMap) return;
    const prev = pointersRef.current.get(e.pointerId);
    if (!prev) return;
    const p = canvasPoint(e);
    pointersRef.current.set(e.pointerId, p);
    const pts = [...pointersRef.current.values()];
    if (pts.length === 1) {
      const dx = p.x - prev.x;
      const dy = p.y - prev.y;
      setView((v) => ({ ...v, ox: v.ox - dx, oy: v.oy - dy }));
    } else if (pts.length >= 2) {
      const [a, b] = pts;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const g = gestureRef.current;
      if (g && g.dist > 0) {
        const f = dist / g.dist;
        setView((v) => {
          const newZoom = clamp(v.zoom + Math.log2(f), 3, 19);
          const af = 2 ** (newZoom - v.zoom);
          const ox = (v.ox + cx) * af - cx - (cx - g.cx);
          const oy = (v.oy + cy) * af - cy - (cy - g.cy);
          return { zoom: newZoom, ox, oy };
        });
      }
      gestureRef.current = { dist, cx, cy };
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) gestureRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

  const selectTheme = (id: string) => {
    if (hasPhoto) removePhoto();
    setThemeId(id);
  };

  const onPickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    const img = new Image();
    img.onload = () => {
      photoRef.current = img;
      setHasPhoto(true);
      setEditing(false);
      draw();
    };
    img.onerror = () => notify("No se pudo cargar la imagen", "error");
    img.src = url;
  };

  const removePhoto = () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    photoRef.current = null;
    setHasPhoto(false);
  };

  const toBlob = () =>
    new Promise<Blob | null>((resolve) => {
      try {
        canvasRef.current?.toBlob((b) => resolve(b), "image/png", 0.95);
      } catch {
        resolve(null);
      }
    });

  const downloadBlob = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rogue-${session.dateISO.slice(0, 10)}.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const share = async () => {
    setBusy(true);
    try {
      const blob = await toBlob();
      if (!blob) throw new Error("blob");
      const file = new File([blob], `rogue-${session.dateISO.slice(0, 10)}.png`, {
        type: "image/png",
      });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: "Mi actividad en Rogue" });
      } else {
        downloadBlob(blob);
        notify("Imagen descargada", "success");
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") notify("No se pudo compartir", "error");
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    setBusy(true);
    try {
      const blob = await toBlob();
      if (!blob) throw new Error("blob");
      downloadBlob(blob);
      notify("Imagen descargada", "success");
    } catch {
      notify("No se pudo generar la imagen", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0c0c0f]">
      {/* Barra superior */}
      {!adjusting && (
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={onClose}
            className="flex size-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            aria-label="Cerrar"
          >
            <X className="size-5" />
          </button>
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20"
          >
            <Pencil className="size-4" />
            Editar
          </button>
        </div>
      )}

      {/* Vista de la historia */}
      <div className="flex flex-1 items-center justify-center overflow-hidden p-4">
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
          style={{
            aspectRatio: `${FORMATS[format].w} / ${FORMATS[format].h}`,
            touchAction: adjusting ? "none" : "auto",
            cursor: adjusting ? "grab" : "default",
          }}
        />
      </div>

      {/* Barra inferior: acciones o ajuste */}
      {adjusting ? (
        <div className="flex items-center justify-between gap-3 px-4 py-4">
          <button
            onClick={() => setView(initialView(format))}
            className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/20"
          >
            <Crosshair className="size-4" />
            Recentrar
          </button>
          <span className="flex-1 text-center text-xs text-white/60">
            Arrastra y pellizca para ajustar
          </span>
          <button
            onClick={() => setAdjusting(false)}
            className="flex items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#0c0c0f]"
          >
            <Check className="size-4" />
            Listo
          </button>
        </div>
      ) : (
        <div className="flex gap-2 px-4 py-4">
          <button
            onClick={download}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-2 rounded-full border border-white/25 py-3 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
          >
            <Download className="size-4" />
            Descargar
          </button>
          <button
            onClick={share}
            disabled={busy}
            className="flex flex-[1.5] items-center justify-center gap-2 rounded-full bg-white py-3 text-sm font-semibold text-[#0c0c0f] transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            <Share2 className="size-4" />
            Compartir
          </button>
        </div>
      )}

      {/* Bottom sheet de edicion */}
      {editing && (
        <div className="absolute inset-0 z-10 flex flex-col justify-end">
          <button
            aria-label="Cerrar edicion"
            onClick={() => setEditing(false)}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          <div className="relative rounded-t-3xl border-t border-border bg-surface p-5 pb-7">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold">Editar historia</h3>
              <button
                onClick={() => setEditing(false)}
                className="flex size-9 items-center justify-center rounded-full hover:bg-muted"
                aria-label="Cerrar"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Formato */}
            <p className="mb-2 font-mono text-[10px] font-medium tracking-widest text-muted-foreground">
              FORMATO
            </p>
            <div className="mb-4 flex gap-2">
              {(Object.keys(FORMATS) as ShareFormat[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={`flex-1 rounded-full py-2 text-sm font-medium transition-colors ${
                    format === f
                      ? "bg-accent text-accent-foreground"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {FORMATS[f].label}
                </button>
              ))}
            </div>

            {/* Tema (solo con mapa) */}
            {!hasPhoto && (
              <>
                <p className="mb-2 font-mono text-[10px] font-medium tracking-widest text-muted-foreground">
                  TEMA
                </p>
                <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
                  {MAP_THEMES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => selectTheme(t.id)}
                      className={`flex shrink-0 items-center gap-2 rounded-full py-2 pl-2.5 pr-3.5 text-sm font-medium transition-colors ${
                        themeId === t.id
                          ? "bg-accent text-accent-foreground"
                          : "bg-background text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <span
                        className="size-4 rounded-full border border-black/10"
                        style={{ backgroundColor: t.dot }}
                      />
                      {t.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Acciones de fondo */}
            <div className="flex flex-col gap-2">
              {showMap && (
                <button
                  onClick={() => {
                    setEditing(false);
                    setAdjusting(true);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-full border border-border bg-background py-2.5 text-sm font-medium hover:bg-muted"
                >
                  <Move className="size-4" />
                  Ajustar mapa
                </button>
              )}
              {hasPhoto ? (
                <button
                  onClick={removePhoto}
                  className="flex w-full items-center justify-center gap-2 rounded-full border border-border bg-background py-2.5 text-sm font-medium hover:bg-muted"
                >
                  <ImageOff className="size-4" />
                  Quitar foto de fondo
                </button>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-full border border-border bg-background py-2.5 text-sm font-medium hover:bg-muted"
                >
                  <Camera className="size-4" />
                  Usar foto de fondo
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPickPhoto}
      />
    </div>
  );
}
