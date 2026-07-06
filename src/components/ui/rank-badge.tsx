import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DIVISION_LABELS,
  RANK_STYLES,
  getRankTier,
  type RankId,
} from "@/lib/ranks";

type RankBadgeProps = {
  tier: RankId;
  division: 1 | 2 | 3;
  size?: "sm" | "md";
  className?: string;
};

export function RankBadge({
  tier,
  division,
  size = "md",
  className,
}: RankBadgeProps) {
  const style = RANK_STYLES[tier];
  const label = getRankTier(tier).label;
  const isLarge = size === "md";

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-2xl ring-1",
        style.bg,
        style.ring,
        isLarge ? "size-14" : "size-10",
        className
      )}
    >
      <Shield
        className={cn(style.text, isLarge ? "size-7" : "size-5")}
        strokeWidth={1.75}
        fill="currentColor"
        fillOpacity={0.18}
      />
      <span className="sr-only">
        {label} {DIVISION_LABELS[division - 1]}
      </span>
    </div>
  );
}
