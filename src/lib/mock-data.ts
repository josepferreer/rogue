import type { MuscleRank } from "./ranks";

export const mockUser = {
  name: "Marc",
};

export const todaySession = {
  dayLabel: "Hoy - Empuje",
  title: "Pecho, Hombro y Triceps",
  exerciseCount: 6,
  estMinutes: 52,
};

export const quickStats = {
  streakDays: 12,
  weeklyVolumeKg: 8420,
  sessionsThisWeek: 4,
  sessionsGoal: 5,
};

export const muscleRanks: MuscleRank[] = [
  { muscle: "Pecho", tier: "oro", division: 2, progress: 64 },
  { muscle: "Espalda", tier: "oro", division: 3, progress: 20 },
  { muscle: "Hombros", tier: "plata", division: 2, progress: 45 },
  { muscle: "Biceps", tier: "diamante", division: 1, progress: 80 },
  { muscle: "Triceps", tier: "platino", division: 3, progress: 10 },
  { muscle: "Piernas", tier: "legendario", division: 2, progress: 55 },
  { muscle: "Gluteos", tier: "maestro", division: 1, progress: 33 },
  { muscle: "Core", tier: "hierro", division: 3, progress: 90 },
];

export const exerciseSuggestions = [
  {
    muscle: "PECHO",
    variant: "lilac" as const,
    title: "Press de Banca con Barra",
    primaryMeta: "4 series x 10 reps",
    secondaryMeta: "Banco plano - Dificultad media",
  },
  {
    muscle: "ESPALDA",
    variant: "blue" as const,
    title: "Dominadas Lastradas",
    primaryMeta: "4 series x 8 reps",
    secondaryMeta: "Barra de dominadas - Dificultad alta",
  },
];
