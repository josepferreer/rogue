import { Dumbbell } from "lucide-react";
import { PastelCard } from "@/components/ui/pastel-card";

export default function BibliotecaPage() {
  return (
    <div className="flex flex-col gap-5 pt-2 pb-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ejercicios</h1>
        <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
          BIBLIOTECA COMPLETA
        </p>
      </div>

      <PastelCard
        variant="neutral"
        className="flex flex-col items-center gap-3 py-10 text-center"
      >
        <Dumbbell className="size-8 text-muted-foreground" />
        <div>
          <p className="text-sm font-semibold">Biblioteca de ejercicios</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Proximamente: filtros por musculo y equipo, con animacion de
            ejecucion y mapa muscular por ejercicio.
          </p>
        </div>
      </PastelCard>
    </div>
  );
}
