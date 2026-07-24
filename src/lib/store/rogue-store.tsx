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
import type { MuscleGroup } from "@/lib/ranks";
import type { ExerciseCategory } from "@/lib/exercises/types";
import { DEMO_EXERCISES } from "@/lib/exercises/repo";
import {
  aggregateToGroups,
  averageRank,
  computeMuscleRanks,
  computeRanks,
  estimate1RM,
  rankScore,
  type ComputedMuscleRank,
  type ComputedRank,
  type ExerciseMuscles,
} from "@/lib/rank-engine";
import { DEMO_ROUTINE } from "@/data/routine.demo";
import { createClient } from "@/lib/supabase/client";
import { fetchAllPages } from "@/lib/supabase/fetch-all";
import { syncWrite } from "@/lib/supabase/sync";
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
  shareRanks: true,
  shareStats: true,
};

type ExerciseInfo = { nombre: string; grupo: ExerciseCategory };
const EXERCISE_INFO = new Map<string, ExerciseInfo>(
  DEMO_EXERCISES.map((e) => [e.id, { nombre: e.nombre, grupo: e.grupo }]),
);

export function getExerciseInfo(id: string): ExerciseInfo {
  return EXERCISE_INFO.get(id) ?? { nombre: id, grupo: "Core" };
}

/** Musculos primarios/secundarios por ejercicio, para el motor por musculo. */
const EXERCISE_MUSCLES = new Map<string, ExerciseMuscles>(
  DEMO_EXERCISES.map((e) => [
    e.id,
    { primarios: e.musculosPrimarios, secundarios: e.musculosSecundarios },
  ]),
);
export const muscleLookup = (id: string): ExerciseMuscles | null =>
  EXERCISE_MUSCLES.get(id) ?? null;

export type PrResult = { exerciseId: string; nombre: string; est1RM: number };
export type RankChange = {
  muscle: MuscleGroup;
  before: ComputedRank;
  after: ComputedRank;
  up: boolean;
  newlyRanked: boolean;
};
export type LogResult = {
  session: WorkoutSession;
  prs: PrResult[];
  rankChanges: RankChange[];
};

type RogueState = {
  profile: Profile;
  sessions: WorkoutSession[];
  routineDays: RoutineDay[];
  preferences: Preferences;
  exerciseNotes: ExerciseNote[];
};

const DEFAULT_STATE: RogueState = {
  profile: DEFAULT_PROFILE,
  sessions: [],
  routineDays: DEMO_ROUTINE.days,
  preferences: DEFAULT_PREFERENCES,
  exerciseNotes: [],
};

type RogueContextValue = {
  hydrated: boolean;
  /** Si hay sesion de Supabase activa. false => OnboardingGate manda a /login. */
  authenticated: boolean;
  profile: Profile;
  sessions: WorkoutSession[];
  ranks: ComputedRank[];
  muscleRanks: ComputedMuscleRank[];
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
  resetAll: () => void;
};

const RogueContext = createContext<RogueContextValue | null>(null);

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
  share_ranks: boolean;
  share_stats: boolean;
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
    shareRanks: row.share_ranks,
    shareStats: row.share_stats,
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
  if (patch.shareRanks !== undefined) row.share_ranks = patch.shareRanks;
  if (patch.shareStats !== undefined) row.share_stats = patch.shareStats;
  return row;
}

type SupabaseClient = ReturnType<typeof createClient>;

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

async function fetchSessions(
  supabase: SupabaseClient,
  userId: string,
): Promise<WorkoutSession[]> {
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

/** Inserta dias + ejercicios de una rutina existente (borra los anteriores).
 *  Lanza al primer error para que syncWrite reintente; como empieza borrando
 *  los dias de la rutina, repetirla desde cero es seguro (idempotente). */
async function persistRoutineDays(
  supabase: SupabaseClient,
  routineId: string,
  days: RoutineDay[],
) {
  const { error: deleteError } = await supabase
    .from("routine_days")
    .delete()
    .eq("routine_id", routineId);
  if (deleteError) throw deleteError;
  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const { data: dayRow, error: dayError } = await supabase
      .from("routine_days")
      .insert({
        routine_id: routineId,
        position: i,
        label: day.label,
        focus: day.focus,
        weekdays: day.weekdays ?? [],
      })
      .select("id")
      .single();
    if (dayError) throw dayError;
    if (day.exercises.length === 0) continue;
    const { error: exercisesError } = await supabase.from("routine_exercises").insert(
      day.exercises.map((ex, j) => ({
        routine_day_id: dayRow.id,
        exercise_id: ex.exerciseId,
        position: j,
        sets: ex.sets,
        reps: ex.reps,
        rest_sec: ex.restSec,
        suggested_kg: ex.suggestedKg,
      })),
    );
    if (exercisesError) throw exercisesError;
  }
}

/** Devuelve el id de la (unica) rutina del usuario, creandola solo si no existe
 *  ninguna. Consulta la BD antes de insertar para no duplicar cuando el ref
 *  local todavia no esta fijado (carga en curso u onboarding re-ejecutado). */
async function ensureRoutineId(
  supabase: SupabaseClient,
  userId: string,
  name: string,
): Promise<string> {
  const { data: existing, error: selectError } = await supabase
    .from("routines")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return existing.id;

  const { data: created, error: insertError } = await supabase
    .from("routines")
    .insert({ user_id: userId, name })
    .select("id")
    .single();
  if (insertError) throw insertError;
  return created.id;
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
async function saveWorkout(
  supabase: SupabaseClient,
  session: WorkoutSession,
  notes: ExerciseNote[],
) {
  const { error } = await supabase.rpc("log_workout", {
    p_session_id: session.id,
    p_day_label: session.dayLabel,
    p_date: session.dateISO,
    p_duration_sec: session.durationSec ?? null,
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
  });
  if (error) throw error;
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
      const {
        data: { user },
      } = await supabase.auth.getUser();

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
      try {
        [profileRow, routine, sessions, exerciseNotes] = await Promise.all([
          fetchProfile(supabase, user.id),
          fetchRoutine(supabase, user.id),
          fetchSessions(supabase, user.id),
          fetchExerciseNotes(supabase, user.id),
        ]);
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
      // rangos ni entrenos falsos. La rutina de partida si se ofrece.
      setState((prev) => ({ ...prev, profile, sessions: [], routineDays: DEMO_ROUTINE.days }));

      const userId = userIdRef.current;
      if (!userId) return;
      syncWrite("el perfil", async () => {
        const { error } = await supabase
          .from("profiles")
          .update(toProfileRowPatch(profile))
          .eq("user_id", userId);
        if (error) throw error;

        let routineId = routineIdRef.current;
        if (!routineId) {
          routineId = await ensureRoutineId(supabase, userId, DEMO_ROUTINE.name);
          routineIdRef.current = routineId;
        }
        await persistRoutineDays(supabase, routineId, DEMO_ROUTINE.days);
      });
    },
    [supabase, state.profile],
  );

  const updateProfile = useCallback(
    (patch: Partial<Profile>) => {
      setState((prev) => ({ ...prev, profile: { ...prev.profile, ...patch } }));
      const userId = userIdRef.current;
      if (!userId) return;
      syncWrite("el perfil", async () => {
        const { error } = await supabase
          .from("profiles")
          .update(toProfileRowPatch(patch))
          .eq("user_id", userId);
        if (error) throw error;
      });
    },
    [supabase],
  );

  const updatePreferences = useCallback(
    (patch: Partial<Preferences>) => {
      setState((prev) => ({ ...prev, preferences: { ...prev.preferences, ...patch } }));
      const userId = userIdRef.current;
      if (!userId) return;
      syncWrite("las preferencias", async () => {
        const { error } = await supabase
          .from("profiles")
          .update(toProfileRowPatch(patch))
          .eq("user_id", userId);
        if (error) throw error;
      });
    },
    [supabase],
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

      const before = computeRanks(
        state.sessions,
        state.profile.bodyweightKg,
        state.profile.sex,
        muscleLookup,
      );
      const nextSessions = [...state.sessions, session];
      const after = computeRanks(
        nextSessions,
        state.profile.bodyweightKg,
        state.profile.sex,
        muscleLookup,
      );

      const rankChanges: RankChange[] = [];
      for (const a of after) {
        const b = before.find((x) => x.muscle === a.muscle)!;
        if (!a.ranked) continue;
        const newlyRanked = !b.ranked;
        const up =
          newlyRanked || (a.ranked && b.ranked && rankScore(a) > rankScore(b));
        if (up) rankChanges.push({ muscle: a.muscle, before: b, after: a, up, newlyRanked });
      }

      setState((prev) => ({
        ...prev,
        sessions: nextSessions,
        exerciseNotes: [...prev.exerciseNotes, ...noteRows],
      }));

      const userId = userIdRef.current;
      if (userId) {
        syncWrite("el entreno", () => saveWorkout(supabase, session, noteRows));
      }

      return { session, prs, rankChanges };
    },
    [state.sessions, state.profile.bodyweightKg, state.profile.sex, supabase],
  );

  const deleteSession = useCallback(
    (id: string) => {
      // Optimista: fuera del estado al instante (los rangos se recalculan solos
      // via useMemo sobre state.sessions). Tambien se quitan sus notas locales.
      setState((prev) => ({
        ...prev,
        sessions: prev.sessions.filter((s) => s.id !== id),
        exerciseNotes: prev.exerciseNotes.filter((n) => n.sessionId !== id),
      }));

      const userId = userIdRef.current;
      if (userId) {
        syncWrite("el borrado del entreno", async () => {
          // El ON DELETE CASCADE de workout_sets y exercise_notes arrastra las
          // filas hijas al borrar la sesion.
          const { error } = await supabase
            .from("workout_sessions")
            .delete()
            .eq("id", id)
            .eq("user_id", userId);
          if (error) throw error;
        });
      }
    },
    [supabase],
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
        syncWrite("los recordatorios", async () => {
          const { error } = await supabase
            .from("exercise_notes")
            .update({ acknowledged: true })
            .in(
              "id",
              affected.map((n) => n.id),
            );
          if (error) throw error;
        });
      }
    },
    [state.exerciseNotes, supabase],
  );

  const saveRoutine = useCallback(
    (days: RoutineDay[]) => {
      setState((prev) => ({ ...prev, routineDays: days }));

      const userId = userIdRef.current;
      if (!userId) return;
      syncWrite("la rutina", async () => {
        let routineId = routineIdRef.current;
        if (!routineId) {
          routineId = await ensureRoutineId(supabase, userId, "Mi rutina");
          routineIdRef.current = routineId;
        }
        await persistRoutineDays(supabase, routineId, days);
      });
    },
    [supabase],
  );

  const resetAll = useCallback(() => {
    // El username no se toca: sigue siendo la cuenta del mismo usuario.
    setState({
      ...DEFAULT_STATE,
      profile: { ...DEFAULT_PROFILE, username: state.profile.username },
    });

    const userId = userIdRef.current;
    const routineId = routineIdRef.current;
    if (!userId) return;
    syncWrite("el reinicio de datos", async () => {
      const { error: sessionsError } = await supabase
        .from("workout_sessions")
        .delete()
        .eq("user_id", userId);
      if (sessionsError) throw sessionsError;
      if (routineId) {
        const { error: daysError } = await supabase
          .from("routine_days")
          .delete()
          .eq("routine_id", routineId);
        if (daysError) throw daysError;
      }
      const { error: profileError } = await supabase
        .from("profiles")
        .update(toProfileRowPatch({ ...DEFAULT_PROFILE, ...DEFAULT_PREFERENCES }))
        .eq("user_id", userId);
      if (profileError) throw profileError;
    });
  }, [supabase, state.profile.username]);

  const muscleRanks = useMemo(
    () =>
      computeMuscleRanks(
        state.sessions,
        state.profile.bodyweightKg,
        state.profile.sex,
        muscleLookup,
      ),
    [state.sessions, state.profile.bodyweightKg, state.profile.sex],
  );

  const ranks = useMemo(() => aggregateToGroups(muscleRanks), [muscleRanks]);

  /** Rango medio (el que se ensena a los amigos junto al avatar). */
  const overallRank = useMemo(
    () =>
      averageRank(
        ranks.filter((r): r is Extract<ComputedRank, { ranked: true }> => r.ranked),
      ),
    [ranks],
  );

  // Cachea el rango medio en `profiles` para que la tira de amigos de la home
  // pueda pintar el punto de color de todos de una sola consulta, sin bajarse
  // el historial de cada uno. Solo escribe cuando cambia de verdad.
  //
  // NO pasa por syncWrite a proposito: el dato es puramente cosmetico (lo que
  // ven tus amigos junto a tu avatar) y se recalcula solo en la siguiente
  // sesion. Si falla, no hay nada que el usuario haya "perdido", asi que no
  // merece el toast de "cambios sin guardar" ni la cola de reintentos.
  const syncedRankRef = useRef<string | null>(null);
  useEffect(() => {
    if (!hydrated || !authenticated || !userIdRef.current) return;
    const key = overallRank
      ? `${overallRank.tier}:${overallRank.division}`
      : "none";
    if (syncedRankRef.current === key) return;
    syncedRankRef.current = key;

    supabase
      .from("profiles")
      .update({
        rank_tier: overallRank?.tier ?? null,
        rank_division: overallRank?.division ?? null,
        rank_updated_at: new Date().toISOString(),
      })
      .eq("user_id", userIdRef.current)
      .then(({ error }) => {
        if (error) console.warn("No se pudo cachear tu rango:", error.message);
      });
  }, [hydrated, authenticated, overallRank, supabase]);

  const todayDays = useMemo(() => {
    const weekday = new Date().getDay(); // 0=domingo..6=sabado
    return state.routineDays.filter((d) => d.weekdays.includes(weekday));
  }, [state.routineDays]);

  const todayDay = todayDays[0] ?? null;

  // Memoizado para que el objeto de contexto sea estable entre renders y no
  // fuerce un re-render de todos los consumidores de useRogue en cada render
  // del provider. Las acciones ya son estables (useCallback) y los derivados
  // (ranks/todayDays) van memoizados aparte.
  const value: RogueContextValue = useMemo(
    () => ({
      hydrated,
      authenticated,
      profile: state.profile,
      sessions: state.sessions,
      ranks,
      muscleRanks,
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
      resetAll,
    }),
    [
      hydrated,
      authenticated,
      state.profile,
      state.sessions,
      ranks,
      muscleRanks,
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
