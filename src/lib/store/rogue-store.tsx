"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { MuscleGroup } from "@/lib/ranks";
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
import type {
  LoggedSet,
  Profile,
  RoutineDay,
  WorkoutSession,
} from "@/lib/workout/types";

const STORAGE_KEY = "rogue.state.v1";

const DEFAULT_PROFILE: Profile = {
  onboarded: false,
  name: "",
  sex: "hombre",
  bodyweightKg: 75,
  heightCm: 175,
  goal: "Hipertrofia",
};

type ExerciseInfo = { nombre: string; grupo: MuscleGroup };
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

type RogueState = { profile: Profile; sessions: WorkoutSession[]; routineDays: RoutineDay[] };

type RogueContextValue = {
  hydrated: boolean;
  profile: Profile;
  sessions: WorkoutSession[];
  ranks: ComputedRank[];
  muscleRanks: ComputedMuscleRank[];
  routineDays: RoutineDay[];
  todayDay: RoutineDay;
  completeOnboarding: (data: Partial<Profile>) => void;
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
function seedHistory(): WorkoutSession[] {
  const sessions: WorkoutSession[] = [];
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  let counter = 0;

  DEMO_ROUTINE.days.forEach((routineDay, dayIndex) => {
    for (let rep = 0; rep < 3; rep++) {
      const daysAgo = 21 - (dayIndex + rep * 3);
      // El historial queda por debajo del peso sugerido: asi el primer entreno
      // con los valores por defecto ya es una marca personal y sube de rango.
      const progression = 0.88 + rep * 0.03;
      const sets: LoggedSet[] = routineDay.exercises.map((ex) => ({
        exerciseId: ex.exerciseId,
        grupo: getExerciseInfo(ex.exerciseId).grupo,
        weightKg: Math.round(ex.suggestedKg * progression),
        reps: ex.reps,
      }));
      sessions.push({
        id: `seed-${counter++}`,
        dateISO: new Date(now - daysAgo * day).toISOString(),
        dayLabel: routineDay.label,
        sets,
      });
    }
  });

  return sessions;
}

export function RogueProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<RogueState>({
    profile: DEFAULT_PROFILE,
    sessions: [],
    routineDays: DEMO_ROUTINE.days,
  });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as RogueState;
        setState({
          profile: { ...DEFAULT_PROFILE, ...parsed.profile },
          sessions: parsed.sessions ?? [],
          routineDays: parsed.routineDays ?? DEMO_ROUTINE.days,
        });
      }
    } catch {
      /* estado por defecto */
    }
    setHydrated(true);
  }, []);

  const persist = useCallback((next: RogueState) => {
    setState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* almacenamiento no disponible */
    }
  }, []);

  const completeOnboarding = useCallback(
    (data: Partial<Profile>) => {
      const profile: Profile = {
        ...DEFAULT_PROFILE,
        ...data,
        onboarded: true,
      };
      persist({ profile, sessions: seedHistory(), routineDays: state.routineDays });
    },
    [persist, state.routineDays],
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

      persist({ profile: state.profile, sessions: nextSessions, routineDays: state.routineDays });
      return { session, prs, rankChanges };
    },
    [persist, state],
  );

  const saveRoutine = useCallback(
    (days: RoutineDay[]) => {
      persist({ ...state, routineDays: days });
    },
    [persist, state],
  );

  const resetAll = useCallback(() => {
    persist({ profile: DEFAULT_PROFILE, sessions: [], routineDays: DEMO_ROUTINE.days });
  }, [persist]);

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

  const ranks = useMemo(
    () => aggregateToGroups(muscleRanks),
    [muscleRanks],
  );

  const todayDay = useMemo(
    () => state.routineDays[state.sessions.length % state.routineDays.length],
    [state.sessions.length, state.routineDays],
  );

  const value: RogueContextValue = {
    hydrated,
    profile: state.profile,
    sessions: state.sessions,
    ranks,
    muscleRanks,
    routineDays: state.routineDays,
    todayDay,
    completeOnboarding,
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
