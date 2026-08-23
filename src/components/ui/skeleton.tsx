import { cn } from "@/lib/utils";

/**
 * Bloque de carga con la forma del contenido que va a llegar.
 *
 * Sustituye a los "Cargando…" sueltos: el texto centrado ocupa un alto que no
 * tiene nada que ver con el del contenido real, así que al resolver el fetch la
 * página pegaba un salto. Un esqueleto con la silueta correcta hace que el
 * contenido aparezca en su sitio, sin reflow.
 *
 * El barrido es un pseudo-elemento que se desplaza con `transform` (compositor,
 * sin repintado). `animate-pulse` de Tailwind anima `opacity` de todo el bloque
 * y en listas largas parpadea entero, que cansa la vista.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative overflow-hidden rounded-xl bg-muted",
        // El barrido se dibuja con ::after desde globals.css
        "after:absolute after:inset-0 after:animate-[skeleton-sweep_1.4s_ease-in-out_infinite]",
        "after:bg-gradient-to-r after:from-transparent after:via-white/45 after:to-transparent",
        "dark:after:via-white/10",
        className
      )}
      {...props}
    />
  );
}

/** Varias líneas de texto. `lines` incluye la última, que sale más corta. */
export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className={cn("h-3.5 rounded-xl", i === lines - 1 && "w-2/3")}
        />
      ))}
    </div>
  );
}
