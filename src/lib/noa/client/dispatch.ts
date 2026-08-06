import type { NoaClientAction } from "@/lib/noa/types";

/**
 * Dispatcher de acciones de cliente (canal híbrido). Traduce una
 * `NoaClientAction` tipada a un efecto real en la app. Lista blanca: un tipo
 * desconocido se ignora.
 *
 * De momento solo `navigate` está cableado del todo; el resto avisa por toast
 * como marcador hasta conectar cada uno con su store / Capacitor (TODO).
 */
export interface DispatchDeps {
  navigate: (path: string) => void;
  notify: (message: string, variant?: "success" | "error" | "info") => void;
}

export function dispatchNoaAction(
  action: NoaClientAction,
  deps: DispatchDeps,
): void {
  switch (action.type) {
    case "navigate":
      deps.navigate(action.path);
      return;

    // TODO: cablear con workout-session-store / cardio-store / Capacitor.
    case "startWorkout":
      deps.notify("NOA quiere iniciar un entreno (pendiente de cablear).", "info");
      return;
    case "startCardio":
      deps.notify("NOA quiere iniciar cardio (pendiente de cablear).", "info");
      return;
    case "scheduleLocalNotification":
      deps.notify("NOA quiere programar un recordatorio (pendiente).", "info");
      return;
    case "cancelLocalNotification":
      deps.notify("NOA quiere cancelar un recordatorio (pendiente).", "info");
      return;
    case "openModal":
      deps.notify(`NOA quiere abrir: ${action.modal} (pendiente).`, "info");
      return;
    case "prefillForm":
      deps.notify(`NOA quiere rellenar: ${action.form} (pendiente).`, "info");
      return;
    case "highlight":
      deps.notify(`NOA quiere resaltar: ${action.target} (pendiente).`, "info");
      return;
  }
}
