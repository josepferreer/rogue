export type RankId =
  | "bronce"
  | "hierro"
  | "plata"
  | "oro"
  | "platino"
  | "diamante"
  | "maestro"
  | "legendario";

export type RankTier = {
  id: RankId;
  label: string;
  order: number;
};

export const RANK_TIERS: RankTier[] = [
  { id: "bronce", label: "Bronce", order: 1 },
  { id: "hierro", label: "Hierro", order: 2 },
  { id: "plata", label: "Plata", order: 3 },
  { id: "oro", label: "Oro", order: 4 },
  { id: "platino", label: "Platino", order: 5 },
  { id: "diamante", label: "Diamante", order: 6 },
  { id: "maestro", label: "Maestro", order: 7 },
  { id: "legendario", label: "Legendario", order: 8 },
];

export const DIVISION_LABELS = ["III", "II", "I"] as const;

export const RANK_STYLES: Record<
  RankId,
  { bg: string; text: string; ring: string; bar: string }
> = {
  bronce: {
    bg: "bg-rank-bronce/15",
    text: "text-rank-bronce",
    ring: "ring-rank-bronce/25",
    bar: "bg-rank-bronce",
  },
  hierro: {
    bg: "bg-rank-hierro/15",
    text: "text-rank-hierro",
    ring: "ring-rank-hierro/25",
    bar: "bg-rank-hierro",
  },
  plata: {
    bg: "bg-rank-plata/15",
    text: "text-rank-plata",
    ring: "ring-rank-plata/25",
    bar: "bg-rank-plata",
  },
  oro: {
    bg: "bg-rank-oro/15",
    text: "text-rank-oro",
    ring: "ring-rank-oro/25",
    bar: "bg-rank-oro",
  },
  platino: {
    bg: "bg-rank-platino/15",
    text: "text-rank-platino",
    ring: "ring-rank-platino/25",
    bar: "bg-rank-platino",
  },
  diamante: {
    bg: "bg-rank-diamante/15",
    text: "text-rank-diamante",
    ring: "ring-rank-diamante/25",
    bar: "bg-rank-diamante",
  },
  maestro: {
    bg: "bg-rank-maestro/15",
    text: "text-rank-maestro",
    ring: "ring-rank-maestro/25",
    bar: "bg-rank-maestro",
  },
  legendario: {
    bg: "bg-rank-legendario/15",
    text: "text-rank-legendario",
    ring: "ring-rank-legendario/25",
    bar: "bg-rank-legendario",
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

export type MuscleRank = {
  muscle: MuscleGroup;
  tier: RankId;
  division: 1 | 2 | 3;
  progress: number;
};
