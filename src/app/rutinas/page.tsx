import { CalendarDays } from "lucide-react";
import { PastelCard } from "@/components/ui/pastel-card";

export default function RutinasPage() {
  return (
    <div className="flex flex-col gap-5 pt-2 pb-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Rutinas</h1>
        <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
          TU PLAN SEMANAL
        </p>
      </div>

      <PastelCard
        variant="neutral"
        className="flex flex-col items-center gap-3 py-10 text-center"
      >
        <CalendarDays className="size-8 text-muted-foreground" />
        <div>
          <p className="text-sm font-semibold">Constructor de rutinas</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Proximamente: crea tu plan semanal y asigna ejercicios, series y
            descansos.
          </p>
        </div>
      </PastelCard>
    </div>
  );
}
