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
import { fromKg, toKg } from "@/lib/units";
import type {
  ExerciseNoteFlag,
  ExerciseNoteInput,
  LoggedSet,
  RoutineDay,
  WeightUnit,
} from "@/lib/workout/types";

/** weightKg guarda el numero tal como se muestra/edita, EN LA UNIDAD DE
 *  PREFERENCIA del usuario (a pesar del nombre). Solo se convierte a kg al
 *  entrar (buildRows, desde suggestedKg) y al salir (finish, hacia LoggedSet). */
export type SetState = { weightKg: string; reps: string; done: boolean };

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

type WorkoutSessionContextValue = {
  active: boolean;
  minimized: boolean;
  phase: Phase;
  day: RoutineDay | null;
  rows: Record<string, SetState[]>;
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
  finish: () => void;
};

const WorkoutSessionContext = createContext<WorkoutSessionContextValue | null>(
  null,
);

function buildRows(day: RoutineDay, unit: WeightUnit): Record<string, SetState[]> {
  const next: Record<string, SetState[]> = {};
  for (const ex of day.exercises) {
    const suggestedDisplay = ex.suggestedKg
      ? String(Math.round(fromKg(ex.suggestedKg, unit)))
      : "";
    next[ex.exerciseId] = Array.from({ length: ex.sets }, () => ({
      weightKg: suggestedDisplay,
      reps: String(ex.reps),
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
  const { logSession, preferences, exerciseNotes, acknowledgeReminders } =
    useRogue();

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

  // Avisa de que el descanso termino incluso si la pestana esta en 2.o plano
  // o el movil bloqueado: vibracion siempre, notificacion solo si no se ve.
  // Desactivable desde Perfil > Notificaciones.
  const notifyRestEnd = useCallback(() => {
    if (!preferences.notifyRestEnd) return;
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([200, 100, 200]);
    }
    if (
      typeof document !== "undefined" &&
      document.hidden &&
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      new Notification("Descanso terminado", {
        body: "Toca para seguir con la siguiente serie.",
        icon: "/icon-192.png",
        tag: "rogue-rest-end",
      });
    }
  }, [preferences.notifyRestEnd]);

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
  ]);

  const start = useCallback((d: RoutineDay) => {
    // Pedimos permiso de notificacion aqui (gesto de usuario) para poder
    // avisar de fin de descanso aunque la pestana este en 2.o plano.
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    }
    setDay(d);
    setRows(buildRows(d, preferences.unit));
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
      if (willBeDone) {
        setRestTotal(restSec);
        setRestUntil(Date.now() + restSec * 1000);
      }
    },
    [],
  );

  const addSet = useCallback((exId: string) => {
    setRows((prev) => {
      const list = prev[exId] ?? [];
      // La nueva serie hereda kg/reps de la ultima para agilizar el registro.
      const last = list[list.length - 1];
      const next: SetState = {
        weightKg: last?.weightKg ?? "",
        reps: last?.reps ?? "",
        done: false,
      };
      return { ...prev, [exId]: [...list, next] };
    });
  }, []);

  const removeSet = useCallback((exId: string, i: number) => {
    setRows((prev) => {
      const list = (prev[exId] ?? []).filter((_, idx) => idx !== i);
      return { ...prev, [exId]: list };
    });
  }, []);

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

  const skipRest = useCallback(() => setRestUntil(null), []);

  // Ajusta el descanso en curso al vuelo (+/- segundos). Si al restar cae por
  // debajo de cero, el descanso termina ya. restTotal se mueve en paralelo para
  // que la barra de progreso siga siendo coherente.
  const adjustRest = useCallback((deltaSec: number) => {
    setRestUntil((prev) => {
      if (prev === null) return prev;
      return Math.max(Date.now(), prev + deltaSec * 1000);
    });
    setRestTotal((prev) => Math.max(0, prev + deltaSec));
  }, []);

  const finish = useCallback(() => {
    if (!day) return;
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
        const weightKg = toKg(Number(s.weightKg) || 0, preferences.unit);
        topWeightByEx[ex.exerciseId] = Math.max(
          topWeightByEx[ex.exerciseId] ?? 0,
          weightKg,
        );
        sets.push({ exerciseId: ex.exerciseId, grupo: info.grupo, weightKg, reps });
      }
    }
    if (sets.length === 0) return;

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
    setFinalDurationSec(durationSec ?? null);
    setResult(logSession(day.label, sets, durationSec, notes));
    setRestUntil(null);
    setMinimized(false);
    setPhase("done");
  }, [day, rows, logSession, preferences.unit, startedAt, noteDrafts]);

  const { doneCount, totalCount } = useMemo(() => {
    const all = Object.values(rows).flat();
    return {
      doneCount: all.filter((s) => s.done).length,
      totalCount: all.length,
    };
  }, [rows]);

  const value: WorkoutSessionContextValue = {
    active,
    minimized,
    phase,
    day,
    rows,
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
    noteDrafts,
    setExerciseFlag,
    setExerciseNote,
    reminders,
    dismissReminders,
    skipRest,
    adjustRest,
    finish,
  };

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
