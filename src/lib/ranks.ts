export type RankId = "bronce" | "plata" | "oro" | "esmeralda" | "maestro";

export type RankTier = {
  id: RankId;
  label: string;
  order: number;
  divisions: number;
};

// Los ids se mantienen (bronce/plata/...) por compatibilidad con colores,
// SVGs y datos guardados; solo cambian las etiquetas a una jerarquia de nivel.
export const RANK_TIERS: RankTier[] = [
  { id: "bronce", label: "Principiante", order: 1, divisions: 3 },
  { id: "plata", label: "Intermedio", order: 2, divisions: 3 },
  { id: "oro", label: "Avanzado", order: 3, divisions: 3 },
  { id: "esmeralda", label: "Experto", order: 4, divisions: 4 },
  { id: "maestro", label: "Maestro", order: 5, divisions: 3 },
];

export function getDivisionLabel(tier: RankTier, division: number): string {
  const labels = ["I", "II", "III", "IV"];
  return labels[division - 1] || "I";
}

export const RANK_STYLES: Record<
  RankId,
  { bg: string; text: string; ring: string; bar: string; colorFamily: string }
> = {
  bronce: {
    bg: "bg-rank-bronce/15",
    text: "text-rank-bronce",
    ring: "ring-rank-bronce/25",
    bar: "bg-rank-bronce",
    colorFamily: "bronze",
  },
  plata: {
    bg: "bg-rank-plata/15",
    text: "text-rank-plata",
    ring: "ring-rank-plata/25",
    bar: "bg-rank-plata",
    colorFamily: "blue",
  },
  oro: {
    bg: "bg-rank-oro/15",
    text: "text-rank-oro",
    ring: "ring-rank-oro/25",
    bar: "bg-rank-oro",
    colorFamily: "gold",
  },
  esmeralda: {
    bg: "bg-rank-esmeralda/15",
    text: "text-rank-esmeralda",
    ring: "ring-rank-esmeralda/25",
    bar: "bg-rank-esmeralda",
    colorFamily: "green",
  },
  maestro: {
    bg: "bg-rank-maestro/15",
    text: "text-rank-maestro",
    ring: "ring-rank-maestro/25",
    bar: "bg-rank-maestro",
    colorFamily: "red",
  },
};

export function getRankTier(id: RankId): RankTier {
  return RANK_TIERS.find((tier) => tier.id === id)!;
}

export function getNextRankTier(id: RankId): RankTier | null {
  const current = getRankTier(id);
  return RANK_TIERS.find((tier) => tier.order === current.order + 1) ?? null;
}

export const MUSCLE_GROUPS = [
  "Pecho",
  "Espalda",
  "Hombros",
  "Biceps",
  "Triceps",
  "Piernas",
  "Gluteos",
  "Core",
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
