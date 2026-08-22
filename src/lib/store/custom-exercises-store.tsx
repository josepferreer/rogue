"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getAllExercisesSync,
  registerCustomExercises,
} from "@/lib/exercises/repo";
import {
  validateCustomExercise,
  type CustomExerciseInput,
} from "@/lib/exercises/custom";
import type { Exercise } from "@/lib/exercises/types";
import { createClient } from "@/lib/supabase/client";
import {
  deleteCustomExercise,
  insertCustomExercise,
  listCustomExercises,
} from "@/lib/supabase/custom-exercises";
import { getCurrentUserId } from "@/lib/supabase/exercise-interactions";

type CustomExercisesValue = {
  /** Solo los del usuario. */
  custom: Exercise[];
  /** Catalogo publico + personalizados, ya fusionados. */
  all: Exercise[];
  loading: boolean;
  create: (input: CustomExerciseInput) => Promise<Exercise>;
  remove: (id: string) => Promise<void>;
};

const Ctx = createContext<CustomExercisesValue | null>(null);

/**
 * Carga los ejercicios propios del usuario y los registra en la fachada
 * `repo.ts`.
 *
 * El registro en repo.ts no es opcional: `getExerciseMuscles` es SINCRONA
 * porque la llama el calculo de recuperacion muscular una vez por serie sobre
 * todo el historial. Si los personalizados vivieran solo en este contexto, el
 * mapa de calor los ignoraria y un entreno hecho con un ejercicio propio no
 * pintaria ningun musculo.
 */
export function CustomExercisesProvider({ children }: { children: ReactNode }) {
  const [custom, setCustom] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  // Cambia en cada registro para reconstruir `all` desde la fachada.
  const [version, setVersion] = useState(0);

  const apply = useCallback((list: Exercise[]) => {
    registerCustomExercises(list);
    setCustom(list);
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const supabase = createClient();
        const userId = await getCurrentUserId(supabase);
        if (!userId || !active) return;
        const list = await listCustomExercises(supabase);
        if (!active) return;
        apply(list);
      } catch {
        // Sin ejercicios propios la app funciona igual: el catalogo publico es
        // local. No merece la pena romper la biblioteca por esto.
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [apply]);

  const create = useCallback(
    async (input: CustomExerciseInput) => {
      const exercise = validateCustomExercise(input);
      const supabase = createClient();
      const userId = await getCurrentUserId(supabase);
      if (!userId) throw new Error("Necesitas iniciar sesion.");
      await insertCustomExercise(supabase, userId, exercise);
      apply([exercise, ...custom]);
      return exercise;
    },
    [apply, custom],
  );

  const remove = useCallback(
    async (id: string) => {
      const supabase = createClient();
      await deleteCustomExercise(supabase, id);
      apply(custom.filter((e) => e.id !== id));
    },
    [apply, custom],
  );

  const value = useMemo<CustomExercisesValue>(
    () => ({
      custom,
      // version fuerza el recalculo tras cada registro en la fachada.
      all: (() => {
        void version;
        return getAllExercisesSync();
      })(),
      loading,
      create,
      remove,
    }),
    [custom, version, loading, create, remove],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCustomExercises(): CustomExercisesValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error(
      "useCustomExercises debe usarse dentro de <CustomExercisesProvider>",
    );
  }
  return ctx;
}
