import { type ButtonHTMLAttributes, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "lilac" | "blue" | "mint" | "neutral";

const VARIANTS: Record<Variant, string> = {
  lilac: "bg-card-lilac text-card-lilac-foreground",
  blue: "bg-card-blue text-card-blue-foreground",
  mint: "bg-card-mint text-card-mint-foreground",
  neutral: "bg-surface text-foreground border border-border",
};

const BASE = "rounded-3xl p-4";

/** `as="button"` cuando la tarjeta entera es pulsable: un <div onClick> no
 *  recibe foco, no responde a Enter/Espacio y los lectores de pantalla no lo
 *  anuncian como accionable. */
type PastelCardProps =
  | (HTMLAttributes<HTMLDivElement> & { variant?: Variant; as?: "div" })
  | (ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; as: "button" });

export function PastelCard(props: PastelCardProps) {
  const { as = "div", className, variant = "neutral", ...rest } = props;
  if (as === "button") {
    return (
      <button
        type="button"
        className={cn(BASE, "w-full text-left", VARIANTS[variant], className)}
        {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
      />
    );
  }
  return (
    <div
      className={cn(BASE, VARIANTS[variant], className)}
      {...(rest as HTMLAttributes<HTMLDivElement>)}
    />
  );
}
