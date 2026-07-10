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
import type {
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
const muscleLookup = (id: string): ExerciseMuscles | null =>
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
};

const DEFAULT_STATE: RogueState = {
  profile: DEFAULT_PROFILE,
  sessions: [],
  routineDays: DEMO_ROUTINE.days,
  preferences: DEFAULT_PREFERENCES,
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
  /** null cuando la rutina no tiene ningun dia (p.ej. se borraron todos). */
  todayDay: RoutineDay | null;
  preferences: Preferences;
  completeOnboarding: (data: Partial<Profile>) => void;
  updateProfile: (patch: Partial<Profile>) => void;
  updatePreferences: (patch: Partial<Preferences>) => void;
  /** Username propio, con validacion de formato y unicidad. Devuelve un
   *  mensaje de error si no se pudo guardar (p.ej. ya esta en uso). */
  updateUsername: (username: string) => Promise<{ error?: string }>;
  logSession: (dayLabel: string, sets: LoggedSet[]) => LogResult;
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

/** Historial de demo coherente con el peso corporal, para que los rangos no
 *  arranquen vacios tras el onboarding. */
/** Un unico entreno de demo (no vacio de entrada) SIN llegar a MIN_SESSIONS_TO_RANK
 *  (2): al estar todo en una sola sesion, ningun musculo queda "rankeado" con
 *  datos falsos - el usuario sube de rango solo con entrenos reales. */
function seedHistory(): WorkoutSession[] {
  const routineDay = DEMO_ROUTINE.days[0];
  const daysAgo = 2;
  const sets: LoggedSet[] = routineDay.exercises.map((ex) => ({
    exerciseId: ex.exerciseId,
    grupo: getExerciseInfo(ex.exerciseId).grupo,
    weightKg: Math.round(ex.suggestedKg * 0.9),
    reps: ex.reps,
  }));

  return [
    {
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : "seed-0",
      dateISO: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
      dayLabel: routineDay.label,
      sets,
    },
  ];
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
  return row;
}

type SupabaseClient = ReturnType<typeof createClient>;

async function fetchRoutine(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ routineId: string; days: RoutineDay[] } | null> {
  const { data: routineRow } = await supabase
    .from("routines")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (!routineRow) return null;

  const { data: dayRows } = await supabase
    .from("routine_days")
    .select("id, label, focus, position")
    .eq("routine_id", routineRow.id)
    .order("position");
  const days = dayRows ?? [];
  if (days.length === 0) return { routineId: routineRow.id, days: [] };

  const dayIds = days.map((d) => d.id);
  const { data: exRows } = await supabase
    .from("routine_exercises")
    .select("routine_day_id, exercise_id, position, sets, reps, rest_sec, suggested_kg")
    .in("routine_day_id", dayIds)
    .order("position");

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
      exercises: exByDay.get(d.id) ?? [],
    })),
  };
}

async function fetchSessions(
  supabase: SupabaseClient,
  userId: string,
): Promise<WorkoutSession[]> {
  const { data: sessionRows } = await supabase
    .from("workout_sessions")
    .select("id, day_label, date")
    .eq("user_id", userId)
    .order("date", { ascending: true });
  if (!sessionRows || sessionRows.length === 0) return [];

  const ids = sessionRows.map((s) => s.id);
  const { data: setRows } = await supabase
    .from("workout_sets")
    .select("session_id, exercise_id, categoria, weight_kg, reps, position")
    .in("session_id", ids)
    .order("position");

  const setsBySession = new Map<string, LoggedSet[]>();
  for (const s of setRows ?? []) {
    const list = setsBySession.get(s.session_id) ?? [];
    list.push({
      exerciseId: s.exercise_id,
      grupo: s.categoria as ExerciseCategory,
      weightKg: Number(s.weight_kg),
      reps: s.reps,
    });
    setsBySession.set(s.session_id, list);
  }

  return sessionRows.map((s) => ({
    id: s.id,
    dateISO: s.date,
    dayLabel: s.day_label,
    sets: setsBySession.get(s.id) ?? [],
  }));
}

/** Inserta dias + ejercicios de una rutina existente (borra los anteriores). */
async function persistRoutineDays(
  supabase: SupabaseClient,
  routineId: string,
  days: RoutineDay[],
) {
  await supabase.from("routine_days").delete().eq("routine_id", routineId);
  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const { data: dayRow } = await supabase
      .from("routine_days")
      .insert({ routine_id: routineId, position: i, label: day.label, focus: day.focus })
      .select("id")
      .single();
    if (!dayRow) continue;
    if (day.exercises.length === 0) continue;
    await supabase.from("routine_exercises").insert(
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
  }
}

async function insertWorkoutSession(
  supabase: SupabaseClient,
  userId: string,
  session: WorkoutSession,
) {
  await supabase.from("workout_sessions").insert({
    id: session.id,
    user_id: userId,
    day_label: session.dayLabel,
    date: session.dateISO,
  });
  if (session.sets.length === 0) return;
  await supabase.from("workout_sets").insert(
    session.sets.map((set, i) => ({
      session_id: session.id,
      exercise_id: set.exerciseId,
      categoria: set.grupo,
      weight_kg: set.weightKg,
      reps: set.reps,
      position: i,
    })),
  );
}

export function RogueProvider({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => createClient());
  const pathname = usePathname();

  const [state, setState] = useState<RogueState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
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

      const [{ data: profileRow }, routine, sessions] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
        fetchRoutine(supabase, user.id),
        fetchSessions(supabase, user.id),
      ]);
      // No marcar userIdRef hasta que sepamos que este efecto sigue vigente:
      // si se aborto (p.ej. un cambio de pathname a mitad de la carga), un
      // efecto posterior no debe pensar que este usuario "ya estaba cargado"
      // sin haber llegado a fijar authenticated/estado.
      if (!active) return;

      userIdRef.current = user.id;
      routineIdRef.current = routine?.routineId ?? null;

      setAuthenticated(true);
      setState({
        profile: profileRow ? rowToProfile(profileRow) : DEFAULT_PROFILE,
        preferences: profileRow ? rowToPreferences(profileRow) : DEFAULT_PREFERENCES,
        sessions,
        routineDays: routine && routine.days.length > 0 ? routine.days : DEMO_ROUTINE.days,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const completeOnboarding = useCallback(
    (data: Partial<Profile>) => {
      // Base en el perfil ya cargado (trae el username real de Supabase),
      // no en DEFAULT_PROFILE, para no borrarlo al completar el onboarding.
      const profile: Profile = { ...DEFAULT_PROFILE, ...state.profile, ...data, onboarded: true };
      const sessions = seedHistory();
      setState((prev) => ({ ...prev, profile, sessions, routineDays: DEMO_ROUTINE.days }));

      const userId = userIdRef.current;
      if (!userId) return;
      (async () => {
        await supabase
          .from("profiles")
          .update(toProfileRowPatch(profile))
          .eq("user_id", userId);

        let routineId = routineIdRef.current;
        if (!routineId) {
          const { data: routineRow } = await supabase
            .from("routines")
            .insert({ user_id: userId, name: DEMO_ROUTINE.name })
            .select("id")
            .single();
          routineId = routineRow?.id ?? null;
          routineIdRef.current = routineId;
        }
        if (routineId) await persistRoutineDays(supabase, routineId, DEMO_ROUTINE.days);

        for (const session of sessions) {
          await insertWorkoutSession(supabase, userId, session);
        }
      })();
    },
    [supabase, state.profile],
  );

  const updateProfile = useCallback(
    (patch: Partial<Profile>) => {
      setState((prev) => ({ ...prev, profile: { ...prev.profile, ...patch } }));
      const userId = userIdRef.current;
      if (!userId) return;
      supabase.from("profiles").update(toProfileRowPatch(patch)).eq("user_id", userId).then();
    },
    [supabase],
  );

  const updatePreferences = useCallback(
    (patch: Partial<Preferences>) => {
      setState((prev) => ({ ...prev, preferences: { ...prev.preferences, ...patch } }));
      const userId = userIdRef.current;
      if (!userId) return;
      supabase.from("profiles").update(toProfileRowPatch(patch)).eq("user_id", userId).then();
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
    (dayLabel: string, sets: LoggedSet[]): LogResult => {
      const session: WorkoutSession = {
        id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `s-${Date.now()}`,
        dateISO: new Date().toISOString(),
        dayLabel,
        sets,
      };

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

      setState((prev) => ({ ...prev, sessions: nextSessions }));

      const userId = userIdRef.current;
      if (userId) insertWorkoutSession(supabase, userId, session).catch(() => {});

      return { session, prs, rankChanges };
    },
    [state.sessions, state.profile.bodyweightKg, state.profile.sex, supabase],
  );

  const saveRoutine = useCallback(
    (days: RoutineDay[]) => {
      setState((prev) => ({ ...prev, routineDays: days }));

      const userId = userIdRef.current;
      if (!userId) return;
      (async () => {
        let routineId = routineIdRef.current;
        if (!routineId) {
          const { data: routineRow } = await supabase
            .from("routines")
            .insert({ user_id: userId, name: "Mi rutina" })
            .select("id")
            .single();
          routineId = routineRow?.id ?? null;
          routineIdRef.current = routineId;
        }
        if (routineId) await persistRoutineDays(supabase, routineId, days);
      })();
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
    (async () => {
      await supabase.from("workout_sessions").delete().eq("user_id", userId);
      if (routineId) await supabase.from("routine_days").delete().eq("routine_id", routineId);
      await supabase
        .from("profiles")
        .update(toProfileRowPatch({ ...DEFAULT_PROFILE, ...DEFAULT_PREFERENCES }))
        .eq("user_id", userId);
    })();
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

  const todayDay = useMemo(
    () =>
      state.routineDays.length > 0
        ? state.routineDays[state.sessions.length % state.routineDays.length]
        : null,
    [state.sessions.length, state.routineDays],
  );

  const value: RogueContextValue = {
    hydrated,
    authenticated,
    profile: state.profile,
    sessions: state.sessions,
    ranks,
    muscleRanks,
    routineDays: state.routineDays,
    todayDay,
    preferences: state.preferences,
    completeOnboarding,
    updateProfile,
    updatePreferences,
    updateUsername,
    logSession,
    saveRoutine,
    resetAll,
  };

  return <RogueContext.Provider value={value}>{children}</RogueContext.Provider>;
}

export function useRogue(): RogueContextValue {
  const ctx = useContext(RogueContext);
  if (!ctx) throw new Error("useRogue debe usarse dentro de RogueProvider");
  return ctx;
}
