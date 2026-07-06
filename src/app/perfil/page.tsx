import {
  ChevronRight,
  Dumbbell,
  Flame,
  LogOut,
  Mail,
} from "lucide-react";
import { PastelCard } from "@/components/ui/pastel-card";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  SwitchRow,
  UnitToggle,
} from "@/components/profile/preference-controls";
import { mockProfile, quickStats } from "@/lib/mock-data";

export const metadata = { title: "Perfil · Rogue" };

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
        {title}
      </p>
      {children}
    </section>
  );
}

/** Tarjeta con filas (label + valor + chevron). */
function RowCard({
  rows,
}: {
  rows: { label: string; value: string }[];
}) {
  return (
    <PastelCard variant="neutral" className="flex flex-col divide-y divide-border p-0">
      {rows.map((row) => (
        <button
          key={row.label}
          type="button"
          className="flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
        >
          <span className="text-sm">{row.label}</span>
          <span className="flex items-center gap-1.5">
            <span className="font-mono text-sm text-muted-foreground">
              {row.value}
            </span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </span>
        </button>
      ))}
    </PastelCard>
  );
}

export default function PerfilPage() {
  const initials = mockProfile.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");

  return (
    <div className="flex flex-col gap-6 pt-2 pb-4">
      {/* Cabecera del perfil */}
      <div className="flex items-center gap-4">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-accent text-xl font-semibold text-accent-foreground">
          {initials}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {mockProfile.name}
          </h1>
          <p className="font-mono text-xs text-muted-foreground">
            {mockProfile.handle}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Objetivo: {mockProfile.objetivo} · Miembro desde{" "}
            {mockProfile.memberSince}
          </p>
        </div>
      </div>

      {/* Resumen rapido */}
      <div className="grid grid-cols-3 gap-3">
        <PastelCard variant="neutral" className="flex flex-col gap-1.5">
          <Flame className="size-4 text-muted-foreground" />
          <p className="font-mono text-lg font-medium leading-none">
            {quickStats.streakDays}
          </p>
          <p className="text-[11px] text-muted-foreground">dias de racha</p>
        </PastelCard>
        <PastelCard variant="neutral" className="flex flex-col gap-1.5">
          <Dumbbell className="size-4 text-muted-foreground" />
          <p className="font-mono text-lg font-medium leading-none">
            {mockProfile.totalSessions}
          </p>
          <p className="text-[11px] text-muted-foreground">sesiones</p>
        </PastelCard>
        <PastelCard variant="neutral" className="flex flex-col gap-1.5">
          <p className="font-mono text-lg font-medium leading-none">
            {mockProfile.bodyweightKg}
            <span className="text-xs font-normal">kg</span>
          </p>
          <p className="text-[11px] text-muted-foreground">peso corporal</p>
        </PastelCard>
      </div>

      {/* Datos fisicos: alimentan el calculo de rangos */}
      <Section title="DATOS FISICOS">
        <RowCard
          rows={[
            { label: "Peso corporal", value: `${mockProfile.bodyweightKg} kg` },
            { label: "Altura", value: `${mockProfile.heightCm} cm` },
            { label: "Sexo", value: mockProfile.sex },
            { label: "Objetivo", value: mockProfile.objetivo },
          ]}
        />
        <p className="px-1 text-[11px] text-muted-foreground">
          El peso corporal y el sexo se usan para calcular tus rangos de fuerza.
        </p>
      </Section>

      {/* Configuracion */}
      <Section title="APARIENCIA">
        <ThemeToggle />
      </Section>

      <Section title="UNIDADES">
        <UnitToggle />
      </Section>

      <Section title="NOTIFICACIONES">
        <PastelCard variant="neutral" className="flex flex-col divide-y divide-border p-0">
          <SwitchRow
            label="Recordatorios de entreno"
            description="Avisos de tu sesion del dia"
            defaultOn
          />
          <SwitchRow
            label="Temporizador de descanso"
            description="Sonido al acabar el descanso"
            defaultOn
          />
          <SwitchRow
            label="Resumen semanal"
            description="Progreso y rangos cada domingo"
          />
        </PastelCard>
      </Section>

      <Section title="CUENTA">
        <RowCard
          rows={[
            { label: "Correo", value: mockProfile.email },
            { label: "Equipo disponible", value: mockProfile.equipo },
          ]}
        />
      </Section>

      <button
        type="button"
        className="flex items-center justify-center gap-2 rounded-2xl border border-border py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <LogOut className="size-4" />
        Cerrar sesion
      </button>
    </div>
  );
}
