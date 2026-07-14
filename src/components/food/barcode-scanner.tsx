"use client";

import { useEffect, useRef, useState } from "react";
import { Keyboard, X } from "lucide-react";

// Tipado minimo de la API nativa BarcodeDetector (aun no esta en lib.dom).
type DetectedBarcode = { rawValue: string };
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: {
      new (opts?: { formats?: string[] }): BarcodeDetectorLike;
    };
  }
}

export function BarcodeScanner({
  onDetect,
  onClose,
}: {
  onDetect: (barcode: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onDetectRef = useRef(onDetect);
  useEffect(() => {
    onDetectRef.current = onDetect;
  }, [onDetect]);

  // El escaner solo se monta tras un clic del usuario (nunca en SSR), asi que
  // leer window en el inicializador es seguro y no da hidratacion inconsistente.
  const [supported] = useState(
    () => typeof window !== "undefined" && "BarcodeDetector" in window,
  );
  const [manual, setManual] = useState(!supported);
  const [manualCode, setManualCode] = useState("");
  const [hint, setHint] = useState<string | null>(
    supported ? null : "Tu navegador no soporta el escáner. Introduce el código a mano.",
  );

  useEffect(() => {
    if (manual) return;

    let active = true;
    let raf = 0;

    (async () => {
      try {
        // El constructor va dentro del try: algunos navegadores exponen
        // window.BarcodeDetector pero no es un constructor real (lanza), y hay
        // que caer a entrada manual en vez de romper la pantalla.
        const detector = new window.BarcodeDetector!({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e"],
        });
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
        const scan = async () => {
          if (!active || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const value = codes[0]?.rawValue;
            if (value) {
              if (navigator.vibrate) navigator.vibrate(60);
              onDetectRef.current(value);
              return;
            }
          } catch {
            // Frame ilegible: seguimos intentando.
          }
          raf = requestAnimationFrame(scan);
        };
        raf = requestAnimationFrame(scan);
      } catch {
        if (active) {
          setManual(true);
          setHint("No se pudo iniciar el escáner. Introduce el código a mano.");
        }
      }
    })();

    return () => {
      active = false;
      cancelAnimationFrame(raf);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [manual]);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black pt-[env(safe-area-inset-top)]">
      <header className="flex shrink-0 items-center justify-between px-4 py-3 pt-8">
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar escáner"
          className="flex size-10 items-center justify-center rounded-full bg-white/10 text-white active:scale-95"
        >
          <X className="size-5" />
        </button>
        <p className="text-sm font-medium text-white">Escanear código</p>
        <button
          type="button"
          onClick={() => setManual((m) => !m)}
          aria-label="Introducir código a mano"
          className="flex size-10 items-center justify-center rounded-full bg-white/10 text-white active:scale-95"
        >
          <Keyboard className="size-5" />
        </button>
      </header>

      {manual ? (
        // Contenido arriba (no centrado) para que el teclado del movil no tape
        // el boton, y en <form> para que "Enter/Buscar" del teclado envie.
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (manualCode.replace(/\D/g, "").length >= 6) onDetect(manualCode);
          }}
          className="flex flex-col gap-3 px-6 pt-10"
        >
          {hint && <p className="text-center text-sm text-white/70">{hint}</p>}
          <input
            type="text"
            inputMode="numeric"
            enterKeyHint="search"
            autoFocus
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="Código de barras (ej. 3017620422003)"
            className="w-full rounded-2xl bg-white/10 px-4 py-3 text-center text-lg text-white outline-none placeholder:text-white/40"
          />
          <button
            type="submit"
            disabled={manualCode.replace(/\D/g, "").length < 6}
            className="w-full rounded-full bg-white py-3.5 text-sm font-medium text-black transition-opacity disabled:opacity-40"
          >
            Buscar alimento
          </button>
        </form>
      ) : (
        <div className="relative flex flex-1 items-center justify-center overflow-hidden">
          <video
            ref={videoRef}
            playsInline
            muted
            className="absolute inset-0 size-full object-cover"
          />
          {/* Marco guia */}
          <div className="relative z-10 h-40 w-72 rounded-2xl border-2 border-white/80 shadow-[0_0_0_100vmax_rgba(0,0,0,0.45)]" />
          <p className="absolute bottom-16 z-10 px-6 text-center text-sm text-white/80">
            Apunta al código de barras del producto
          </p>
        </div>
      )}
    </div>
  );
}
