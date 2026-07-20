import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lightbulb } from "lucide-react";
import { ExerciseMedia } from "@/components/exercise/exercise-media";
import { FavoriteButton } from "@/components/exercise/favorite-button";
import { ExerciseTabs } from "@/components/exercise/exercise-tabs";
import { MuscleMap } from "@/components/exercise/muscle-map";
import {
  ExerciseHistoryPanel,
  ExerciseStatsPanel,
} from "@/components/exercise/exercise-progress";
import { PastelCard } from "@/components/ui/pastel-card";
import {
  getAllExerciseIds,
  getExerciseById,
  getExerciseImages,
} from "@/lib/exercises/repo";
import {
  DIFFICULTY_LABELS,
  EQUIPMENT_LABELS,
} from "@/lib/exercises/types";

type PageProps = { params: Promise<{ id: string }> };

export async function generateStaticParams() {
  const ids = await getAllExerciseIds();
  return ids.map((id) => ({ id }));
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const exercise = await getExerciseById(id);
  return { title: exercise ? `${exercise.nombre} · Rogue` : "Ejercicio" };
}

export default async function ExercisePage({ params }: PageProps) {
  const { id } = await params;
  const exercise = await getExerciseById(id);
  if (!exercise) notFound();

  const images = getExerciseImages(exercise);

  return (
    <div className="flex flex-col gap-5 pt-2 pb-4">
      <div>
        <div className="flex items-center justify-between">
          <Link
            href="/app/rutinas?tab=ejercicios"
            aria-label="Volver a ejercicios"
            className="flex size-10 items-center justify-center rounded-full bg-surface hover:bg-muted"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <FavoriteButton exerciseId={exercise.id} />
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {exercise.nombre}
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

      <ExerciseMedia images={images} alt={`Ejecucion de ${exercise.nombre}`} />

      <PastelCard variant="neutral" className="flex flex-col gap-1 py-5">
        <p className="text-center font-mono text-xs tracking-[0.2em] text-muted-foreground">
          MUSCULOS IMPLICADOS
        </p>
        <MuscleMap
          primary={exercise.musculosPrimarios}
          secondary={exercise.musculosSecundarios}
          className="mt-2"
        />
      </PastelCard>

      <ExerciseTabs
        instrucciones={
          <div className="flex flex-col gap-4">
            <ol className="flex flex-col gap-3">
              {exercise.instrucciones.map((paso, index) => (
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
            {exercise.consejos.length > 0 && (
              <PastelCard variant="mint" className="flex flex-col gap-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold">
                  <Lightbulb className="size-3.5" />
                  Consejos
                </p>
                <ul className="flex flex-col gap-1.5">
                  {exercise.consejos.map((consejo, index) => (
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
