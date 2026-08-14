"use client";

import { useEffect, useRef, useState } from "react";
import { Keyboard, X } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { BarcodeScanner as NativeScanner, BarcodeFormat } from "@capacitor-mlkit/barcode-scanning";
import type { BrowserMultiFormatReader } from "@zxing/library";

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

/**
 * Vuelve transparente el WebView (html+body) mientras escanea en nativo, para
 * que se vea la cámara que el plugin ML Kit pinta DETRÁS. El CSS asociado
 * (globals.css: `.barcode-scanner-active`) oculta la app y deja visible solo el
 * overlay `.barcode-scanner-ui`. Se quita siempre al terminar o al fallar.
 */
function toggleScannerTransparency(active: boolean): void {
  const method = active ? "add" : "remove";
  document.documentElement.classList[method]("barcode-scanner-active");
  document.body.classList[method]("barcode-scanner-active");
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
  const [isNative] = useState(() => Capacitor.isNativePlatform());

  useEffect(() => {
    onDetectRef.current = onDetect;
  }, [onDetect]);

  const [supported] = useState(() => {
    if (typeof window === "undefined") return false;
    // En nativo siempre intentamos usar el plugin.
    if (Capacitor.isNativePlatform()) return true;
    // En web, soportamos si existe BarcodeDetector o si usaremos el fallback de software.
    return true;
  });

  const [manual, setManual] = useState(!supported);
  const [manualCode, setManualCode] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [isSoftwareScanning, setIsSoftwareScanning] = useState(false);

  useEffect(() => {
    if (manual) return;

    let active = true;
    let raf = 0;
    let zxingReader: BrowserMultiFormatReader | null = null;

    const startNativeScanner = async () => {
      try {
        const { supported: nativeSupported } = await NativeScanner.isSupported();
        if (!nativeSupported) {
          // Movil sin Google Play Services (ML Kit no existe): se cae al
          // escaner web, que en el WebView de Capacitor tambien funciona.
          await startWebScanner();
          return;
        }

        const { camera: currentCamera } = await NativeScanner.checkPermissions();
        if (currentCamera !== "granted") {
          const { camera } = await NativeScanner.requestPermissions();
          if (camera !== "granted") {
            setManual(true);
            setHint("Permiso de cámara denegado. Actívalo en los ajustes de la app.");
            return;
          }
        }

        // El modulo se descarga de Google Play la primera vez. Si falla (sin
        // red, sin Play Store) NO es fatal: en muchos moviles el escaneo tira
        // igual con el modulo empaquetado, asi que solo se registra el aviso.
        try {
          const { available } = await NativeScanner.isGoogleBarcodeScannerModuleAvailable();
          if (!available) await NativeScanner.installGoogleBarcodeScannerModule();
        } catch (err) {
          console.warn("No se pudo instalar el modulo de ML Kit:", err);
        }

        if (!active) return;

        const listener = await NativeScanner.addListener("barcodesScanned", (event) => {
          const barcode = event.barcodes[0];
          if (active && barcode?.rawValue) {
            if (navigator.vibrate) navigator.vibrate(60);
            onDetectRef.current(barcode.rawValue);
          }
        });

        const stopNative = () => {
          listener.remove();
          NativeScanner.stopScan();
          toggleScannerTransparency(false);
        };

        // Desmontado mientras se registraba el listener: no llegar a arrancar.
        if (!active) {
          stopNative();
          return;
        }

        toggleScannerTransparency(true);
        await NativeScanner.startScan({
          formats: [BarcodeFormat.Ean13, BarcodeFormat.Ean8, BarcodeFormat.UpcA, BarcodeFormat.UpcE],
        });

        return stopNative;
      } catch (err) {
        console.error("Native Scanner error:", err);
        toggleScannerTransparency(false);
        setManual(true);
        setHint("Error al iniciar el escáner nativo.");
      }
    };

    const startWebScanner = async () => {
      try {
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

        // INTENTO 1: BarcodeDetector (Nativo del navegador, ej. Chrome)
        if ("BarcodeDetector" in window) {
          const detector = new window.BarcodeDetector!({
            formats: ["ean_13", "ean_8", "upc_a", "upc_e"],
          });
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
            } catch {}
            raf = requestAnimationFrame(scan);
          };
          raf = requestAnimationFrame(scan);
        }
        // INTENTO 2: ZXing (Software, ej. Safari / PWA iOS)
        else {
          setIsSoftwareScanning(true);
          const { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat: ZXingFormat } = await import("@zxing/library");

          const hints = new Map();
          const formats = [
            ZXingFormat.EAN_13,
            ZXingFormat.EAN_8,
            ZXingFormat.UPC_A,
            ZXingFormat.UPC_E,
            ZXingFormat.CODE_128,
          ];
          hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);
          hints.set(DecodeHintType.TRY_HARDER, true);

          zxingReader = new BrowserMultiFormatReader(hints);

          const scanSoftware = async () => {
            if (!active || !videoRef.current || !zxingReader) return;
            try {
              const result = await zxingReader.decodeFromVideoElement(videoRef.current);
              if (result && result.getText()) {
                if (navigator.vibrate) navigator.vibrate(60);
                onDetectRef.current(result.getText());
                return;
              }
            } catch {
              // No hay código en este frame, reintentamos en 200ms para no saturar CPU en software
              if (active) setTimeout(scanSoftware, 200);
            }
          };
          scanSoftware();
        }
      } catch (err) {
        console.error("Web Scanner error:", err);
        if (active) {
          setManual(true);
          setHint("No se pudo acceder a la cámara.");
        }
      }
    };

    let cleanup: (() => void) | undefined;
    if (isNative) {
      startNativeScanner().then((c) => (cleanup = c));
    } else {
      startWebScanner();
    }

    return () => {
      active = false;
      if (isNative) {
        cleanup?.();
        // Red de seguridad: si el escáner falló antes de devolver su cleanup,
        // la clase podría haber quedado puesta y la app invisible.
        toggleScannerTransparency(false);
      } else {
        cancelAnimationFrame(raf);
        if (zxingReader) zxingReader.reset();
        streamRef.current?.getTracks().forEach((t) => t.stop());
      }
    };
  }, [manual, isNative]);

  return (
    <div
      className={`barcode-scanner-ui fixed inset-0 z-[80] flex flex-col pt-[env(safe-area-inset-top)] ${
        isNative ? "bg-transparent" : "bg-black"
      }`}
    >
      <header className="flex shrink-0 items-center justify-between px-4 py-3 pt-8">
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar escáner"
          className="flex size-10 items-center justify-center rounded-full bg-white/10 text-white active:scale-95"
        >
          <X className="size-5" />
        </button>
        <div className="flex flex-col items-center">
          <p className="text-sm font-medium text-white">Escanear código</p>
          {!isNative && !("BarcodeDetector" in window) && supported && !manual && (
            <span className="text-[10px] text-white/50 uppercase tracking-widest">Modo PWA</span>
          )}
        </div>
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
          {!isNative && (
            <video
              ref={videoRef}
              playsInline
              muted
              className="absolute inset-0 size-full object-cover"
            />
          )}
          {/* Marco guia */}
          <div className="relative z-10 h-40 w-72 rounded-2xl border-2 border-white/80 shadow-[0_0_0_100vmax_rgba(0,0,0,0.45)]" />
          <p className="absolute bottom-16 z-10 px-6 text-center text-sm text-white/80">
            Apunta al código de barras del producto
          </p>
          {isSoftwareScanning && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-3 py-1 backdrop-blur-sm">
              <p className="text-[10px] text-white/70">Procesando por software...</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
