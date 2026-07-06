import { PastelCard } from "@/components/ui/pastel-card";
import { ThemeToggle } from "@/components/theme-toggle";
import { mockUser } from "@/lib/mock-data";

const ACCOUNT_ROWS = [
  { label: "Nombre", value: mockUser.name },
  { label: "Objetivo", value: "Ganar fuerza" },
  { label: "Equipo disponible", value: "Gimnasio completo" },
  { label: "Unidades", value: "kg" },
];

export default function AjustesPage() {
  return (
    <div className="flex flex-col gap-6 pt-2 pb-4">
      <h1 className="text-2xl font-semibold tracking-tight">Ajustes</h1>

      <section className="flex flex-col gap-2">
        <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
          APARIENCIA
        </p>
        <ThemeToggle />
      </section>

      <section className="flex flex-col gap-2">
        <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
          CUENTA
        </p>
        <PastelCard variant="neutral" className="flex flex-col divide-y divide-border p-0">
          {ACCOUNT_ROWS.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between px-4 py-3"
            >
              <span className="text-sm">{row.label}</span>
              <span className="font-mono text-sm text-muted-foreground">
                {row.value}
              </span>
            </div>
          ))}
        </PastelCard>
      </section>
    </div>
  );
}
