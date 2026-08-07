import type { NoaClientAction, NoaRefetchScope } from "@/lib/noa/types";

/**
 * Dispatcher de acciones de cliente (canal híbrido). Traduce una
 * `NoaClientAction` tipada a un efecto real en la app. Lista blanca: un tipo
 * desconocido se ignora.
 *
 * Las dependencias entran por parámetro (no importa stores aquí) para que este
 * fichero siga siendo trivial de leer y de probar: quien lo llama es el único
 * que sabe de dónde salen el router, los stores y Capacitor.
 */
export interface DispatchDeps {
  navigate: (path: string) => void;
  notify: (message: string, variant?: "success" | "error" | "info") => void;
  /** Re-lee del servidor la parte de la app que NOA acaba de cambiar. */
  refetch: (scope: NoaRefetchScope) => void;
  /** Inicia un entreno; sin día, entreno libre. */
  startWorkout: (routineDayId?: string) => void;
  startCardio: () => void;
  scheduleNotification: (
    id: string,
    title: string,
    body: string,
    atISO: string,
  ) => void;
  cancelNotification: (id: string) => void;
}

export function dispatchNoaAction(
  action: NoaClientAction,
  deps: DispatchDeps,
): void {
  switch (action.type) {
    case "navigate":
      deps.navigate(action.path);
      return;

    case "refetch":
      deps.refetch(action.scope);
      return;

    case "startWorkout":
      deps.startWorkout(action.routineDayId);
      return;

    case "startCardio":
      deps.startCardio();
      return;

    case "scheduleLocalNotification":
      deps.scheduleNotification(action.id, action.title, action.body, action.atISO);
      return;

    case "cancelLocalNotification":
      deps.cancelNotification(action.id);
      return;

    // Los tres siguientes no tienen todavía un destino real en la app: no hay
    // registro de modales por nombre, ni de formularios prellenables, ni de
    // anclas resaltables. Se avisa en vez de fingir que ha pasado algo.
    case "openModal":
      deps.notify(`NOA quiere abrir: ${action.modal} (aún no disponible).`, "info");
      return;
    case "prefillForm":
      deps.notify(`NOA quiere rellenar: ${action.form} (aún no disponible).`, "info");
      return;
    case "highlight":
      deps.notify(`NOA quiere resaltar: ${action.target} (aún no disponible).`, "info");
      return;
  }
}
