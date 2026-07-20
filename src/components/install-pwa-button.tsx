"use client";

import { useEffect, useState } from "react";
import { Download, Share, Plus } from "lucide-react";

/** Evento no estandar de Chromium; no esta en los tipos del DOM. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari iOS expone esta propiedad no estandar cuando corre instalada.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS 13+ se identifica como Mac; se distingue por el touch.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/**
 * Boton para instalar la PWA con soporte por plataforma:
 * - Android / escritorio (Chrome, Edge): captura `beforeinstallprompt` y lanza
 *   el dialogo nativo de instalacion al pulsar.
 * - iOS (Safari): no existe API de instalacion; se muestran las instrucciones
 *   manuales (Compartir -> Anadir a pantalla de inicio).
 * - Ya instalada u otros navegadores que no soportan la instalacion: no pinta
 *   nada.
 *
 * El SW solo se registra en produccion, asi que en `npm run dev` el evento no
 * se dispara: para probar el boton hay que usar `npm run build && npm start`.
 */
export function InstallPwaButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    setIos(isIos());

    const onPrompt = (e: Event) => {
      e.preventDefault(); // evita el mini-infobar por defecto de Chrome
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Ya instalada: no hay nada que ofrecer.
  if (installed) return null;
  // Android/escritorio que aun no ofrecen la instalacion (evento no disparado,
  // o navegador sin soporte como Firefox): no pintamos seccion vacia.
  if (!ios && !deferred) return null;

  const buttonClass =
    "flex w-full items-center justify-center gap-2 rounded-full border border-border bg-surface py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

  return (
    <div className="mt-8">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        Instala Rogue en tu movil
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="mt-4">
        {ios ? (
          <>
            <button
              type="button"
              onClick={() => setShowIosHint((v) => !v)}
              className={buttonClass}
            >
              <Download className="size-4" />
              Instalar app
            </button>
            {showIosHint && (
              <p className="mt-3 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-center text-xs text-muted-foreground">
                <span>Pulsa</span>
                <Share className="inline size-3.5" />
                <span className="font-medium text-foreground">Compartir</span>
                <span>y luego</span>
                <Plus className="inline size-3.5" />
                <span className="font-medium text-foreground">
                  Anadir a pantalla de inicio
                </span>
              </p>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={async () => {
              if (!deferred) return;
              await deferred.prompt();
              const { outcome } = await deferred.userChoice;
              // El evento no se reutiliza: si se descarto, se pedira de nuevo
              // cuando el navegador vuelva a considerarlo instalable.
              setDeferred(null);
              if (outcome === "accepted") setInstalled(true);
            }}
            className={buttonClass}
          >
            <Download className="size-4" />
            Instalar app
          </button>
        )}
      </div>
    </div>
  );
}
