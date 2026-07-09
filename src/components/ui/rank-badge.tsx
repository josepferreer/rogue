import { cn } from "@/lib/utils";
import {
  getRankTier,
  getDivisionLabel,
  RANK_STYLES,
  type RankId,
} from "@/lib/ranks";

type RankBadgeProps = {
  tier: RankId;
  division: number;
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
  const rankTier = getRankTier(tier);
  const label = rankTier.label;
  const isLarge = size === "md";
  const divLabel = getDivisionLabel(rankTier, division);
  const iconPath = `/ranks/${style.colorFamily}-${division}.svg`;

  return (
    <div
      className={cn(
        "relative flex items-center justify-center",
        isLarge ? "size-20" : "size-14",
        className
      )}
    >
      <img
        src={iconPath}
        alt={`${label} icon`}
        className="size-full object-contain"
      />
      <span className="sr-only">
        {label} {divLabel}
      </span>
    </div>
  );
}
