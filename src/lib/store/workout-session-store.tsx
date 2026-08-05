"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  getExerciseInfo,
  useRogue,
  type LogResult,
} from "@/lib/store/rogue-store";
import { convertWeight, fromKg, toKg } from "@/lib/units";
import {
  requestNotifyPermission,
  scheduleRestEndNotification,
  cancelRestEndNotification,
  notifyRestEndNow,
} from "@/lib/notifications/rest-notifier";
import type {
  ExerciseNoteFlag,
  ExerciseNoteInput,
  LoggedSet,
  RoutineDay,
  WeightUnit,
} from "@/lib/workout/types";

/** `weight` guarda el numero tal como se muestra/edita, en la unidad ACTIVA DE
 *  LA SESION (`unit` del contexto), no necesariamente la preferencia actual.
 *  Se convierte a kg solo al entrar (buildRows) y al salir (finish). Si el
 *  usuario cambia de unidad con la sesion abierta, las filas se reconvierten
 *  para que el peso fisico no cambie. */
export type SetState = { weight: string; reps: string; done: boolean };

/** Borrador de nota por ejercicio mientras dura la sesion. */
export type NoteDraft = { flag: ExerciseNoteFlag | null; text: string };

/** Recordatorio a mostrar al empezar: la ultima vez se marco subir/bajar en
 *  este ejercicio y aun no se ha visto. weightKg en kg (se formatea en la UI). */
export type Reminder = {
  exerciseId: string;
  exerciseName: string;
  flag: ExerciseNoteFlag;
  weightKg: number | null;
};

type Phase = "active" | "done";

/** Resultado de finalizar. `sin-reps` = hay series marcadas pero ninguna con
 *  repeticiones validas, asi que no hay nada que guardar. */
export type FinishResult =
  | { ok: true }
  | { ok: false; reason: "sin-entreno" | "sin-reps" };

type WorkoutSessionContextValue = {
  active: boolean;
  minimized: boolean;
  phase: Phase;
  day: RoutineDay | null;
  rows: Record<string, SetState[]>;
  /** Unidad en la que estan escritos los pesos de `rows`. La UI debe rotular
   *  los inputs con esta, no con preferences.unit. */
  unit: WeightUnit;
  result: LogResult | null;
  restUntil: number | null;
  restRemaining: number;
  restTotal: number;
  /** Segundos transcurridos desde que empezo la sesion (tiempo real, incluye
   *  descansos y pausas). En fase "done" queda congelado a la duracion final. */
  elapsedSec: number;
  doneCount: number;
  totalCount: number;
  start: (day: RoutineDay) => void;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  updateSet: (exId: string, i: number, patch: Partial<SetState>) => void;
  toggleDone: (exId: string, i: number, restSec: number) => void;
  addSet: (exId: string) => void;
  removeSet: (exId: string, i: number) => void;
  replaceExercise: (oldExId: string, newExId: string) => void;
  /** Reordena los ejercicios de la sesion en curso (no toca la rutina guardada). */
  reorderExercises: (activeExId: string, overExId: string) => void;
  /** Anade un ejercicio imprevisto al entreno de hoy (no toca la rutina). */
  addExercise: (exerciseId: string) => void;
  /** Notas/flags en curso por ejercicio (exerciseId -> borrador). */
  noteDrafts: Record<string, NoteDraft>;
  /** Pone/quita el flag rapido de un ejercicio (toggle si es el mismo). */
  setExerciseFlag: (exId: string, flag: ExerciseNoteFlag) => void;
  /** Actualiza el texto libre de la nota de un ejercicio. */
  setExerciseNote: (exId: string, text: string) => void;
  /** Recordatorios pendientes calculados al empezar la sesion. */
  reminders: Reminder[];
  /** Descarta los recordatorios y los marca como vistos. */
  dismissReminders: () => void;
  skipRest: () => void;
  adjustRest: (deltaSec: number) => void;
  finish: () => FinishResult;
};

const WorkoutSessionContext = createContext<WorkoutSessionContextValue | null>(
  null,
);

// Valores de partida de un ejercicio anadido sobre la marcha. Coinciden con los
// DEFAULT de routine_exercises en la BD.
const DEFAULT_SETS = 3;
const DEFAULT_REPS = 10;
const DEFAULT_REST_SEC = 90;

/** Ultimo peso (kg) y reps registrados por ejercicio, del historial. */
export type LastPerformance = Record<string, { weightKg: number; reps: number }>;

/**
 * Filas iniciales del entreno. El peso se prellena con lo que el usuario hizo
 * la ultima vez en ese ejercicio y, si nunca lo ha hecho, con el peso sugerido
 * de la rutina. Antes solo existia lo segundo (y por defecto era 0), asi que
 * habia que teclear el peso desde cero en cada serie de cada entreno.
 */
function buildRows(
  day: RoutineDay,
  unit: WeightUnit,
  last: LastPerformance,
): Record<string, SetState[]> {
  const next: Record<string, SetState[]> = {};
  for (const ex of day.exercises) {
    const previous = last[ex.exerciseId];
    const kg = previous?.weightKg ?? ex.suggestedKg;
    const display = kg > 0 ? String(Math.round(fromKg(kg, unit) * 10) / 10) : "";
    next[ex.exerciseId] = Array.from({ length: ex.sets }, () => ({
      weight: display,
      reps: String(previous?.reps ?? ex.reps),
      done: false,
    }));
  }
  return next;
}

// --- Sesion de entreno en curso: snapshot para sobrevivir a que el SO/PWA se
//     cierre a mitad de entreno. Al reabrir, se restaura tal cual (el
//     cronometro se autocorrige porque va anclado a startedAt). ---

const ACTIVE_SNAPSHOT_KEY = "rogue.workout.active.v1";

type WorkoutSnapshot = {
  day: RoutineDay;
  rows: Record<string, SetState[]>;
  noteDrafts: Record<string, NoteDraft>;
  reminders: Reminder[];
  startedAt: number;
  restUntil: number | null;
  restTotal: number;
  minimized: boolean;
  /** Unidad en la que estan escritos los pesos de `rows`. Sin esto, restaurar
   *  un entreno despues de cambiar kg<->lb reinterpretaba los numeros. */
  unit: WeightUnit;
};

function readWorkoutSnapshot(): WorkoutSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ACTIVE_SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as WorkoutSnapshot) : null;
  } catch {
    return null;
  }
}

function writeWorkoutSnapshot(snap: WorkoutSnapshot) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ACTIVE_SNAPSHOT_KEY, JSON.stringify(snap));
  } catch {
    /* sin almacenamiento: la recuperacion no estara disponible */
  }
}

function clearWorkoutSnapshot() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(ACTIVE_SNAPSHOT_KEY);
  } catch {
    /* nada */
  }
}

export function WorkoutSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { logSession, preferences, exerciseNotes, acknowledgeReminders, sessions } =
    useRogue();

  // Unidad con la que se escribieron los pesos que hay en `rows`. Se fija al
  // empezar y solo cambia por el efecto de reconversion de mas abajo, nunca
  // sola: finish debe interpretar los numeros con la misma unidad con la que
  // se teclearon.
  const [sessionUnit, setSessionUnit] = useState<WeightUnit>(preferences.unit);
  const sessionUnitRef = useRef(sessionUnit);
  sessionUnitRef.current = sessionUnit;

  const [active, setActive] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [phase, setPhase] = useState<Phase>("active");
  const [day, setDay] = useState<RoutineDay | null>(null);
  const [rows, setRows] = useState<Record<string, SetState[]>>({});
  const [result, setResult] = useState<LogResult | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, NoteDraft>>({});
  const [reminders, setReminders] = useState<Reminder[]>([]);

  // Espejo de exerciseNotes para leerlas de forma sincrona al empezar (start no
  // debe recrearse cada vez que cambian las notas, para no invalidar callbacks).
  const notesRef = useRef(exerciseNotes);
  notesRef.current = exerciseNotes;

  // Ultimo peso/reps por ejercicio, para prellenar las filas al empezar. Se
  // recorre el historial una vez por cambio de sesiones, no en cada arranque.
  const lastPerformance = useMemo(() => {
    const map: LastPerformance = {};
    for (const session of sessions) {
      for (const set of session.sets) {
        // sessions viene ordenado ascendente por fecha: el ultimo que se ve de
        // cada ejercicio es el mas reciente.
        map[set.exerciseId] = { weightKg: set.weightKg, reps: set.reps };
      }
    }
    return map;
  }, [sessions]);
  const lastPerformanceRef = useRef(lastPerformance);
  lastPerformanceRef.current = lastPerformance;

  // Espejo de la preferencia de aviso: la leen callbacks que no deben
  // recrearse (toggleDone, adjustRest) cada vez que el usuario la cambia.
  const notifyRestEndRef = useRef(preferences.notifyRestEnd);
  notifyRestEndRef.current = preferences.notifyRestEnd;

  // Espejo de `rows` para poder leer el estado actual de forma sincrona dentro
  // de los handlers (los updaters de setRows corren despues, no valen para
  // decidir efectos como arrancar el descanso).
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const [restUntil, setRestUntil] = useState<number | null>(null);
  const [restTotal, setRestTotal] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  // Cronometro de la sesion completa: timestamp de inicio + duracion congelada
  // al finalizar. Cuenta tiempo real (descansos y pausas incluidos).
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finalDurationSec, setFinalDurationSec] = useState<number | null>(null);

  // Vibracion + (en web) notificacion, en el instante en que el temporizador de
  // la pagina detecta el fin. En nativo la notificacion ya la disparo el
  // sistema desde armRest; aqui solo vibra.
  const notifyRestEnd = useCallback(() => {
    if (!notifyRestEndRef.current) return;
    notifyRestEndNow();
  }, []);

  /** Arranca (o reprograma) el descanso y deja programado el aviso en el SO. */
  const armRest = useCallback((until: number, totalSec: number) => {
    setRestTotal(totalSec);
    setRestUntil(until);
    if (notifyRestEndRef.current) scheduleRestEndNotification(until);
  }, []);

  // Cronometro del descanso (anclado a timestamp, se autocorrige en 2.º plano).
  useEffect(() => {
    if (restUntil === null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [restUntil]);

  // Cronometro de la sesion: mientras esta activa avanza cada segundo. Anclado
  // a startedAt, asi que se autocorrige tras estar en 2.o plano o bloqueado.
  useEffect(() => {
    if (phase !== "active" || startedAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [phase, startedAt]);

  const elapsedSec =
    finalDurationSec !== null
      ? finalDurationSec
      : startedAt !== null
        ? Math.max(0, Math.floor((now - startedAt) / 1000))
        : 0;

  const restRemaining =
    restUntil !== null ? Math.max(0, Math.ceil((restUntil - now) / 1000)) : 0;
  useEffect(() => {
    if (restUntil !== null && now >= restUntil) {
      setRestUntil(null);
      notifyRestEnd();
    }
  }, [now, restUntil, notifyRestEnd]);

  // Restauracion: al montar, si quedo un entreno a medias (la PWA se cerro sin
  // finalizar), se recupera y se muestra minimizado por defecto. Solo una vez.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const snap = readWorkoutSnapshot();
    if (!snap || !snap.day) return;
    // Descarta entrenos "zombies": si el snapshot es muy viejo (>12 h) no tiene
    // sentido reanudarlo, seguramente se cerro la app y nunca se finalizo.
    const MAX_AGE_MS = 12 * 60 * 60 * 1000;
    if (snap.startedAt && Date.now() - snap.startedAt > MAX_AGE_MS) {
      clearWorkoutSnapshot();
      return;
    }
    setDay(snap.day);
    setRows(snap.rows ?? {});
    setNoteDrafts(snap.noteDrafts ?? {});
    setReminders(snap.reminders ?? []);
    setStartedAt(snap.startedAt);
    setRestUntil(snap.restUntil);
    setRestTotal(snap.restTotal);
    setMinimized(snap.minimized ?? true);
    // Snapshots anteriores a la version con unidad: se asume kg, que era el
    // valor por defecto y el unico con el que se podia haber escrito sin bug.
    setSessionUnit(snap.unit ?? "kg");
    // Si el descanso seguia vivo, se vuelve a programar el aviso: el que
    // hubiera se perdio al morir el proceso.
    if (snap.restUntil && snap.restUntil > Date.now()) {
      scheduleRestEndNotification(snap.restUntil);
    }
    setFinalDurationSec(null);
    setPhase("active");
    setNow(Date.now());
    setActive(true);
  }, []);

  // Persistencia: mientras el entreno esta activo (no en la pantalla de
  // resumen), guarda un snapshot en cada cambio relevante. En fase "done" el
  // snapshot ya se limpio en finish(), asi que no se reescribe.
  useEffect(() => {
    if (!active || phase !== "active" || !day) return;
    writeWorkoutSnapshot({
      day,
      rows,
      noteDrafts,
      reminders,
      startedAt: startedAt ?? Date.now(),
      restUntil,
      restTotal,
      minimized,
      unit: sessionUnit,
    });
  }, [
    active,
    phase,
    day,
    rows,
    noteDrafts,
    reminders,
    startedAt,
    restUntil,
    restTotal,
    minimized,
    sessionUnit,
  ]);

  // El usuario cambio kg<->lb con un entreno abierto: se reconvierte lo ya
  // escrito para que el peso fisico no cambie. Sin esto, un 100 tecleado en kg
  // se guardaba como 100 lb (45,4 kg) al finalizar, en silencio y sin vuelta
  // atras.
  useEffect(() => {
    if (!active || preferences.unit === sessionUnit) return;
    const from = sessionUnit;
    const to = preferences.unit;
    setRows((prev) => {
      const next: Record<string, SetState[]> = {};
      for (const [exId, list] of Object.entries(prev)) {
        next[exId] = list.map((s) => {
          const value = Number(s.weight);
          if (s.weight === "" || !Number.isFinite(value)) return s;
          return {
            ...s,
            weight: String(Math.round(convertWeight(value, from, to) * 10) / 10),
          };
        });
      }
      return next;
    });
    setSessionUnit(to);
  }, [active, preferences.unit, sessionUnit]);

  const start = useCallback((d: RoutineDay) => {
    // Pedimos permiso de notificacion aqui (gesto de usuario) para poder
    // avisar de fin de descanso aunque la app este en 2.o plano. En nativo usa
    // el plugin de Capacitor; en web, la Web Notification API.
    requestNotifyPermission();
    cancelRestEndNotification();
    setDay(d);
    setSessionUnit(preferences.unit);
    setRows(buildRows(d, preferences.unit, lastPerformanceRef.current));
    setPhase("active");
    setResult(null);
    setRestUntil(null);
    setMinimized(false);
    setStartedAt(Date.now());
    setFinalDurationSec(null);
    setNow(Date.now());
    setNoteDrafts({});

    // Recordatorios: para cada ejercicio del dia, la nota mas reciente sin ver
    // con flag subir/bajar. notesRef viene ordenada ascendente por fecha.
    const pending: Reminder[] = [];
    for (const ex of d.exercises) {
      let last: (typeof notesRef.current)[number] | undefined;
      for (const n of notesRef.current) {
        if (n.exerciseId === ex.exerciseId) last = n;
      }
      if (
        last &&
        !last.acknowledged &&
        (last.flag === "subir" || last.flag === "bajar")
      ) {
        pending.push({
          exerciseId: ex.exerciseId,
          exerciseName: getExerciseInfo(ex.exerciseId).nombre,
          flag: last.flag,
          weightKg: last.weightKg,
        });
      }
    }
    setReminders(pending);
    setActive(true);
  }, [preferences.unit]);

  const minimize = useCallback(() => setMinimized(true), []);
  const maximize = useCallback(() => setMinimized(false), []);

  const close = useCallback(() => {
    clearWorkoutSnapshot();
    cancelRestEndNotification();
    setActive(false);
    setMinimized(false);
    setDay(null);
    setRows({});
    setResult(null);
    setRestUntil(null);
    setPhase("active");
    setStartedAt(null);
    setFinalDurationSec(null);
    setNoteDrafts({});
    setReminders([]);
  }, []);

  const setExerciseFlag = useCallback(
    (exId: string, flag: ExerciseNoteFlag) => {
      setNoteDrafts((prev) => {
        const current = prev[exId] ?? { flag: null, text: "" };
        // Volver a pulsar el mismo flag lo quita.
        const nextFlag = current.flag === flag ? null : flag;
        return { ...prev, [exId]: { ...current, flag: nextFlag } };
      });
    },
    [],
  );

  const setExerciseNote = useCallback((exId: string, text: string) => {
    setNoteDrafts((prev) => {
      const current = prev[exId] ?? { flag: null, text: "" };
      return { ...prev, [exId]: { ...current, text } };
    });
  }, []);

  const dismissReminders = useCallback(() => {
    // acknowledgeReminders hace setState en RogueProvider: debe llamarse aqui
    // (handler), nunca dentro de un updater de setState (corre en render).
    acknowledgeReminders(reminders.map((r) => r.exerciseId));
    setReminders([]);
  }, [acknowledgeReminders, reminders]);

  const updateSet = useCallback(
    (exId: string, i: number, patch: Partial<SetState>) => {
      setRows((prev) => {
        const list = (prev[exId] ?? []).map((s, idx) =>
          idx === i ? { ...s, ...patch } : s,
        );
        return { ...prev, [exId]: list };
      });
    },
    [],
  );

  const toggleDone = useCallback(
    (exId: string, i: number, restSec: number) => {
      // El nuevo estado se calcula desde rowsRef (sincrono), no desde el updater
      // de setRows: este corre despues, por lo que no sirve para decidir si hay
      // que arrancar el descanso en el mismo tick.
      const current = rowsRef.current[exId]?.[i];
      if (!current) return;
      const willBeDone = !current.done;
      setRows((prev) => {
        const list = (prev[exId] ?? []).map((s, idx) =>
          idx === i ? { ...s, done: willBeDone } : s,
        );
        return { ...prev, [exId]: list };
      });
      if (willBeDone) armRest(Date.now() + restSec * 1000, restSec);
    },
    [armRest],
  );

  const addSet = useCallback((exId: string) => {
    setRows((prev) => {
      const list = prev[exId] ?? [];
      // La nueva serie hereda kg/reps de la ultima para agilizar el registro.
      const last = list[list.length - 1];
      const next: SetState = {
        weight: last?.weight ?? "",
        reps: last?.reps ?? "",
        done: false,
      };
      return { ...prev, [exId]: [...list, next] };
    });
  }, []);

  /** Quita una serie. Si era la ULTIMA, el ejercicio entero sale del entreno de
   *  hoy (no de la rutina guardada): asi un dia puntual se registra con menos
   *  ejercicios sin tener que editar la rutina base. */
  const removeSet = useCallback(
    (exId: string, i: number) => {
      // rowsRef y no `rows`: si dependiera del estado, este callback se
      // recrearia en cada pulsacion de tecla de cualquier input de la sesion.
      const list = (rowsRef.current[exId] ?? []).filter((_, idx) => idx !== i);
      if (list.length > 0) {
        setRows((prev) => ({ ...prev, [exId]: list }));
        return;
      }
      setRows((prev) => {
        const next = { ...prev };
        delete next[exId];
        return next;
      });
      setNoteDrafts((prev) => {
        if (!(exId in prev)) return prev;
        const next = { ...prev };
        delete next[exId];
        return next;
      });
      setDay((prev) =>
        prev
          ? {
              ...prev,
              exercises: prev.exercises.filter((e) => e.exerciseId !== exId),
            }
          : prev,
      );
    },
    [],
  );

  const replaceExercise = useCallback((oldExId: string, newExId: string) => {
    if (oldExId === newExId) return;
    setDay((prev) =>
      prev
        ? {
            ...prev,
            exercises: prev.exercises.map((e) =>
              e.exerciseId === oldExId ? { ...e, exerciseId: newExId } : e,
            ),
          }
        : prev,
    );
    // Conserva las series ya introducidas bajo el nuevo ejercicio.
    setRows((prev) => {
      if (!(oldExId in prev)) return prev;
      const { [oldExId]: existing, ...rest } = prev;
      return { ...rest, [newExId]: existing };
    });
  }, []);

  /** Anade un ejercicio no planificado al entreno de hoy (no a la rutina
   *  guardada). Arranca con los mismos valores por defecto que la BD
   *  (3 series x 10 reps, 90 s de descanso) y sin peso sugerido. */
  const addExercise = useCallback((exerciseId: string) => {
    const previous = lastPerformanceRef.current[exerciseId];
    setDay((prev) => {
      if (!prev) return prev;
      if (prev.exercises.some((e) => e.exerciseId === exerciseId)) return prev;
      return {
        ...prev,
        exercises: [
          ...prev.exercises,
          {
            exerciseId,
            sets: DEFAULT_SETS,
            reps: DEFAULT_REPS,
            restSec: DEFAULT_REST_SEC,
            suggestedKg: 0,
          },
        ],
      };
    });
    setRows((prev) => {
      if (prev[exerciseId]) return prev;
      // Mismo prellenado que buildRows: lo ultimo que se hizo en ese ejercicio.
      const display =
        previous && previous.weightKg > 0
          ? String(
              Math.round(fromKg(previous.weightKg, sessionUnitRef.current) * 10) / 10,
            )
          : "";
      return {
        ...prev,
        [exerciseId]: Array.from({ length: DEFAULT_SETS }, () => ({
          weight: display,
          reps: String(previous?.reps ?? DEFAULT_REPS),
          done: false,
        })),
      };
    });
  }, []);

  /** Reordena los ejercicios de la sesion en curso (drag & drop). Recibe los
   *  ids activo/destino que da dnd-kit; el orden solo afecta a esta sesion, no
   *  modifica la rutina guardada. */
  const reorderExercises = useCallback(
    (activeExId: string, overExId: string) => {
      if (activeExId === overExId) return;
      setDay((prev) => {
        if (!prev) return prev;
        const from = prev.exercises.findIndex((e) => e.exerciseId === activeExId);
        const to = prev.exercises.findIndex((e) => e.exerciseId === overExId);
        if (from === -1 || to === -1) return prev;
        const exercises = [...prev.exercises];
        const [moved] = exercises.splice(from, 1);
        exercises.splice(to, 0, moved);
        return { ...prev, exercises };
      });
    },
    [],
  );

  const skipRest = useCallback(() => {
    setRestUntil(null);
    cancelRestEndNotification();
  }, []);

  // Ajusta el descanso en curso al vuelo (+/- segundos). Si al restar cae por
  // debajo de cero, el descanso termina ya. restTotal se mueve en paralelo para
  // que la barra de progreso siga siendo coherente, y el aviso programado en el
  // SO se reprograma a la nueva hora (o se cancela si ya vencio).
  const adjustRest = useCallback((deltaSec: number) => {
    setRestUntil((prev) => {
      if (prev === null) return prev;
      const next = Math.max(Date.now(), prev + deltaSec * 1000);
      if (next <= Date.now()) cancelRestEndNotification();
      else if (notifyRestEndRef.current) scheduleRestEndNotification(next);
      return next;
    });
    setRestTotal((prev) => Math.max(0, prev + deltaSec));
  }, []);

  const finish = useCallback((): FinishResult => {
    if (!day) return { ok: false, reason: "sin-entreno" };
    const sets: LoggedSet[] = [];
    // Peso mas alto (en kg) hecho en cada ejercicio, para el mensaje del
    // recordatorio ("la ultima vez: 80 kg").
    const topWeightByEx: Record<string, number> = {};
    for (const ex of day.exercises) {
      const info = getExerciseInfo(ex.exerciseId);
      for (const s of rows[ex.exerciseId] ?? []) {
        if (!s.done) continue;
        const reps = Number(s.reps) || 0;
        if (reps <= 0) continue;
        // sessionUnit, NO preferences.unit: los numeros de `rows` estan
        // escritos en la unidad activa de la sesion.
        const weightKg = toKg(Number(s.weight) || 0, sessionUnit);
        topWeightByEx[ex.exerciseId] = Math.max(
          topWeightByEx[ex.exerciseId] ?? 0,
          weightKg,
        );
        sets.push({ exerciseId: ex.exerciseId, grupo: info.grupo, weightKg, reps });
      }
    }
    // Antes esto era un `return` mudo: el boton estaba habilitado (hay series
    // marcadas) pero ninguna tenia reps validas, asi que al pulsar no pasaba
    // absolutamente nada y el usuario acababa descartando el entreno.
    if (sets.length === 0) return { ok: false, reason: "sin-reps" };

    // Notas: solo las que tienen flag o texto. weightKg desde el mejor set hecho.
    const notes: ExerciseNoteInput[] = Object.entries(noteDrafts)
      .filter(([, d]) => d.flag !== null || d.text.trim() !== "")
      .map(([exId, d]) => ({
        exerciseId: exId,
        flag: d.flag,
        text: d.text.trim() || null,
        weightKg: topWeightByEx[exId] ?? null,
      }));

    const durationSec =
      startedAt !== null
        ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
        : undefined;
    // El entreno ya queda registrado: se descarta el snapshot para que al
    // reabrir no reaparezca como sesion "en curso".
    clearWorkoutSnapshot();
    cancelRestEndNotification();
    setFinalDurationSec(durationSec ?? null);
    setResult(logSession(day.label, sets, durationSec, notes));
    setRestUntil(null);
    setMinimized(false);
    setPhase("done");
    return { ok: true };
  }, [day, rows, logSession, sessionUnit, startedAt, noteDrafts]);

  const { doneCount, totalCount } = useMemo(() => {
    const all = Object.values(rows).flat();
    return {
      doneCount: all.filter((s) => s.done).length,
      totalCount: all.length,
    };
  }, [rows]);

  // Memoizado (igual que RogueProvider): sin esto se creaba un objeto nuevo en
  // CADA render del provider, y como `now` avanza cada 250 ms durante el
  // descanso y cada segundo durante todo el entreno, se re-renderizaban todos
  // los consumidores --incluido el modal completo con su arbol de dnd-kit-- de
  // forma continua. Una hora de entreno eran ~4.000 renders del arbol mas
  // pesado de la app, con el jank y el consumo de bateria que eso implica.
  const value: WorkoutSessionContextValue = useMemo(
    () => ({
      active,
      minimized,
      phase,
      day,
      rows,
      unit: sessionUnit,
      result,
      restUntil,
      restRemaining,
      restTotal,
      elapsedSec,
      doneCount,
      totalCount,
      start,
      minimize,
      maximize,
      close,
      updateSet,
      toggleDone,
      addSet,
      removeSet,
      replaceExercise,
      reorderExercises,
      addExercise,
      noteDrafts,
      setExerciseFlag,
      setExerciseNote,
      reminders,
      dismissReminders,
      skipRest,
      adjustRest,
      finish,
    }),
    [
      active,
      minimized,
      phase,
      day,
      rows,
      sessionUnit,
      result,
      restUntil,
      restRemaining,
      restTotal,
      elapsedSec,
      doneCount,
      totalCount,
      start,
      minimize,
      maximize,
      close,
      updateSet,
      toggleDone,
      addSet,
      removeSet,
      replaceExercise,
      reorderExercises,
      addExercise,
      noteDrafts,
      setExerciseFlag,
      setExerciseNote,
      reminders,
      dismissReminders,
      skipRest,
      adjustRest,
      finish,
    ],
  );

  return (
    <WorkoutSessionContext.Provider value={value}>
      {children}
    </WorkoutSessionContext.Provider>
  );
}

export function useWorkoutSession(): WorkoutSessionContextValue {
  const ctx = useContext(WorkoutSessionContext);
  if (!ctx)
    throw new Error(
      "useWorkoutSession debe usarse dentro de WorkoutSessionProvider",
    );
  return ctx;
}
