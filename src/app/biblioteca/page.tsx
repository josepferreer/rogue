"use client";

import { useMemo, useState } from "react";
import { Search, SearchX } from "lucide-react";
import { ExerciseCard } from "@/components/exercise/exercise-card";
import { DEMO_EXERCISES, filterExercises } from "@/lib/exercises/repo";
import {
  DIFFICULTY_LABELS,
  EQUIPMENT_LABELS,
  type DifficultyId,
  type EquipmentId,
} from "@/lib/exercises/types";
import { MUSCLE_GROUPS, type MuscleGroup } from "@/lib/ranks";
import { cn } from "@/lib/utils";

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "border border-border bg-surface text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

const EQUIPMENT_ORDER: EquipmentId[] = [
  "barra",
  "mancuernas",
  "maquina",
  "polea",
  "peso-corporal",
  "kettlebell",
  "barra-z",
  "otro",
];

const DIFFICULTIES: DifficultyId[] = [
  "principiante",
  "intermedio",
  "avanzado",
];

export default function BibliotecaPage() {
  const [query, setQuery] = useState("");
  const [grupo, setGrupo] = useState<MuscleGroup | undefined>();
  const [equipo, setEquipo] = useState<EquipmentId | undefined>();
  const [dificultad, setDificultad] = useState<DifficultyId | undefined>();

  const results = useMemo(
    () => filterExercises(DEMO_EXERCISES, { query, grupo, equipo, dificultad }),
    [query, grupo, equipo, dificultad],
  );

  return (
    <div className="flex flex-col gap-4 pt-2 pb-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ejercicios</h1>
        <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
          {DEMO_EXERCISES.length} EJERCICIOS EN LA BIBLIOTECA
        </p>
      </div>

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

      <div className="flex flex-col gap-2">
        <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-0.5">
          <Chip active={!grupo} onClick={() => setGrupo(undefined)}>
            Todos
          </Chip>
          {MUSCLE_GROUPS.map((g) => (
            <Chip
              key={g}
              active={grupo === g}
              onClick={() => setGrupo(grupo === g ? undefined : g)}
            >
              {g}
            </Chip>
          ))}
        </div>

        <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-0.5">
          {EQUIPMENT_ORDER.map((e) => (
            <Chip
              key={e}
              active={equipo === e}
              onClick={() => setEquipo(equipo === e ? undefined : e)}
            >
              {EQUIPMENT_LABELS[e]}
            </Chip>
          ))}
        </div>

        <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-0.5">
          {DIFFICULTIES.map((d) => (
            <Chip
              key={d}
              active={dificultad === d}
              onClick={() => setDificultad(dificultad === d ? undefined : d)}
            >
              {DIFFICULTY_LABELS[d]}
            </Chip>
          ))}
        </div>
      </div>

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
        <div className="flex flex-col gap-2.5">
          {results.map((exercise) => (
            <ExerciseCard key={exercise.id} exercise={exercise} />
          ))}
        </div>
      )}
    </div>
  );
}
