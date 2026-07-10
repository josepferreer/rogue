"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, SearchX } from "lucide-react";
import { ExerciseCard } from "@/components/exercise/exercise-card";
import { ExerciseMiniCard } from "@/components/exercise/exercise-mini-card";
import {
  ExerciseFilterBar,
  type ExerciseFilterValue,
} from "@/components/exercise/exercise-filter-bar";
import { DEMO_EXERCISES, filterExercises } from "@/lib/exercises/repo";
import type { Exercise } from "@/lib/exercises/types";
import { createClient } from "@/lib/supabase/client";
import {
  getCurrentUserId,
  listFavoriteIds,
  listRecentIds,
} from "@/lib/supabase/exercise-interactions";

const EXERCISE_BY_ID = new Map(DEMO_EXERCISES.map((e) => [e.id, e]));

function idsToExercises(ids: string[]): Exercise[] {
  return ids.map((id) => EXERCISE_BY_ID.get(id)).filter((e): e is Exercise => !!e);
}

/** Tira horizontal de tarjetas compactas ("favoritos"/"recientes"). */
function ExerciseStrip({ title, exercises }: { title: string; exercises: Exercise[] }) {
  if (exercises.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
        {title.toUpperCase()}
      </p>
      <div className="no-scrollbar -mx-5 flex gap-2.5 overflow-x-auto px-5">
        {exercises.map((exercise) => (
          <ExerciseMiniCard key={exercise.id} exercise={exercise} />
        ))}
      </div>
    </div>
  );
}

export default function BibliotecaPage() {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<ExerciseFilterValue>({});
  const [favorites, setFavorites] = useState<Exercise[]>([]);
  const [recent, setRecent] = useState<Exercise[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createClient();
      const userId = await getCurrentUserId(supabase);
      if (!userId || !active) return;
      const [favIds, recentIds] = await Promise.all([
        listFavoriteIds(supabase, userId),
        listRecentIds(supabase, userId),
      ]);
      if (!active) return;
      setFavorites(idsToExercises(favIds));
      setRecent(idsToExercises(recentIds));
    })();
    return () => {
      active = false;
    };
  }, []);

  const results = useMemo(
    () => filterExercises(DEMO_EXERCISES, { query, ...filters }),
    [query, filters],
  );

  const showStrips = !query && !filters.grupo && !filters.equipo && !filters.dificultad;

  return (
    <div className="flex flex-col gap-4 pt-2 pb-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ejercicios</h1>
        <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
          {DEMO_EXERCISES.length} EJERCICIOS EN LA BIBLIOTECA
        </p>
      </div>

      {showStrips && (
        <>
          <ExerciseStrip title="Favoritos" exercises={favorites} />
          <ExerciseStrip title="Recientes" exercises={recent} />
        </>
      )}

      <label className="flex items-center gap-2.5 rounded-2xl border border-border bg-surface px-4 py-3">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar ejercicio..."
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </label>

      <ExerciseFilterBar value={filters} onChange={setFilters} />

      <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
        {results.length} RESULTADO{results.length === 1 ? "" : "S"}
      </p>

      {results.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-border bg-surface py-12 text-center">
          <SearchX className="size-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-semibold">Sin resultados</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Prueba con otro nombre o quita algun filtro.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 md:grid md:grid-cols-2 md:gap-3">
          {results.map((exercise) => (
            <ExerciseCard key={exercise.id} exercise={exercise} />
          ))}
        </div>
      )}
    </div>
  );
}
