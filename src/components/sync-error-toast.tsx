"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { CloudOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NOTIFICATION_CARD_CLASS } from "@/components/ui/notification-stack";
import { cn } from "@/lib/utils";
import {
  dismissFailedWrites,
  getFailedWrites,
  retryFailedWrites,
  subscribeSyncFailures,
} from "@/lib/supabase/sync";

const subscribeNever = () => () => {};

/** Aviso persistente cuando alguna escritura a Supabase ha fallado tras los
 *  reintentos automaticos: lo que se ve en pantalla NO esta guardado. Se
 *  renderiza dentro de #app-shell (mismo patron que los modales) para casar
 *  con el ancho del frame de la app. */
export function SyncErrorToast() {
  const failed = useSyncExternalStore(
    subscribeSyncFailures,
    getFailedWrites,
    getFailedWrites,
  );
  // false durante SSR/hidratacion, true tras montar: no hay #app-shell hasta
  // que existe el DOM.
  const mounted = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );

  if (failed.length === 0 || !mounted) return null;
  // Contenedor compartido con el resto de avisos (ver notification-stack.tsx):
  // se apilan sobre la barra de navegacion en vez de solaparse.
  const portalTarget = document.getElementById("notification-stack");
  if (!portalTarget) return null;

  const labels = [...new Set(failed.map((f) => f.label))].join(", ");

  return createPortal(
    <div
      role="alert"
      className={cn(NOTIFICATION_CARD_CLASS, "[animation:toast-in_0.2s_ease-out]")}
    >
      <CloudOff className="size-5 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Cambios sin guardar</p>
        <p className="truncate text-xs text-muted-foreground">
          No se pudo guardar: {labels}.
        </p>
      </div>
      <Button onClick={retryFailedWrites} className="shrink-0 px-3 py-1.5 text-xs">
        Reintentar
      </Button>
      <button
        type="button"
        onClick={dismissFailedWrites}
        aria-label="Descartar aviso"
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>,
    portalTarget,
  );
}
