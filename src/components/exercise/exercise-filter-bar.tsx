"use client";

import {
  DIFFICULTY_LABELS,
  EQUIPMENT_LABELS,
  type DifficultyId,
  type EquipmentId,
} from "@/lib/exercises/types";
import { MUSCLE_GROUPS, type MuscleGroup } from "@/lib/ranks";
import { cn } from "@/lib/utils";

export type ExerciseFilterValue = {
  grupo?: MuscleGroup;
  equipo?: EquipmentId;
  dificultad?: DifficultyId;
};

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

export function Chip({
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

type Props = {
  value: ExerciseFilterValue;
  onChange: (value: ExerciseFilterValue) => void;
  /** Margenes negativos para sangrar el scroll hasta el borde del contenedor. */
  bleedClassName?: string;
};

/**
 * Barra de filtros de ejercicios (grupo muscular, equipo, dificultad).
 * Compartida por la biblioteca y por el modal de "Anadir ejercicio" para que
 * ambas superficies se vean identicas.
 */
export function ExerciseFilterBar({
  value,
  onChange,
  bleedClassName = "-mx-5 px-5",
}: Props) {
  const rowClass = cn(
    "no-scrollbar flex gap-2 overflow-x-auto pb-0.5",
    bleedClassName,
  );

  return (
    <div className="flex flex-col gap-2">
      <div className={rowClass}>
        <Chip
          active={!value.grupo}
          onClick={() => onChange({ ...value, grupo: undefined })}
        >
          Todos
        </Chip>
        {MUSCLE_GROUPS.map((g) => (
          <Chip
            key={g}
            active={value.grupo === g}
            onClick={() =>
              onChange({ ...value, grupo: value.grupo === g ? undefined : g })
            }
          >
            {g}
          </Chip>
        ))}
      </div>

      <div className={rowClass}>
        {EQUIPMENT_ORDER.map((e) => (
          <Chip
            key={e}
            active={value.equipo === e}
            onClick={() =>
              onChange({ ...value, equipo: value.equipo === e ? undefined : e })
            }
          >
            {EQUIPMENT_LABELS[e]}
          </Chip>
        ))}
      </div>

      <div className={rowClass}>
        {DIFFICULTIES.map((d) => (
          <Chip
            key={d}
            active={value.dificultad === d}
            onClick={() =>
              onChange({
                ...value,
                dificultad: value.dificultad === d ? undefined : d,
              })
            }
          >
            {DIFFICULTY_LABELS[d]}
          </Chip>
        ))}
      </div>
    </div>
  );
}
