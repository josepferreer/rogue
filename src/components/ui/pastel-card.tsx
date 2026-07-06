import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type PastelCardProps = HTMLAttributes<HTMLDivElement> & {
  variant?: "lilac" | "blue" | "mint" | "neutral";
};

const VARIANTS: Record<NonNullable<PastelCardProps["variant"]>, string> = {
  lilac: "bg-card-lilac text-card-lilac-foreground",
  blue: "bg-card-blue text-card-blue-foreground",
  mint: "bg-card-mint text-card-mint-foreground",
  neutral: "bg-surface text-foreground border border-border",
};

export function PastelCard({
  className,
  variant = "neutral",
  ...props
}: PastelCardProps) {
  return (
    <div
      className={cn("rounded-3xl p-4", VARIANTS[variant], className)}
      {...props}
    />
  );
}
