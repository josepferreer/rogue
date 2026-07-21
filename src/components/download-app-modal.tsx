"use client";

import { useEffect, useState } from "react";
import { Download, Smartphone, Share, Plus, X, Check } from "lucide-react";

/** URL del APK servido desde /public. Cambia por una release firmada o un
 *  enlace de GitHub Releases / CDN cuando distribuyas en serio. */
const APK_URL = "/downloads/Rogue.apk";

/** Evento no estandar de Chromium; no esta en los tipos del DOM. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Platform = "android" | "ios" | "desktop";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  if (
    /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  ) {
    return "ios";
  }
  return "desktop";
}

/**
 * Boton "Descargar app" que abre un modal con la opcion adecuada segun la
 * plataforma:
 * - Android: descarga directa del APK + opcion de instalar como PWA.
 * - iOS (Safari): instrucciones para anadir a la pantalla de inicio (no hay
 *   API de instalacion ni APK).
 * - Escritorio / otros: instalar como PWA (via beforeinstallprompt) o QR/APK.
 *
 * El SW solo se registra en produccion, asi que el evento `beforeinstallprompt`
 * no se dispara en `npm run dev`: para probar la instalacion PWA usa
 * `npm run build && npm start`.
 */
export function DownloadAppModal({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [installed, setInstalled] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    setPlatform(detectPlatform());
    setInstalled(isStandalone());

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
      setOpen(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Bloquea el scroll del body mientras el modal esta abierto.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Cierra con Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Ya instalada: no hay nada que descargar.
  if (installed) return null;

  const triggerClass =
    className ??
    "flex w-full items-center justify-center gap-2 rounded-full bg-accent px-7 py-3.5 text-sm font-medium text-accent-foreground transition-transform active:scale-[0.98]";

  const installPwa = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === "accepted") setInstalled(true);
    setOpen(false);
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={triggerClass}>
        <Download className="size-4" />
        Descargar app
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Descargar Rogue"
        >
          {/* Overlay */}
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />

          {/* Sheet / dialog */}
          <div className="relative w-full max-w-md rounded-t-3xl border border-border bg-surface p-6 shadow-xl sm:rounded-3xl">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold tracking-tight">
                  Descargar Rogue
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Elige como quieres llevar Rogue en tu movil.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-muted"
                aria-label="Cerrar"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="space-y-3">
              {platform === "android" && (
                <>
                  <a
                    href={APK_URL}
                    download
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 rounded-2xl bg-accent px-4 py-3.5 text-accent-foreground transition-transform active:scale-[0.99]"
                  >
                    <Download className="size-5 shrink-0" />
                    <span className="flex flex-col text-left">
                      <span className="text-sm font-medium">Descargar APK</span>
                      <span className="text-xs opacity-80">
                        App nativa Android · notificaciones y GPS
                      </span>
                    </span>
                  </a>
                  {deferred && (
                    <button
                      type="button"
                      onClick={installPwa}
                      className="flex w-full items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3.5 text-left transition-colors hover:bg-muted"
                    >
                      <Smartphone className="size-5 shrink-0 text-muted-foreground" />
                      <span className="flex flex-col">
                        <span className="text-sm font-medium">
                          Instalar como PWA
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Sin salir del navegador, se anade a tu pantalla
                        </span>
                      </span>
                    </button>
                  )}
                </>
              )}

              {platform === "ios" && (
                <div className="rounded-2xl border border-border bg-background px-4 py-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Smartphone className="size-5 text-muted-foreground" />
                    Instalar en iPhone / iPad
                  </div>
                  <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <Check className="size-4 shrink-0 text-accent" />
                      <span>
                        Pulsa{" "}
                        <Share className="inline size-4 align-text-bottom" />{" "}
                        <span className="font-medium text-foreground">
                          Compartir
                        </span>{" "}
                        en la barra de Safari
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="size-4 shrink-0 text-accent" />
                      <span>
                        Elige{" "}
                        <Plus className="inline size-4 align-text-bottom" />{" "}
                        <span className="font-medium text-foreground">
                          Anadir a pantalla de inicio
                        </span>
                      </span>
                    </li>
                  </ol>
                  <p className="mt-3 text-xs text-muted-foreground">
                    En iOS no hay APK: Rogue se instala como app web (PWA).
                  </p>
                </div>
              )}

              {platform === "desktop" && (
                <>
                  {deferred ? (
                    <button
                      type="button"
                      onClick={installPwa}
                      className="flex w-full items-center gap-3 rounded-2xl bg-accent px-4 py-3.5 text-left text-accent-foreground transition-transform active:scale-[0.99]"
                    >
                      <Download className="size-5 shrink-0" />
                      <span className="flex flex-col">
                        <span className="text-sm font-medium">
                          Instalar como app
                        </span>
                        <span className="text-xs opacity-80">
                          Se abre en su propia ventana
                        </span>
                      </span>
                    </button>
                  ) : (
                    <p className="rounded-2xl border border-border bg-background px-4 py-3.5 text-sm text-muted-foreground">
                      Abre esta pagina en Chrome o Edge para instalar Rogue como
                      app, o entra desde tu movil para descargar el APK (Android)
                      o instalar la PWA (iPhone).
                    </p>
                  )}
                  <a
                    href={APK_URL}
                    download
                    className="flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3.5 text-left transition-colors hover:bg-muted"
                  >
                    <Smartphone className="size-5 shrink-0 text-muted-foreground" />
                    <span className="flex flex-col">
                      <span className="text-sm font-medium">
                        Descargar APK (Android)
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Pasalo a tu telefono e instalalo
                      </span>
                    </span>
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
