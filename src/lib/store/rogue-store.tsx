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
import { usePathname } from "next/navigation";
import type { ExerciseCategory, MuscleId } from "@/lib/exercises/types";
import { getExerciseByIdSync } from "@/lib/exercises/repo";
import { estimate1RM } from "@/lib/workout/one-rm";
import { DEMO_ROUTINE } from "@/data/routine.demo";
import { createClient } from "@/lib/supabase/client";
import { fetchAllPages } from "@/lib/supabase/fetch-all";
import { syncWrite, type SyncOp } from "@/lib/supabase/sync";
import { Button } from "@/components/ui/button";
import type {
  ExerciseNote,
  ExerciseNoteInput,
  LoggedSet,
  Preferences,
  Profile,
  RoutineDay,
  RoutineExercise,
  WorkoutSession,
} from "@/lib/workout/types";

const DEFAULT_PROFILE: Profile = {
  onboarded: false,
  username: "",
  name: "",
  sex: "hombre",
  bodyweightKg: 75,
  heightCm: 175,
  goal: "Hipertrofia",
};

const DEFAULT_PREFERENCES: Preferences = {
  unit: "kg",
  displayNameSource: "name",
  notifyReminders: true,
  notifyRestEnd: true,
  notifyWeeklySummary: false,
  shareStats: true,
  recoveryHours: {},
};

/**
 * Ventana de historial que se trae al arrancar. Nada de la UI necesita ya el
 * historial completo --los agregados los calcula Postgres (workout_stats)-- y
 * traerlo entero crecia sin techo con la antiguedad del usuario. Un ano cubre
 * de sobra el calendario, la racha y el volumen semanal.
 *
 * Pendiente: cargar bajo demanda los meses anteriores cuando el usuario navega
 * el calendario mas atras de la ventana (hoy simplemente no los ve).
 */
const HISTORY_WINDOW_DAYS = 365;

/** Agregados sobre TODO el historial, calculados en servidor. */
export type WorkoutStats = {
  totalSessions: number;
  timedCount: number;
  avgDurationSec: number;
  longestDurationSec: number;
  /** Series registradas por categoria de ejercicio. */
  setsByCategory: Record<string, number>;
  /** Ultimo peso (kg) y reps de cada ejercicio, para prellenar la sesion. */
  lastByExercise: Record<string, { weightKg: number; reps: number }>;
};

const EMPTY_STATS: WorkoutStats = {
  totalSessions: 0,
  timedCount: 0,
  avgDurationSec: 0,
  longestDurationSec: 0,
  setsByCategory: {},
  lastByExercise: {},
};

type ExerciseInfo = { nombre: string; grupo: ExerciseCategory };

/** Resuelve contra la fachada en vez de contra un Map de modulo: los ejercicios
 *  personalizados se registran despues del arranque, y con un Map construido al
 *  importar el historial los mostraria con el slug crudo. */
export function getExerciseInfo(id: string): ExerciseInfo {
  const exercise = getExerciseByIdSync(id);
  return exercise
    ? { nombre: exercise.nombre, grupo: exercise.grupo }
    : { nombre: id, grupo: "Core" };
}

export type PrResult = { exerciseId: string; nombre: string; est1RM: number };
export type LogResult = {
  session: WorkoutSession;
  prs: PrResult[];
};

type RogueState = {
  profile: Profile;
  sessions: WorkoutSession[];
  stats: WorkoutStats;
  routineDays: RoutineDay[];
  preferences: Preferences;
  exerciseNotes: ExerciseNote[];
};

const DEFAULT_STATE: RogueState = {
  profile: DEFAULT_PROFILE,
  sessions: [],
  stats: EMPTY_STATS,
  routineDays: DEMO_ROUTINE.days,
  preferences: DEFAULT_PREFERENCES,
  exerciseNotes: [],
};

type RogueContextValue = {
  hydrated: boolean;
  /** Si hay sesion de Supabase activa. false => OnboardingGate manda a /login. */
  authenticated: boolean;
  profile: Profile;
  /** Historial reciente (ventana de HISTORY_WINDOW_DAYS), NO todo el historico.
   *  Para cifras de siempre (total de entrenos, media, ultimo peso) usar
   *  `stats`, que las calcula Postgres sobre el historial completo. */
  sessions: WorkoutSession[];
  stats: WorkoutStats;
  routineDays: RoutineDay[];
  /** Dias de rutina programados para el dia de la semana actual (getDay()).
   *  Vacio = hoy toca descanso (o no hay rutina). */
  todayDays: RoutineDay[];
  /** Primer entreno programado para hoy, o null si hoy es descanso. Atajo
   *  de conveniencia sobre todayDays. */
  todayDay: RoutineDay | null;
  preferences: Preferences;
  completeOnboarding: (data: Partial<Profile>) => void;
  updateProfile: (patch: Partial<Profile>) => void;
  updatePreferences: (patch: Partial<Preferences>) => void;
  /** Username propio, con validacion de formato y unicidad. Devuelve un
   *  mensaje de error si no se pudo guardar (p.ej. ya esta en uso). */
  updateUsername: (username: string) => Promise<{ error?: string }>;
  logSession: (
    dayLabel: string,
    sets: LoggedSet[],
    durationSec?: number,
    notes?: ExerciseNoteInput[],
  ) => LogResult;
  /** Borra un entreno del historial (optimista + delete en Supabase, que
   *  arrastra series y notas por el ON DELETE CASCADE). */
  deleteSession: (id: string) => void;
  /** Notas/flags de ejercicio guardadas (para historial y recordatorios). */
  exerciseNotes: ExerciseNote[];
  /** Marca como vistos los recordatorios pendientes de estos ejercicios, para
   *  que no vuelvan a saltar. */
  acknowledgeReminders: (exerciseIds: string[]) => void;
  saveRoutine: (days: RoutineDay[]) => void;
  /** Re-lee la rutina desde Supabase y actualiza el estado. La usa NOA tras
   *  escribir la rutina server-side (canal de refetch), para que la UI se
   *  refresque sin recargar la app. */
  reloadRoutine: () => Promise<void>;
  /** Re-lee el perfil y las preferencias desde Supabase. La usa NOA tras
   *  cambiar peso/objetivo/ajustes server-side, para refrescar la UI sin
   *  recargar la app. */
  reloadProfile: () => Promise<void>;
  resetAll: () => void;
};

const RogueContext = createContext<RogueContextValue | null>(null);

/** Agregados calculados en cliente sobre las sesiones cargadas. Solo se usa
 *  como red de seguridad cuando workout_stats no esta disponible: las cifras
 *  "de siempre" salen entonces limitadas a la ventana. */
function statsFromSessions(sessions: WorkoutSession[]): WorkoutStats {
  return sessions.reduce<WorkoutStats>(
    (acc, session) => applySessionToStats(acc, session),
    EMPTY_STATS,
  );
}

/** Incorpora una sesion recien registrada a los agregados ya cargados. */
function applySessionToStats(
  stats: WorkoutStats,
  session: WorkoutSession,
): WorkoutStats {
  const setsByCategory = { ...stats.setsByCategory };
  const lastByExercise = { ...stats.lastByExercise };
  for (const set of session.sets) {
    setsByCategory[set.grupo] = (setsByCategory[set.grupo] ?? 0) + 1;
    // El ultimo set de cada ejercicio en esta sesion manda: es lo mas reciente.
    lastByExercise[set.exerciseId] = { weightKg: set.weightKg, reps: set.reps };
  }

  const timed = session.durationSec !== undefined && session.durationSec > 0;
  const timedCount = stats.timedCount + (timed ? 1 : 0);
  const avgDurationSec = timed
    ? Math.round(
        (stats.avgDurationSec * stats.timedCount + (session.durationSec ?? 0)) /
          timedCount,
      )
    : stats.avgDurationSec;

  return {
    totalSessions: stats.totalSessions + 1,
    timedCount,
    avgDurationSec,
    longestDurationSec: Math.max(
      stats.longestDurationSec,
      session.durationSec ?? 0,
    ),
    setsByCategory,
    lastByExercise,
  };
}

function bestEst1RMByExercise(sessions: WorkoutSession[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of sessions) {
    for (const set of s.sets) {
      const e = estimate1RM(set.weightKg, set.reps);
      if (e > (map.get(set.exerciseId) ?? 0)) map.set(set.exerciseId, e);
    }
  }
  return map;
}

// --- Mapeo filas de Supabase <-> tipos de la app ---

type ProfileRow = {
  username: string;
  name: string;
  sex: Profile["sex"];
  bodyweight_kg: number;
  height_cm: number;
  goal: string;
  onboarded: boolean;
  unit: Preferences["unit"];
  display_name_source: Preferences["displayNameSource"];
  notify_reminders: boolean;
  notify_rest_end: boolean;
  notify_weekly_summary: boolean;
  share_stats: boolean;
  recovery_hours: Partial<Record<MuscleId, number>> | null;
};

function rowToProfile(row: ProfileRow): Profile {
  return {
    onboarded: row.onboarded,
    username: row.username,
    name: row.name,
    sex: row.sex,
    bodyweightKg: Number(row.bodyweight_kg),
    heightCm: Number(row.height_cm),
    goal: row.goal,
  };
}

function rowToPreferences(row: ProfileRow): Preferences {
  return {
    unit: row.unit,
    displayNameSource: row.display_name_source,
    notifyReminders: row.notify_reminders,
    notifyRestEnd: row.notify_rest_end,
    notifyWeeklySummary: row.notify_weekly_summary,
    shareStats: row.share_stats,
    recoveryHours: row.recovery_hours ?? {},
  };
}

/** Construye el patch (snake_case) para la fila `profiles` a partir de los
 *  campos de Profile/Preferences que se hayan tocado. El username NO se
 *  incluye aqui: tiene su propio flujo (`updateUsername`) porque necesita
 *  validar unicidad y devolver un error a quien lo llama. */
function toProfileRowPatch(
  patch: Partial<Profile> & Partial<Preferences>,
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.onboarded !== undefined) row.onboarded = patch.onboarded;
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.sex !== undefined) row.sex = patch.sex;
  if (patch.bodyweightKg !== undefined) row.bodyweight_kg = patch.bodyweightKg;
  if (patch.heightCm !== undefined) row.height_cm = patch.heightCm;
  if (patch.goal !== undefined) row.goal = patch.goal;
  if (patch.unit !== undefined) row.unit = patch.unit;
  if (patch.displayNameSource !== undefined)
    row.display_name_source = patch.displayNameSource;
  if (patch.notifyReminders !== undefined)
    row.notify_reminders = patch.notifyReminders;
  if (patch.notifyRestEnd !== undefined)
    row.notify_rest_end = patch.notifyRestEnd;
  if (patch.notifyWeeklySummary !== undefined)
    row.notify_weekly_summary = patch.notifyWeeklySummary;
  if (patch.shareStats !== undefined) row.share_stats = patch.shareStats;
  if (patch.recoveryHours !== undefined) row.recovery_hours = patch.recoveryHours;
  return row;
}

type SupabaseClient = ReturnType<typeof createClient>;

/**
 * Techo para la carga inicial. Sin esto, una peticion que ni resuelve ni
 * rechaza --tipico en movil: la red "existe" pero el paquete no llega nunca--
 * dejaba `hydrated` en false para siempre y la app se quedaba en el splash sin
 * timeout, sin reintento y sin forma de salir salvo matar el proceso. Al
 * vencer, cae en la pantalla de reintento que ya existia para los errores.
 */
const LOAD_TIMEOUT_MS = 15_000;


function withTimeout<T>(
  promise: PromiseLike<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(
      () => reject(new Error(`Tiempo de espera agotado cargando ${label}`)),
      ms,
    );
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(id);
        resolve(value);
      },
      (err) => {
        clearTimeout(id);
        reject(err);
      },
    );
  });
}

async function fetchProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function fetchRoutine(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ routineId: string; days: RoutineDay[] } | null> {
  const { data: routineRow, error: routineError } = await supabase
    .from("routines")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (routineError) throw routineError;
  if (!routineRow) return null;

  const { data: dayRows, error: daysError } = await supabase
    .from("routine_days")
    .select("id, label, focus, position, weekdays")
    .eq("routine_id", routineRow.id)
    .order("position");
  if (daysError) throw daysError;
  const days = dayRows ?? [];
  if (days.length === 0) return { routineId: routineRow.id, days: [] };

  const dayIds = days.map((d) => d.id);
  const { data: exRows, error: exError } = await supabase
    .from("routine_exercises")
    .select("routine_day_id, exercise_id, position, sets, reps, rest_sec, suggested_kg")
    .in("routine_day_id", dayIds)
    .order("position");
  if (exError) throw exError;

  const exByDay = new Map<string, RoutineExercise[]>();
  for (const ex of exRows ?? []) {
    const list = exByDay.get(ex.routine_day_id) ?? [];
    list.push({
      exerciseId: ex.exercise_id,
      sets: ex.sets,
      reps: ex.reps,
      restSec: ex.rest_sec,
      suggestedKg: Number(ex.suggested_kg),
    });
    exByDay.set(ex.routine_day_id, list);
  }

  return {
    routineId: routineRow.id,
    days: days.map((d) => ({
      id: d.id,
      label: d.label,
      focus: d.focus,
      weekdays: (d.weekdays as number[] | null) ?? [],
      exercises: exByDay.get(d.id) ?? [],
    })),
  };
}

type SessionRow = {
  id: string;
  day_label: string;
  date: string;
  duration_sec: number | null;
  workout_sets: {
    exercise_id: string;
    categoria: string;
    weight_kg: number;
    reps: number;
    position: number;
  }[];
};

/**
 * Agregados desde Postgres. Devuelve null --sin lanzar-- si la funcion todavia
 * no existe en la base de datos.
 *
 * Es deliberado: cliente y BD no se despliegan a la vez, y si el codigo nuevo
 * llega antes que la migracion, hacer fallar esta lectura tumbaria la carga
 * entera y dejaria la app inutilizable en vez de solo mostrar cifras algo
 * peores. Con null se cae al calculo local sobre la ventana cargada.
 */
async function fetchStats(
  supabase: SupabaseClient,
): Promise<WorkoutStats | null> {
  const { data, error } = await supabase.rpc("workout_stats");
  if (error) {
    console.warn(
      "workout_stats no disponible; se usaran agregados de la ventana cargada:",
      error.message,
    );
    return null;
  }
  const raw = (data ?? {}) as Record<string, unknown>;
  return {
    totalSessions: Number(raw.total_sessions ?? 0),
    timedCount: Number(raw.timed_count ?? 0),
    avgDurationSec: Number(raw.avg_duration_sec ?? 0),
    longestDurationSec: Number(raw.longest_duration_sec ?? 0),
    setsByCategory: (raw.sets_by_category ?? {}) as Record<string, number>,
    lastByExercise: (raw.last_by_exercise ?? {}) as WorkoutStats["lastByExercise"],
  };
}

async function fetchSessions(
  supabase: SupabaseClient,
  userId: string,
): Promise<WorkoutSession[]> {
  const since = new Date(
    Date.now() - HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  // Sets embebidos en la misma consulta (un .in() con cientos de ids de
  // sesion acababa generando URLs enormes) y paginado con .range() para que
  // el historial no se trunque en las 1000 filas por defecto de PostgREST.
  const rows = await fetchAllPages<SessionRow>(async (from, to) => {
    const { data, error } = await supabase
      .from("workout_sessions")
      .select(
        "id, day_label, date, duration_sec, workout_sets (exercise_id, categoria, weight_kg, reps, position)",
      )
      .eq("user_id", userId)
      .gte("date", since)
      .order("date", { ascending: true })
      .order("id", { ascending: true })
      .order("position", { referencedTable: "workout_sets" })
      .range(from, to);
    if (error) throw error;
    return (data ?? []) as SessionRow[];
  });

  return rows.map((s) => ({
    id: s.id,
    dateISO: s.date,
    dayLabel: s.day_label,
    sets: s.workout_sets.map((set) => ({
      exerciseId: set.exercise_id,
      grupo: set.categoria as ExerciseCategory,
      weightKg: Number(set.weight_kg),
      reps: set.reps,
    })),
    durationSec: s.duration_sec ?? undefined,
  }));
}

/**
 * Guarda la rutina entera (rutina + dias + ejercicios) en UNA transaccion, via
 * la funcion `save_routine` de Postgres
 * (ver supabase/migrations/20260805_save_routine_rpc.sql).
 *
 * Antes esto eran 1 + 2N peticiones HTTP sueltas: un delete de todos los dias
 * seguido de inserts uno a uno. Si la red se cortaba despues del delete, la
 * rutina quedaba VACIA en servidor mientras la pantalla seguia mostrandola
 * entera, y si los reintentos fallaban el usuario acababa con la rutina de
 * demo. Mismo fallo que arrastraban los entrenos hasta que se creo log_workout.
 *
 * Devuelve el id de la rutina (la crea si el usuario aun no tenia ninguna) para
 * que routineIdRef quede fijado. Es idempotente: un reintento no duplica.
 */
/**
 * Operacion de guardado de rutina para la cola de sync.
 *
 * `save_routine` con `p_routine_id = null` resuelve sola la rutina del usuario
 * (coge la primera y solo crea una si no hay ninguna), asi que es idempotente
 * y no hace falta recuperar el id devuelto para el siguiente guardado.
 */
function routineRpc(
  routineId: string | null,
  name: string,
  days: RoutineDay[],
): SyncOp {
  return {
    kind: "rpc",
    fn: "save_routine",
    args: {
      p_routine_id: routineId,
      p_name: name,
      p_days: days.map((day) => ({
        id: day.id,
        label: day.label,
        focus: day.focus,
        weekdays: day.weekdays ?? [],
        exercises: day.exercises.map((ex) => ({
          exerciseId: ex.exerciseId,
          sets: ex.sets,
          reps: ex.reps,
          restSec: ex.restSec,
          suggestedKg: ex.suggestedKg,
        })),
      })),
    },
  };
}

/**
 * Guarda sesion + series + notas en UNA transaccion, via la funcion
 * `log_workout` de Postgres (ver supabase/migrations/20260723_log_workout_rpc.sql).
 *
 * Antes esto eran 3-4 peticiones HTTP sueltas: si la red se cortaba a mitad
 * quedaba la sesion SIN series, y como el reintento borra antes de insertar,
 * podia quedarse vacia de forma permanente (paso el 23/07/2026). Ahora es
 * todo-o-nada, y sigue siendo idempotente, asi que un reintento no duplica.
 *
 * El user_id lo pone la funcion desde auth.uid(), no viaja como parametro.
 */
function workoutRpc(
  session: WorkoutSession,
  notes: ExerciseNote[],
  routineId: string | null,
): SyncOp {
  return {
    kind: "rpc",
    fn: "log_workout",
    args: {
    p_session_id: session.id,
    p_day_label: session.dayLabel,
    p_date: session.dateISO,
    p_duration_sec: session.durationSec ?? null,
    // Sin esto workout_sessions.routine_id era siempre NULL: el trigger
    // touch_routine_last_used no llegaba a dispararse nunca y se perdia la
    // trazabilidad entreno -> rutina.
    p_routine_id: routineId,
    p_sets: session.sets.map((set, i) => ({
      exercise_id: set.exerciseId,
      categoria: set.grupo,
      weight_kg: set.weightKg,
      reps: set.reps,
      position: i,
    })),
    p_notes: notes.map((n) => ({
      id: n.id,
      exercise_id: n.exerciseId,
      flag: n.flag,
      note: n.text,
      weight_kg: n.weightKg,
      acknowledged: n.acknowledged,
      created_at: n.dateISO,
    })),
    },
  };
}

type ExerciseNoteRow = {
  id: string;
  session_id: string;
  exercise_id: string;
  flag: string | null;
  note: string | null;
  weight_kg: number | null;
  acknowledged: boolean;
  created_at: string;
};

async function fetchExerciseNotes(
  supabase: SupabaseClient,
  userId: string,
): Promise<ExerciseNote[]> {
  const rows = await fetchAllPages<ExerciseNoteRow>(async (from, to) => {
    const { data, error } = await supabase
      .from("exercise_notes")
      .select("id, session_id, exercise_id, flag, note, weight_kg, acknowledged, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw error;
    return data ?? [];
  });
  return rows.map((n) => ({
    id: n.id,
    sessionId: n.session_id,
    exerciseId: n.exercise_id,
    flag: n.flag as ExerciseNote["flag"],
    text: n.note,
    weightKg: n.weight_kg === null ? null : Number(n.weight_kg),
    acknowledged: n.acknowledged,
    dateISO: n.created_at,
  }));
}

export function RogueProvider({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => createClient());
  const pathname = usePathname();

  const [state, setState] = useState<RogueState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  // La carga inicial fallo (sin conexion, Supabase caido...). Se bloquea la
  // app con una pantalla de reintento: seguir con el estado por defecto haria
  // que OnboardingGate mandase a un usuario existente a re-hacer el
  // onboarding (y machacase su rutina al completarlo).
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const userIdRef = useRef<string | null>(null);
  const routineIdRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      let user: { id: string } | null;
      try {
        // getUser() tambien va con timeout: si se cuelga aqui --antes del
        // try/catch de las lecturas-- no habia forma de salir de la pantalla
        // de carga.
        const result = await withTimeout(
          supabase.auth.getUser(),
          LOAD_TIMEOUT_MS,
          "la sesion",
        );
        user = result.data.user;
      } catch (err) {
        if (!active) return;
        console.error("No se pudo comprobar la sesion:", err);
        setLoadError(true);
        return;
      }

      if (!user) {
        // No tocar userIdRef si este efecto ya no esta vigente (mismo motivo
        // que abajo): un efecto abortado no debe "desmarcar" el usuario que
        // un efecto posterior (valido) ya confirmo como autenticado.
        if (!active) return;
        userIdRef.current = null;
        routineIdRef.current = null;
        setAuthenticated(false);
        setState(DEFAULT_STATE);
        setHydrated(true);
        return;
      }

      // Mismo usuario que ya teniamos cargado: no re-consultar Supabase en
      // cada cambio de ruta, o una escritura optimista en curso (p.ej. el
      // seed de historial al completar el onboarding) se pisaria con una
      // lectura que todavia no ve esos datos.
      if (user.id === userIdRef.current) {
        if (active) setHydrated(true);
        return;
      }

      let profileRow: ProfileRow | null;
      let routine: Awaited<ReturnType<typeof fetchRoutine>>;
      let sessions: WorkoutSession[];
      let exerciseNotes: ExerciseNote[];
      let stats: WorkoutStats | null;
      try {
        [profileRow, routine, sessions, exerciseNotes, stats] = await withTimeout(
          Promise.all([
            fetchProfile(supabase, user.id),
            fetchRoutine(supabase, user.id),
            fetchSessions(supabase, user.id),
            fetchExerciseNotes(supabase, user.id),
            fetchStats(supabase),
          ]),
          LOAD_TIMEOUT_MS,
          "tus datos",
        );
      } catch (err) {
        if (!active) return;
        console.error("No se pudieron cargar los datos del usuario:", err);
        setLoadError(true);
        return;
      }
      // No marcar userIdRef hasta que sepamos que este efecto sigue vigente:
      // si se aborto (p.ej. un cambio de pathname a mitad de la carga), un
      // efecto posterior no debe pensar que este usuario "ya estaba cargado"
      // sin haber llegado a fijar authenticated/estado.
      if (!active) return;

      userIdRef.current = user.id;
      routineIdRef.current = routine?.routineId ?? null;

      setLoadError(false);
      setAuthenticated(true);
      setState({
        profile: profileRow ? rowToProfile(profileRow) : DEFAULT_PROFILE,
        preferences: profileRow ? rowToPreferences(profileRow) : DEFAULT_PREFERENCES,
        sessions,
        stats: stats ?? statsFromSessions(sessions),
        routineDays: routine && routine.days.length > 0 ? routine.days : DEMO_ROUTINE.days,
        exerciseNotes,
      });
      setHydrated(true);
    }

    load();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        userIdRef.current = null;
        routineIdRef.current = null;
        setAuthenticated(false);
        setState(DEFAULT_STATE);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
    // Se re-comprueba la sesion en cada cambio de ruta: el login/logout ocurre
    // via Server Actions (redirect), y el cliente de supabase-js no se entera
    // solo -- las cookies cambian pero este efecto no se re-ejecuta sin esto.
    // loadAttempt fuerza el reintento manual desde la pantalla de error.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, loadAttempt]);

  const completeOnboarding = useCallback(
    (data: Partial<Profile>) => {
      // Base en el perfil ya cargado (trae el username real de Supabase),
      // no en DEFAULT_PROFILE, para no borrarlo al completar el onboarding.
      const profile: Profile = { ...DEFAULT_PROFILE, ...state.profile, ...data, onboarded: true };
      // Sin historial de demo: los usuarios nuevos empiezan de cero, sin
      // entrenos falsos. La rutina de partida si se ofrece.
      setState((prev) => ({ ...prev, profile, sessions: [], routineDays: DEMO_ROUTINE.days }));

      const userId = userIdRef.current;
      if (!userId) return;
      syncWrite("el perfil", [
        {
          kind: "update",
          table: "profiles",
          values: toProfileRowPatch(profile),
          match: { user_id: userId },
        },
        routineRpc(routineIdRef.current, DEMO_ROUTINE.name, DEMO_ROUTINE.days),
      ]);
    },
    [state.profile],
  );

  const updateProfile = useCallback(
    (patch: Partial<Profile>) => {
      setState((prev) => ({ ...prev, profile: { ...prev.profile, ...patch } }));
      const userId = userIdRef.current;
      if (!userId) return;
      syncWrite("el perfil", {
        kind: "update",
        table: "profiles",
        values: toProfileRowPatch(patch),
        match: { user_id: userId },
      });
    },
    [],
  );

  const updatePreferences = useCallback(
    (patch: Partial<Preferences>) => {
      setState((prev) => ({ ...prev, preferences: { ...prev.preferences, ...patch } }));
      const userId = userIdRef.current;
      if (!userId) return;
      syncWrite("las preferencias", {
        kind: "update",
        table: "profiles",
        values: toProfileRowPatch(patch),
        match: { user_id: userId },
      });
    },
    [],
  );

  const updateUsername = useCallback(
    async (username: string): Promise<{ error?: string }> => {
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
        return { error: "El usuario debe tener 3-20 caracteres (letras, numeros, _)." };
      }
      const userId = userIdRef.current;
      if (!userId) return { error: "No has iniciado sesion." };

      const { error } = await supabase
        .from("profiles")
        .update({ username })
        .eq("user_id", userId);
      if (error) {
        return {
          error:
            error.code === "23505"
              ? "Ese nombre de usuario ya esta en uso."
              : "No se pudo actualizar el usuario.",
        };
      }
      setState((prev) => ({ ...prev, profile: { ...prev.profile, username } }));
      return {};
    },
    [supabase],
  );

  const logSession = useCallback(
    (
      dayLabel: string,
      sets: LoggedSet[],
      durationSec?: number,
      notes?: ExerciseNoteInput[],
    ): LogResult => {
      const session: WorkoutSession = {
        id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `s-${Date.now()}`,
        dateISO: new Date().toISOString(),
        dayLabel,
        sets,
        durationSec,
      };

      // Convierte los borradores de nota en filas persistibles ligadas a la
      // sesion recien creada (solo las que tienen flag o texto).
      const noteRows: ExerciseNote[] = (notes ?? [])
        .filter((n) => n.flag !== null || (n.text ?? "").trim() !== "")
        .map((n) => ({
          id:
            typeof crypto !== "undefined" && crypto.randomUUID
              ? crypto.randomUUID()
              : `n-${Date.now()}-${n.exerciseId}`,
          sessionId: session.id,
          exerciseId: n.exerciseId,
          flag: n.flag,
          text: (n.text ?? "").trim() || null,
          weightKg: n.weightKg,
          acknowledged: false,
          dateISO: session.dateISO,
        }));

      const prevBest = bestEst1RMByExercise(state.sessions);
      const newBest = bestEst1RMByExercise([session]);
      const prs: PrResult[] = [];
      for (const [exerciseId, est] of newBest) {
        if (est > (prevBest.get(exerciseId) ?? 0)) {
          prs.push({
            exerciseId,
            nombre: getExerciseInfo(exerciseId).nombre,
            est1RM: Math.round(est),
          });
        }
      }

      setState((prev) => ({
        ...prev,
        sessions: [...prev.sessions, session],
        exerciseNotes: [...prev.exerciseNotes, ...noteRows],
        // Los agregados los calcula Postgres, pero solo al arrancar: aqui se
        // adelantan a mano para que el perfil, la media de duracion y el
        // prellenado reflejen el entreno recien hecho sin recargar.
        stats: applySessionToStats(prev.stats, session),
      }));

      const userId = userIdRef.current;
      if (userId) {
        syncWrite("el entreno", workoutRpc(session, noteRows, routineIdRef.current));
      }

      return { session, prs };
    },
    [state.sessions],
  );

  const deleteSession = useCallback(
    (id: string) => {
      // Optimista: fuera del estado al instante. Tambien se quitan sus notas
      // locales.
      setState((prev) => {
        const removed = prev.sessions.find((s) => s.id === id);
        const setsByCategory = { ...prev.stats.setsByCategory };
        for (const set of removed?.sets ?? []) {
          setsByCategory[set.grupo] = Math.max(
            0,
            (setsByCategory[set.grupo] ?? 0) - 1,
          );
        }
        return {
          ...prev,
          sessions: prev.sessions.filter((s) => s.id !== id),
          exerciseNotes: prev.exerciseNotes.filter((n) => n.sessionId !== id),
          stats: {
            ...prev.stats,
            totalSessions: Math.max(0, prev.stats.totalSessions - 1),
            setsByCategory,
            // avgDuration y lastByExercise no se recalculan aqui: exigirian
            // rehacer el agregado sobre TODO el historial, que es justo lo que
            // se quiere evitar en cliente. Se corrigen solos al recargar.
          },
        };
      });

      const userId = userIdRef.current;
      if (userId) {
        // El ON DELETE CASCADE de workout_sets y exercise_notes arrastra las
        // filas hijas al borrar la sesion.
        syncWrite("el borrado del entreno", {
          kind: "delete",
          table: "workout_sessions",
          match: { id, user_id: userId },
        });
      }
    },
    [],
  );

  // Marca como vistos los recordatorios pendientes de estos ejercicios para que
  // no vuelvan a saltar. Actualiza estado local y Supabase (best-effort).
  const acknowledgeReminders = useCallback(
    (exerciseIds: string[]) => {
      if (exerciseIds.length === 0) return;
      const ids = new Set(exerciseIds);
      const affected = state.exerciseNotes.filter(
        (n) => ids.has(n.exerciseId) && !n.acknowledged,
      );
      if (affected.length === 0) return;

      setState((prev) => ({
        ...prev,
        exerciseNotes: prev.exerciseNotes.map((n) =>
          ids.has(n.exerciseId) && !n.acknowledged
            ? { ...n, acknowledged: true }
            : n,
        ),
      }));

      const userId = userIdRef.current;
      if (userId) {
        // Una op por nota (suelen ser una o dos): la cola describe las
        // escrituras por clave para poder serializarlas, y no cubre `.in()`.
        syncWrite(
          "los recordatorios",
          affected.map((n) => ({
            kind: "update" as const,
            table: "exercise_notes",
            values: { acknowledged: true },
            match: { id: n.id },
          })),
        );
      }
    },
    [state.exerciseNotes],
  );

  const saveRoutine = useCallback(
    (days: RoutineDay[]) => {
      setState((prev) => ({ ...prev, routineDays: days }));

      const userId = userIdRef.current;
      if (!userId) return;
      syncWrite("la rutina", routineRpc(routineIdRef.current, "Mi rutina", days));
    },
    [],
  );

  /**
   * Re-lee la rutina desde Supabase. La usa NOA tras escribirla en servidor:
   * el cambio no pasa por `saveRoutine`, asi que sin esto la UI seguiria
   * mostrando la rutina anterior hasta recargar la app.
   */
  const reloadRoutine = useCallback(async () => {
    const userId = userIdRef.current;
    if (!userId) return;
    try {
      const routine = await fetchRoutine(supabase, userId);
      routineIdRef.current = routine?.routineId ?? null;
      setState((prev) => ({ ...prev, routineDays: routine?.days ?? prev.routineDays }));
    } catch (err) {
      console.error("No se pudo recargar la rutina:", err);
    }
  }, [supabase],
  );

  const reloadProfile = useCallback(async () => {
    const userId = userIdRef.current;
    if (!userId) return;
    try {
      const profileRow = await fetchProfile(supabase, userId);
      if (!profileRow) return;
      setState((prev) => ({
        ...prev,
        profile: rowToProfile(profileRow),
        preferences: rowToPreferences(profileRow),
      }));
    } catch (err) {
      console.error("No se pudo recargar el perfil:", err);
    }
  }, [supabase]);

  const resetAll = useCallback(() => {
    // El username no se toca: sigue siendo la cuenta del mismo usuario.
    setState({
      ...DEFAULT_STATE,
      profile: { ...DEFAULT_PROFILE, username: state.profile.username },
    });

    const userId = userIdRef.current;
    const routineId = routineIdRef.current;
    if (!userId) return;
    syncWrite("el reinicio de datos", [
      { kind: "delete", table: "workout_sessions", match: { user_id: userId } },
      ...(routineId
        ? ([
            { kind: "delete", table: "routine_days", match: { routine_id: routineId } },
          ] as const)
        : []),
      {
        kind: "update",
        table: "profiles",
        values: toProfileRowPatch({ ...DEFAULT_PROFILE, ...DEFAULT_PREFERENCES }),
        match: { user_id: userId },
      },
    ]);
  }, [state.profile.username]);

  const todayDays = useMemo(() => {
    const weekday = new Date().getDay(); // 0=domingo..6=sabado
    return state.routineDays.filter((d) => d.weekdays.includes(weekday));
  }, [state.routineDays]);

  const todayDay = todayDays[0] ?? null;

  // Memoizado para que el objeto de contexto sea estable entre renders y no
  // fuerce un re-render de todos los consumidores de useRogue en cada render
  // del provider. Las acciones ya son estables (useCallback) y los derivados
  // (todayDays) van memoizados aparte.
  const value: RogueContextValue = useMemo(
    () => ({
      hydrated,
      authenticated,
      profile: state.profile,
      sessions: state.sessions,
      stats: state.stats,
      routineDays: state.routineDays,
      todayDays,
      todayDay,
      preferences: state.preferences,
      completeOnboarding,
      updateProfile,
      updatePreferences,
      updateUsername,
      logSession,
      deleteSession,
      exerciseNotes: state.exerciseNotes,
      acknowledgeReminders,
      saveRoutine,
      reloadRoutine,
      reloadProfile,
      resetAll,
    }),
    [
      hydrated,
      authenticated,
      state.profile,
      state.sessions,
      state.stats,
      state.routineDays,
      todayDays,
      todayDay,
      state.preferences,
      state.exerciseNotes,
      completeOnboarding,
      updateProfile,
      updatePreferences,
      updateUsername,
      logSession,
      deleteSession,
      acknowledgeReminders,
      saveRoutine,
      reloadRoutine,
      reloadProfile,
      resetAll,
    ],
  );

  return (
    <RogueContext.Provider value={value}>
      {loadError ? (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-background px-8 text-center">
          <p className="text-base font-semibold">No se pudieron cargar tus datos</p>
          <p className="text-sm text-muted-foreground">
            Comprueba tu conexion e intentalo de nuevo.
          </p>
          <Button
            onClick={() => {
              setLoadError(false);
              setLoadAttempt((n) => n + 1);
            }}
            className="mt-3 px-6"
          >
            Reintentar
          </Button>
        </div>
      ) : (
        children
      )}
    </RogueContext.Provider>
  );
}

export function useRogue(): RogueContextValue {
  const ctx = useContext(RogueContext);
  if (!ctx) throw new Error("useRogue debe usarse dentro de RogueProvider");
  return ctx;
}
