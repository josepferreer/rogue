import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Calendar, Lightbulb, TrendingUp } from "lucide-react";
import { ExerciseMedia } from "@/components/exercise/exercise-media";
import { ExerciseTabs } from "@/components/exercise/exercise-tabs";
import { MuscleMap } from "@/components/exercise/muscle-map";
import { PastelCard } from "@/components/ui/pastel-card";
import { RankBadge } from "@/components/ui/rank-badge";
import { getMockExerciseStats } from "@/lib/exercises/mock-stats";
import {
  getAllExerciseIds,
  getExerciseById,
  getExerciseImages,
} from "@/lib/exercises/repo";
import {
  DIFFICULTY_LABELS,
  EQUIPMENT_LABELS,
} from "@/lib/exercises/types";
import { DIVISION_LABELS, getRankTier } from "@/lib/ranks";
import { mockUser, muscleRanks } from "@/lib/mock-data";

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
  const stats = getMockExerciseStats(exercise);
  const groupRank = muscleRanks.find((rank) => rank.muscle === exercise.grupo);

  return (
    <div className="flex flex-col gap-5 pt-2 pb-4">
      <div>
        <Link
          href="/biblioteca"
          className="flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Biblioteca
        </Link>
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
        stats={
          <div className="flex flex-col gap-3">
            {groupRank && (
              <PastelCard variant="lilac" className="flex items-center gap-4">
                <RankBadge
                  tier={groupRank.tier}
                  division={groupRank.division}
                  size="sm"
                />
                <div>
                  <p className="font-mono text-[10px] tracking-[0.2em] opacity-70">
                    TU RANGO EN {exercise.grupo.toUpperCase()}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold">
                    {getRankTier(groupRank.tier).label}{" "}
                    {DIVISION_LABELS[groupRank.division - 1]}
                  </p>
                </div>
              </PastelCard>
            )}
            <div className="grid grid-cols-2 gap-3">
              <PastelCard variant="neutral">
                <p className="text-xs text-muted-foreground">1RM estimado</p>
                <p className="mt-1 font-mono text-lg font-medium">
                  {stats.oneRmKg === null ? "—" : `${stats.oneRmKg} kg`}
                </p>
              </PastelCard>
              <PastelCard variant="neutral">
                <p className="text-xs text-muted-foreground">Mejor serie</p>
                <p className="mt-1 font-mono text-lg font-medium">
                  {stats.mejorSerie}
                </p>
              </PastelCard>
              <PastelCard variant="neutral">
                <p className="text-xs text-muted-foreground">Volumen 4 sem.</p>
                <p className="mt-1 font-mono text-lg font-medium">
                  {stats.volumen4SemanasKg === 0
                    ? "—"
                    : `${stats.volumen4SemanasKg.toLocaleString("es-ES")} kg`}
                </p>
              </PastelCard>
              <PastelCard variant="neutral">
                <p className="text-xs text-muted-foreground">Sesiones 30 dias</p>
                <p className="mt-1 font-mono text-lg font-medium">
                  {stats.sesiones30Dias}
                </p>
              </PastelCard>
            </div>
            <p className="text-center font-mono text-[10px] tracking-[0.2em] text-muted-foreground">
              DATOS DE DEMO · {mockUser.name.toUpperCase()}
            </p>
          </div>
        }
        historial={
          <div className="flex flex-col gap-2.5">
            {stats.historial.map((sesion, index) => (
              <PastelCard
                key={index}
                variant="neutral"
                className="flex items-center gap-3"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                  <Calendar className="size-4 text-muted-foreground" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold capitalize">
                    {sesion.fecha}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                    {sesion.series} x {sesion.reps}
                    {sesion.pesoKg > 0 ? ` @ ${sesion.pesoKg} kg` : ""}
                  </p>
                </div>
                {sesion.volumenKg > 0 && (
                  <p className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                    <TrendingUp className="size-3.5" />
                    {sesion.volumenKg.toLocaleString("es-ES")} kg
                  </p>
                )}
              </PastelCard>
            ))}
            <p className="mt-1 text-center font-mono text-[10px] tracking-[0.2em] text-muted-foreground">
              DATOS DE DEMO
            </p>
          </div>
        }
      />
    </div>
  );
}
