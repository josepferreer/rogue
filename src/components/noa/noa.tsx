"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { Check, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useAppShellPortal } from "@/lib/use-app-shell-portal";
import { usePresence, type PresenceState } from "@/lib/use-presence";
import { dispatchNoaAction } from "@/lib/noa/client/dispatch";
import { Markdown } from "@/lib/noa/client/markdown";
import { useMeals } from "@/lib/store/meals-store";
import { getExerciseInfo, useRogue } from "@/lib/store/rogue-store";
import { useCardio } from "@/lib/store/cardio-store";
import { useWorkoutSession } from "@/lib/store/workout-session-store";
import {
  cancelNoaReminder,
  scheduleNoaReminder,
} from "@/lib/notifications/noa-reminders";
import { getNoaKeyStatus } from "@/lib/noa/settings-actions";
import type {
  NoaClientAction,
  NoaProposedAction,
  NoaResponse,
  NoaTurn,
} from "@/lib/noa/types";

/**
 * NOA — superficie de chat global (lanzador + hoja). Se monta una vez en el
 * layout de /app. Habla con `/api/noa`, pinta la respuesta, ejecuta las
 * acciones seguras y ofrece confirmar las que lo requieren.
 *
 * Es un primer chat mínimo para probar el engine end-to-end con el módulo
 * Training; el diseño visual y la persistencia de la conversación son TODO.
 */
/** Dónde sobrevive la conversación a cerrar la hoja y a recargar la app. */
const HISTORY_KEY = "rogue.noa.turns.v1";
/** Tope de turnos guardados: el engine solo manda los últimos al modelo. */
const MAX_STORED_TURNS = 40;

function loadTurns(): NoaTurn[] {
  if (typeof sessionStorage === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(HISTORY_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is NoaTurn =>
        !!t &&
        typeof t === "object" &&
        typeof (t as NoaTurn).content === "string" &&
        ((t as NoaTurn).role === "user" || (t as NoaTurn).role === "assistant"),
    );
  } catch {
    return [];
  }
}

export function Noa() {
  const [open, setOpen] = useState(false);
  const { mounted, state } = usePresence(open);
  const portalTarget = useAppShellPortal();
  const pathname = usePathname();

  // La conversación vive AQUÍ, no dentro de la hoja: la hoja se desmonta al
  // cerrarla, así que antes cerrar NOA borraba el hilo entero. Se persiste
  // además en sessionStorage para que sobreviva a una recarga (pero no para
  // siempre: al cerrar la pestaña se empieza de cero, que es lo esperable).
  // Inicializador perezoso, no efecto: en servidor `loadTurns` devuelve [] y en
  // cliente lee lo guardado. No hay desajuste de hidratación porque la hoja no
  // se pinta hasta que el usuario la abre.
  const [turns, setTurns] = useState<NoaTurn[]>(loadTurns);

  // null = todavía comprobando; false = sin clave; true = con clave.
  // NOA permanece oculta hasta que la comprobación confirma que hay clave.
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof sessionStorage === "undefined") return;
    try {
      sessionStorage.setItem(
        HISTORY_KEY,
        JSON.stringify(turns.slice(-MAX_STORED_TURNS)),
      );
    } catch {
      // Sin almacenamiento: la conversación sigue viva en memoria.
    }
  }, [turns]);

  useEffect(() => {
    let alive = true;
    getNoaKeyStatus()
      .then((s) => { if (alive) setHasKey(s.hasKey); })
      .catch(() => { if (alive) setHasKey(false); });
    return () => { alive = false; };
  }, []);

  // Onboarding gestiona su propio layout sin navegación: NOA no pinta ahí.
  // Tampoco queremos pintar NOA mientras examinamos una ruta.
  if (pathname.startsWith("/app/onboarding") || pathname.startsWith("/app/cardio/actividad/")) return null;
  if (!portalTarget) return null;
  // Sin clave de Gemini configurada, NOA no se muestra.
  if (!hasKey) return null;

  return createPortal(
    // `mounted`, no `open`: la hoja sigue montada mientras se cierra, para que
    // le dé tiempo a bajar. El botón flotante vuelve cuando ya se ha ido.
    mounted ? (
      <NoaSheet
        state={state}
        onClose={() => setOpen(false)}
        turns={turns}
        setTurns={setTurns}
      />
    ) : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir NOA"
        className="absolute bottom-24 right-4 z-50 flex size-14 items-center justify-center rounded-full bg-foreground text-background shadow-lg transition-transform active:scale-95"
      >
        <Sparkles className="size-6" />
      </button>
    ),
    portalTarget,
  );
}

function NoaSheet({
  onClose,
  state,
  turns,
  setTurns,
}: {
  onClose: () => void;
  state: PresenceState;
  turns: NoaTurn[];
  setTurns: React.Dispatch<React.SetStateAction<NoaTurn[]>>;
}) {
  const router = useRouter();
  const { notify } = useToast();
  const { reload: reloadMeals } = useMeals();
  const { reloadRoutine, reloadProfile, routineDays, logSession } = useRogue();
  const {
    startTracking,
    isTracking: isCardioTracking,
    reloadHistory: reloadCardio,
  } = useCardio();
  const { start: startSession, finish: finishSession } = useWorkoutSession();
  const [pending, setPending] = useState<NoaProposedAction[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns, pending]);

  function dispatch(action: NoaClientAction) {
    dispatchNoaAction(action, {
      navigate: (path) => {
        onClose();
        router.push(path);
      },
      notify,
      // NOA escribe en servidor; sin esto la pantalla se queda con los datos
      // anteriores y parece que no ha pasado nada.
      refetch: (scope) => {
        if (scope === "nutrition") void reloadMeals();
        else if (scope === "training") void reloadRoutine();
        else if (scope === "profile") void reloadProfile();
        else if (scope === "cardio") void reloadCardio();
      },
      startWorkout: (routineDayId) => {
        const day = routineDayId
          ? routineDays.find((d) => d.id === routineDayId)
          : routineDays[0];
        if (!day) {
          notify("No encuentro ese día de rutina.", "error");
          return;
        }
        startSession(day);
        onClose();
      },
      finishWorkout: () => {
        const outcome = finishSession();
        if (outcome.ok) {
          notify("Entreno guardado en tu historial.", "success");
          onClose();
        } else if (outcome.reason === "sin-entreno") {
          notify("No tienes ningún entreno en curso.", "error");
        } else {
          notify("Marca alguna serie con repeticiones antes de terminar.", "error");
        }
      },
      logWorkout: (dayLabel, exercises, durationSec) => {
        // Soporta dos formatos por ejercicio:
        // - Simple: sets × reps × weightKg (todas las series iguales).
        // - Detallado: setDetails[{reps, weightKg}] cuando cada serie tiene
        //   pesos o repeticiones distintas (ej. series de calentamiento).
        const sets = exercises.flatMap((ex) => {
          const grupo = getExerciseInfo(ex.exerciseId).grupo;
          if (Array.isArray(ex.setDetails) && ex.setDetails.length > 0) {
            return ex.setDetails.map((s) => ({
              exerciseId: ex.exerciseId,
              grupo,
              weightKg: s.weightKg,
              reps: s.reps,
            }));
          }
          // Formato simple: expande N series iguales.
          return Array.from({ length: ex.sets ?? 1 }, () => ({
            exerciseId: ex.exerciseId,
            grupo,
            weightKg: ex.weightKg ?? 0,
            reps: ex.reps ?? 0,
          }));
        });
        if (sets.length === 0) {
          notify("No he podido identificar los ejercicios del entreno.", "error");
          return;
        }
        logSession(dayLabel, sets, durationSec);
        notify(`Entreno "${dayLabel}" guardado en tu historial.`, "success");
      },
      startCardio: () => {
        // Solo puede haber un cardio a la vez: si ya hay uno, se lleva al
        // usuario a él en vez de arrancar otro (que borraría lo grabado).
        if (isCardioTracking) {
          notify("Ya tienes un cardio en marcha.", "info");
          onClose();
          router.push("/app/cardio");
          return;
        }
        startTracking();
        onClose();
        router.push("/app/cardio");
      },
      scheduleNotification: (id, title, body, atISO) => {
        void scheduleNoaReminder(id, title, body, atISO).then((res) => {
          if (res.ok) {
            // Programado pero sin alarma exacta: Android puede retrasarlo. Se
            // dice, en vez de dejar que el usuario piense que ha fallado cuando
            // el aviso llegue 10 minutos tarde.
            if (!res.exact) {
              notify(
                "Aviso programado. Para que llegue puntual, activa «Alarmas y recordatorios» en los ajustes de Rogue.",
                "info",
              );
            }
            return;
          }
          if (res.reason === "web") {
            notify("Los recordatorios solo funcionan en la app instalada.", "info");
          } else if (res.reason === "pasado") {
            notify("Esa hora ya ha pasado: dime un momento futuro.", "error");
          } else {
            notify("No he podido programar el aviso: falta el permiso de notificaciones.", "error");
          }
        });
      },
      cancelNotification: (id) => {
        void cancelNoaReminder(id);
      },
    });
  }

  async function send() {
    const message = input.trim();
    if (!message || busy) return;

    const history = turns;
    setTurns((t) => [...t, { role: "user", content: message }]);
    setInput("");
    setPending([]);
    setBusy(true);

    try {
      const res = await fetch("/api/noa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message,
          history,
          clientDate: localDateKey(),
          clientNow: localNowISO(),
        }),
      });
      // El engine ya devuelve 200 con un `reply` explicativo cuando algo falla
      // por dentro. Lo que llega aqui como no-OK es el guard de la route, y
      // cada caso merece su mensaje en vez de un "intentalo de nuevo" a secas.
      if (!res.ok) {
        setTurns((t) => [
          ...t,
          { role: "assistant", content: httpErrorMessage(res.status) },
        ]);
        return;
      }
      const data = (await res.json()) as NoaResponse;

      setTurns((t) => [
        ...t,
        { role: "assistant", content: data.reply || "…" },
      ]);
      // Acciones seguras: se ejecutan al vuelo.
      for (const action of data.actions) dispatch(action);
      // Acciones que requieren confirmación.
      setPending(data.pending);
    } catch {
      setTurns((t) => [
        ...t,
        {
          role: "assistant",
          content: "No he podido responder ahora mismo. Inténtalo de nuevo.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  /** Confirma un plan (una o varias acciones) en una sola pasada. */
  async function confirmActions(proposals: NoaProposedAction[]) {
    if (proposals.length === 0 || busy) return;
    const ids = new Set(proposals.map((p) => p.id));
    setPending((p) => p.filter((a) => !ids.has(a.id))); // evita doble pulsación
    setBusy(true);
    try {
      const res = await fetch("/api/noa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirm: {
            actions: proposals.map((p) => ({ toolName: p.toolName, args: p.args })),
          },
          // El historial permite a NOA REANUDAR el plan tras confirmar (p.ej.
          // cerrar el menú tras crear los platos).
          history: turns,
          clientDate: localDateKey(),
          clientNow: localNowISO(),
        }),
      });
      if (!res.ok) {
        setTurns((t) => [
          ...t,
          { role: "assistant", content: httpErrorMessage(res.status) },
        ]);
        return;
      }
      const data = (await res.json()) as NoaResponse;
      if (data.reply) {
        setTurns((t) => [...t, { role: "assistant", content: data.reply }]);
      }
      for (const action of data.actions) dispatch(action);
      // El plan reanudado puede proponer el siguiente paso: se muestra su tarjeta.
      setPending(data.pending);
    } catch {
      setTurns((t) => [
        ...t,
        { role: "assistant", content: "No he podido completar la acción." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function discardPending() {
    setPending([]);
    setTurns((t) => [
      ...t,
      { role: "assistant", content: "Vale, lo dejo así. No he tocado nada." },
    ]);
  }

  return (
    <div
      className="overlay-anim absolute inset-0 z-[70] flex flex-col justify-end md:items-center md:justify-center"
      data-state={state}
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="sheet-anim flex h-[80%] w-full flex-col rounded-t-3xl border border-border bg-surface md:max-w-md md:rounded-3xl"
        data-state={state}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <span className="flex items-center gap-2 text-base font-semibold">
            <Sparkles className="size-5" />
            NOA
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-10 items-center justify-center rounded-full hover:bg-muted"
          >
            <X className="size-5" />
          </button>
        </div>

        <div ref={scrollRef} className="flex flex-1 flex-col gap-3 overflow-y-auto p-5">
          {turns.length === 0 && (
            <p className="m-auto max-w-[16rem] text-center text-sm text-muted-foreground">
              Pregúntame por tus entrenos. Ej.: «¿cuántos entrenos llevo?».
            </p>
          )}
          {turns.map((t, i) => (
            <div key={i} className={cnBubble(t.role)}>
              {t.role === "assistant" ? <Markdown text={t.content} /> : t.content}
            </div>
          ))}
          {pending.length > 0 && (
            <div className="flex w-[85%] flex-col gap-3 self-start rounded-2xl border border-border bg-background p-3">
              {pending.length > 1 ? (
                <>
                  <p className="text-sm font-medium">NOA quiere hacer esto:</p>
                  <div className="flex flex-col gap-2">
                    {groupProposals(pending).map((g) => (
                      <div key={g.label} className="flex flex-col gap-0.5">
                        <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                          {g.label} ({g.items.length})
                        </p>
                        <p className="text-sm">
                          {g.items.map((a) => shortLabel(a.summary)).join(" · ")}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm">{pending[0].summary}</p>
              )}
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={discardPending}
                  className="py-2"
                >
                  Descartar
                </Button>
                <Button fullWidth onClick={() => confirmActions(pending)} className="py-2">
                  <Check className="size-4" />
                  {pending.length > 1 ? "Confirmar todo" : "Confirmar"}
                </Button>
              </div>
            </div>
          )}
          {busy && (
            <div className={cnBubble("assistant")}>Pensando…</div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
            placeholder="Escribe a NOA…"
            disabled={busy}
            className="min-w-0 flex-1 rounded-full border border-border bg-background px-4 py-3 text-sm outline-none focus:border-foreground"
          />
          <button
            type="button"
            onClick={send}
            disabled={busy || input.trim().length === 0}
            aria-label="Enviar"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-foreground text-background disabled:opacity-40"
          >
            <Send className="size-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Hoy en la zona horaria del navegador (YYYY-MM-DD). El servidor corre en UTC,
 *  así que "hoy" debe salir del cliente para no fallar de madrugada. */
function localDateKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Instante actual del usuario en ISO 8601 CON offset (2026-08-08T19:23:45+02:00).
 *
 * Sin esto NOA no sabia que hora era: solo recibia la fecha (YYYY-MM-DD), asi
 * que un "avisame en 5 minutos" lo calculaba a ojo desde una hora inventada.
 * Se manda con offset, y no en UTC, porque los `atISO` de los recordatorios se
 * interpretan en hora local: asi el modelo puede copiar la zona tal cual.
 */
function localNowISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  // getTimezoneOffset() devuelve minutos DETRAS de UTC (Madrid en verano: -120),
  // de ahi que el signo se invierta.
  const offMin = -d.getTimezoneOffset();
  const sign = offMin >= 0 ? "+" : "-";
  const off = Math.abs(offMin);
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` +
    `${sign}${p(Math.floor(off / 60))}:${p(off % 60)}`
  );
}

// —— Tarjeta "plan": agrupa varias confirmaciones en secciones legibles ——

/** Etiqueta de sección por herramienta. */
const GROUP_LABELS: Record<string, string> = {
  savePantryFood: "Alimentos",
  savePantryDish: "Platos",
  addMealEntries: "Menú / comidas",
  clearMealEntries: "Limpiar diario",
  setNutritionGoals: "Objetivos",
  saveRoutine: "Rutina",
  startWorkout: "Entreno",
  finishWorkout: "Terminar entreno",
  logWorkout: "Registrar entreno",
  startCardio: "Cardio",
  deleteCardioSession: "Borrar ruta",
};

/** Orden de las secciones: lo que otras cosas necesitan va antes (igual que el
 *  orden de ejecución del servidor). */
const GROUP_ORDER: Record<string, number> = {
  savePantryFood: 1,
  savePantryDish: 2,
  setNutritionGoals: 2,
  saveRoutine: 2,
  clearMealEntries: 3,
  addMealEntries: 4,
};

/** Nombre corto para el resumen: el texto entre «», o el resumen recortado. */
function shortLabel(summary: string): string {
  const m = summary.match(/«([^»]+)»/);
  if (m) return m[1];
  return summary.length > 70 ? `${summary.slice(0, 69)}…` : summary;
}

interface ProposalGroup {
  label: string;
  order: number;
  items: NoaProposedAction[];
}

function groupProposals(items: NoaProposedAction[]): ProposalGroup[] {
  const byLabel = new Map<string, ProposalGroup>();
  for (const a of items) {
    const label = GROUP_LABELS[a.toolName] ?? "Acciones";
    const g = byLabel.get(label) ?? {
      label,
      order: GROUP_ORDER[a.toolName] ?? 5,
      items: [],
    };
    g.items.push(a);
    byLabel.set(label, g);
  }
  return [...byLabel.values()].sort((a, b) => a.order - b.order);
}

function cnBubble(role: NoaTurn["role"]): string {
  return role === "user"
    ? "max-w-[80%] self-end rounded-2xl bg-foreground px-4 py-2.5 text-sm text-background"
    : "max-w-[80%] self-start rounded-2xl bg-muted px-4 py-2.5 text-sm";
}

/** Mensaje para los fallos que corta el guard de la route, antes del engine. */
function httpErrorMessage(status: number): string {
  if (status === 401) return "Tu sesión ha caducado. Vuelve a entrar y seguimos.";
  if (status === 429)
    return "Vas muy rápido para mí: espera unos segundos y lo intentamos otra vez.";
  return "No he podido responder ahora mismo. Inténtalo de nuevo.";
}
