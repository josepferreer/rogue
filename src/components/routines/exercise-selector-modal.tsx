"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Check, ChevronDown, Dumbbell, Info, Plus, Search, X } from "lucide-react";
import { ExerciseThumb } from "@/components/exercise/exercise-media";
import {
  ExerciseFilterBar,
  type ExerciseFilterValue,
} from "@/components/exercise/exercise-filter-bar";
import { filterExercises, getExerciseImages } from "@/lib/exercises/repo";
import { useCustomExercises } from "@/lib/store/custom-exercises-store";
import {
  DIFFICULTY_LABELS,
  EQUIPMENT_LABELS,
  type Exercise,
} from "@/lib/exercises/types";
import { cn } from "@/lib/utils";
import { useAppShellPortal } from "@/lib/use-app-shell-portal";
import { useEscapeToClose } from "@/lib/use-escape-to-close";
import { usePresence } from "@/lib/use-presence";

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (exercise: Exercise) => void;
  excludeIds?: string[];
};

// ── Tarjeta de ejercicio (misma estetica que la biblioteca) ─────────────────
function ExerciseItem({
  ex,
  already,
  onSelect,
}: {
  ex: Exercise;
  already: boolean;
  onSelect: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const images = getExerciseImages(ex);
  const thumb = images?.[0] ?? null;
  const img0 = images?.[0] ?? null;
  const img1 = images?.[1] ?? null;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-3xl border border-border bg-surface transition-colors",
        already && "opacity-50",
      )}
    >
      <div className="flex items-center gap-3 p-3">
        <ExerciseThumb src={thumb} alt={ex.nombre} />
        <button
          type="button"
          disabled={already}
          onClick={onSelect}
          className="min-w-0 flex-1 text-left"
        >
          <p className="truncate text-sm font-semibold">{ex.nombre}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {ex.grupo} · {EQUIPMENT_LABELS[ex.equipo]}
          </p>
          <p className="mt-1 font-mono text-2xs tracking-wide text-muted-foreground">
            {DIFFICULTY_LABELS[ex.dificultad].toUpperCase()}
          </p>
        </button>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label="Ver ejecucion"
            className={cn(
              "flex size-11 items-center justify-center rounded-full transition-colors",
              expanded
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {expanded ? (
              <ChevronDown className="size-4" />
            ) : (
              <Info className="size-4" />
            )}
          </button>
          {already ? (
            <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Check className="size-4" />
            </span>
          ) : (
            <button
              type="button"
              onClick={onSelect}
              aria-label={`Anadir ${ex.nombre}`}
              className="flex size-11 items-center justify-center rounded-full bg-accent text-accent-foreground transition-opacity hover:opacity-90"
            >
              <Plus className="size-4" />
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-3 pb-3 pt-3">
          <div className="relative mb-3 flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-2xl bg-muted">
            {img0 && img1 ? (
              <>
                <Image
                  src={img0}
                  alt={`${ex.nombre} inicio`}
                  fill
                  className="object-cover [animation:ex-frame_1.2s_step-end_infinite]"
                  unoptimized
                />
                <Image
                  src={img1}
                  alt={`${ex.nombre} fin`}
                  fill
                  className="object-cover opacity-0 [animation:ex-frame-alt_1.2s_step-end_infinite]"
                  unoptimized
                />
              </>
            ) : (
              <Dumbbell className="size-8 text-muted-foreground" />
            )}
          </div>
          {ex.instrucciones.length > 0 && (
            <ol className="flex flex-col gap-1.5">
              {ex.instrucciones.map((step, i) => (
                <li
                  key={i}
                  className="flex gap-2 text-xs text-muted-foreground"
                >
                  <span className="shrink-0 font-mono font-bold text-foreground">
                    {i + 1}.
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

// ── Modal principal ─────────────────────────────────────────────────────────
export function ExerciseSelectorModal({
  open,
  onClose,
  onSelect,
  excludeIds = [],
}: Props) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<ExerciseFilterValue>({});
  const inputRef = useRef<HTMLInputElement>(null);

  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setQuery("");
      setFilters({});
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    prevOpenRef.current = open;
  }, [open]);

  // Catalogo publico + ejercicios propios del usuario.
  const { all: allExercises } = useCustomExercises();
  const filtered = useMemo(
    () => filterExercises(allExercises, { query, ...filters }),
    [allExercises, query, filters],
  );

  const portalTarget = useAppShellPortal();
  const { mounted, state } = usePresence(open);
  useEscapeToClose(open, onClose);

  if (!mounted) return null;

  const content = (
    <div
      className="overlay-anim absolute inset-0 z-50 flex flex-col justify-end md:items-center md:justify-center"
      data-state={state}
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      {/* Mismo margen lateral (px-5) que las tarjetas de contenido. */}
      <div className="sheet-anim w-full md:max-w-lg" data-state={state}>
        <div
          className="flex max-h-[90dvh] flex-col rounded-t-3xl border border-border bg-background shadow-2xl md:max-h-[80dvh] md:rounded-3xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 pb-3 pt-4">
          <div className="flex items-center gap-3">
            <p className="font-semibold">Añadir ejercicio</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar selector"
            className="flex size-10 items-center justify-center rounded-full bg-surface hover:bg-muted"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-5 pb-3">
          <label className="flex items-center gap-2.5 rounded-2xl border border-border bg-surface px-4 py-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar ejercicio..."
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>

          <ExerciseFilterBar value={filters} onChange={setFilters} />

          <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
            {filtered.length} RESULTADO{filtered.length === 1 ? "" : "S"}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No hay ejercicios con esos filtros
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {filtered.map((ex) => (
                <ExerciseItem
                  key={ex.id}
                  ex={ex}
                  already={excludeIds.includes(ex.id)}
                  onSelect={() => {
                    onSelect(ex);
                    onClose();
                  }}
                />
              ))}
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );

  return portalTarget ? createPortal(content, portalTarget) : content;
}
