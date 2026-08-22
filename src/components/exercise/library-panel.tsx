"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, SearchX } from "lucide-react";
import { ExerciseCard } from "@/components/exercise/exercise-card";
import {
  ExerciseFilterBar,
  type ExerciseFilterValue,
} from "@/components/exercise/exercise-filter-bar";
import { filterExercises } from "@/lib/exercises/repo";
import { useCustomExercises } from "@/lib/store/custom-exercises-store";
import { CustomExerciseModal } from "@/components/exercise/custom-exercise-modal";
import { createClient } from "@/lib/supabase/client";
import {
  getCurrentUserId,
  listFavoriteIds,
} from "@/lib/supabase/exercise-interactions";

/** Biblioteca de ejercicios (buscador + filtros + grid). Vive como panel dentro
 *  de la pestana "Ejercicios" del hub de Entreno; las fichas siguen abriendo
 *  /biblioteca/[id] como rutas propias. */
export function LibraryPanel() {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<ExerciseFilterValue>({});
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  // Catalogo publico + ejercicios propios del usuario.
  const { all: allExercises } = useCustomExercises();

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createClient();
      const userId = await getCurrentUserId(supabase);
      if (!userId || !active) return;
      const favIds = await listFavoriteIds(supabase, userId);
      if (!active) return;
      setFavoriteIds(new Set(favIds));
    })();
    return () => {
      active = false;
    };
  }, []);

  const results = useMemo(
    () => filterExercises(allExercises, { query, ...filters }),
    [allExercises, query, filters],
  );

  // Favoritos primero, luego el resto. El sort es estable, asi que dentro de
  // cada grupo se mantiene el orden del dataset.
  const sorted = useMemo(() => {
    return [...results].sort((a, b) => {
      const aFav = favoriteIds.has(a.id);
      const bFav = favoriteIds.has(b.id);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      return 0;
    });
  }, [results, favoriteIds]);

  return (
    <div className="flex flex-col gap-4">
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

      <div className="flex items-center justify-between">
        <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
          {results.length} RESULTADO{results.length === 1 ? "" : "S"}
        </p>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium"
        >
          <Plus className="size-3.5" />
          Crear ejercicio
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-border bg-surface py-12 text-center">
          <SearchX className="size-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-semibold">Sin resultados</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Prueba con otro nombre o quita algun filtro.
            </p>
          </div>
          {query.trim().length >= 3 && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="rounded-full bg-foreground px-4 py-2 text-xs font-medium text-background"
            >
              Crear &quot;{query.trim()}&quot;
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 md:grid md:grid-cols-2 md:gap-3">
          {sorted.map((exercise) => (
            <ExerciseCard
              key={exercise.id}
              exercise={exercise}
              badge={favoriteIds.has(exercise.id) ? "favorito" : undefined}
            />
          ))}
        </div>
      )}

      <CustomExerciseModal
        open={creating}
        onClose={() => setCreating(false)}
        initialName={results.length === 0 ? query.trim() : ""}
      />
    </div>
  );
}
