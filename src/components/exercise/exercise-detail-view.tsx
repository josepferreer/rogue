"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Lightbulb, SlidersHorizontal } from "lucide-react";
import { ExerciseMedia } from "@/components/exercise/exercise-media";
import { FavoriteButton } from "@/components/exercise/favorite-button";
import { ExerciseTabs } from "@/components/exercise/exercise-tabs";
import { MuscleMap } from "@/components/exercise/muscle-map";
import {
  ExerciseHistoryPanel,
  ExerciseStatsPanel,
} from "@/components/exercise/exercise-progress";
import { PastelCard } from "@/components/ui/pastel-card";
import { getExerciseImages } from "@/lib/exercises/repo";
import {
  DIFFICULTY_LABELS,
  EQUIPMENT_LABELS,
  type Exercise,
  type ExerciseVariant,
} from "@/lib/exercises/types";
import { cn } from "@/lib/utils";

export function ExerciseDetailView({ exercise }: { exercise: Exercise }) {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    exercise.variantes && exercise.variantes.length > 0 ? exercise.variantes[0].id : null
  );

  const activeVariant: ExerciseVariant | null =
    exercise.variantes?.find((v) => v.id === selectedVariantId) ?? null;

  // Si hay variante activa, usamos sus imágenes e instrucciones; de lo contrario, las del ejercicio base
  const images = activeVariant
    ? getExerciseImages({ fuenteId: activeVariant.fuenteId })
    : getExerciseImages(exercise);

  const instrucciones = activeVariant?.instrucciones?.length
    ? activeVariant.instrucciones
    : exercise.instrucciones;

  const consejos = activeVariant?.consejos?.length
    ? activeVariant.consejos
    : exercise.consejos;

  return (
    <div className="flex flex-col gap-5 pt-2 pb-4">
      <div>
        <div className="flex items-center justify-between">
          <Link
            href="/app/rutinas?tab=ejercicios"
            aria-label="Volver a ejercicios"
            className="flex size-10 items-center justify-center rounded-full bg-surface hover:bg-muted transition-colors"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <FavoriteButton exerciseId={exercise.id} />
        </div>

        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {activeVariant ? `${exercise.nombre} (${activeVariant.nombre})` : exercise.nombre}
        </h1>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {[
            exercise.grupo,
            EQUIPMENT_LABELS[exercise.equipo],
            DIFFICULTY_LABELS[exercise.dificultad],
            exercise.mecanica === "compuesto" ? "Compuesto" : "Aislamiento",
          ].map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Selector de Variantes / Agarres */}
      {exercise.variantes && exercise.variantes.length > 0 && (
        <div className="flex flex-col gap-2 rounded-3xl border border-border bg-surface p-3 shadow-sm">
          <div className="flex items-center gap-1.5 px-1 font-mono text-xs font-medium text-muted-foreground">
            <SlidersHorizontal className="size-3.5" />
            <span>VARIANTES DE AGARRE DISPONIBLES:</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {exercise.variantes.map((variant) => {
              const isSelected = variant.id === selectedVariantId;
              return (
                <button
                  key={variant.id}
                  type="button"
                  onClick={() => setSelectedVariantId(variant.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all",
                    isSelected
                      ? "bg-foreground text-background shadow-sm"
                      : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  )}
                >
                  <span>{variant.nombre}</span>
                  {variant.agarre && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 font-mono text-2xs",
                        isSelected
                          ? "bg-background/20 text-background"
                          : "bg-black/5 dark:bg-white/10 text-muted-foreground"
                      )}
                    >
                      {variant.agarre}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Animación interactiva en 2 frames del agarre seleccionado */}
      <ExerciseMedia
        key={activeVariant ? activeVariant.fuenteId : exercise.fuenteId}
        images={images}
        alt={`Ejecución de ${activeVariant ? activeVariant.nombre : exercise.nombre}`}
      />

      <PastelCard variant="neutral" className="flex flex-col gap-1 py-5">
        <p className="text-center font-mono text-xs tracking-[0.2em] text-muted-foreground">
          MÚSCULOS IMPLICADOS
        </p>
        <MuscleMap
          primary={activeVariant?.musculosPrimarios ?? exercise.musculosPrimarios}
          secondary={activeVariant?.musculosSecundarios ?? exercise.musculosSecundarios}
          className="mt-2"
        />
      </PastelCard>

      <ExerciseTabs
        instrucciones={
          <div className="flex flex-col gap-4">
            <ol className="flex flex-col gap-3">
              {instrucciones.map((paso, index) => (
                <li key={index} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/10 font-mono text-xs font-medium text-accent">
                    {index + 1}
                  </span>
                  <p className="text-sm leading-relaxed text-foreground/90">
                    {paso}
                  </p>
                </li>
              ))}
            </ol>
            {consejos && consejos.length > 0 && (
              <PastelCard variant="mint" className="flex flex-col gap-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold">
                  <Lightbulb className="size-3.5" />
                  Consejos
                </p>
                <ul className="flex flex-col gap-1.5">
                  {consejos.map((consejo, index) => (
                    <li key={index} className="text-xs leading-relaxed opacity-90">
                      {consejo}
                    </li>
                  ))}
                </ul>
              </PastelCard>
            )}
          </div>
        }
        stats={<ExerciseStatsPanel exercise={exercise} />}
        historial={<ExerciseHistoryPanel exercise={exercise} />}
      />
    </div>
  );
}
