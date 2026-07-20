"use client";

import { use, useState } from "react";
import {
  Check,
  ChevronRight,
  Flame,
  LogOut,
  Minus,
  Plus,
  RotateCcw,
  Shield,
  Weight,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect } from "react";
import { RanksPanel } from "@/components/profile/ranks-panel";
import { PastelCard } from "@/components/ui/pastel-card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { signOut } from "@/lib/supabase/actions";
import {
  SwitchRow,
  UnitToggle,
} from "@/components/profile/preference-controls";
import { useRogue } from "@/lib/store/rogue-store";
import { formatWeight } from "@/lib/units";
import { getDisplayName, type Sex } from "@/lib/workout/types";
import { cn } from "@/lib/utils";

const GOALS = ["Hipertrofia", "Fuerza", "Perder grasa", "Mantenerme"];

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

function RowCard({
  rows,
  onRowClick,
}: {
  rows: { label: string; value: string }[];
  onRowClick?: () => void;
}) {
  return (
    <PastelCard variant="neutral" className="flex flex-col divide-y divide-border p-0">
      {rows.map((row) => (
        <button
          key={row.label}
          type="button"
          onClick={onRowClick}
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

function FieldStepper({
  label,
  value,
  unit,
  step,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  step: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <div className="flex items-center justify-between rounded-2xl border border-border bg-background px-4 py-3">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Restar ${label.toLowerCase()}`}
          onClick={() => onChange(clamp(value - step))}
          className="flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Minus className="size-4" />
        </button>
        <span className="flex w-[4.5rem] items-baseline justify-center gap-1">
          <span className="text-lg">{value}</span>
          <span className="text-sm text-muted-foreground">{unit}</span>
        </span>
        <button
          type="button"
          aria-label={`Sumar ${label.toLowerCase()}`}
          onClick={() => onChange(clamp(value + step))}
          className="flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  );
}

/** Hoja de edicion de nombre, usuario y cual de los dos se muestra. */
function EditIdentityModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { profile, preferences, updateProfile, updatePreferences, updateUsername } =
    useRogue();
  const [name, setName] = useState(profile.name);
  const [username, setUsername] = useState(profile.username);
  const [displaySource, setDisplaySource] = useState(preferences.displayNameSource);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(profile.name);
      setUsername(profile.username);
      setDisplaySource(preferences.displayNameSource);
      setError(null);
    }
  }, [open, profile.name, profile.username, preferences.displayNameSource]);

  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  useEffect(() => {
    setPortalTarget(document.getElementById("app-shell"));
  }, []);

  if (!open) return null;

  async function save() {
    setSaving(true);
    setError(null);

    if (username !== profile.username) {
      const result = await updateUsername(username);
      if (result.error) {
        setError(result.error);
        setSaving(false);
        return;
      }
    }
    if (name !== profile.name) updateProfile({ name });
    if (displaySource !== preferences.displayNameSource) {
      updatePreferences({ displayNameSource: displaySource });
    }
    setSaving(false);
    onClose();
  }

  const content = (
    <div
      className="absolute inset-0 z-[60] flex flex-col justify-end md:items-center md:justify-center"
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="flex w-full flex-col gap-4 rounded-t-3xl border border-border bg-surface p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:max-w-md md:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-base font-semibold">Nombre y usuario</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-10 items-center justify-center rounded-full hover:bg-muted"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-muted-foreground">Nombre</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tu nombre"
            className="rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-foreground"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-muted-foreground">Usuario</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="usuario"
            className="rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-foreground"
          />
        </div>

        <div>
          <p className="mb-2 text-xs text-muted-foreground">Mostrar en la app</p>
          <div className="flex gap-2">
            {(
              [
                { value: "name" as const, label: "Nombre" },
                { value: "username" as const, label: "Usuario" },
              ]
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDisplaySource(opt.value)}
                className={cn(
                  "flex-1 rounded-2xl border py-3 text-sm font-medium transition-colors",
                  displaySource === opt.value
                    ? "border-foreground bg-accent text-accent-foreground"
                    : "border-border bg-background text-muted-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <Button
          fullWidth
          onClick={save}
          disabled={saving || name.trim().length === 0 || username.trim().length === 0}
          className="py-3.5"
        >
          <Check className="size-4" />
          {saving ? "Guardando..." : "Guardar cambios"}
        </Button>
      </div>
    </div>
  );

  return portalTarget ? createPortal(content, portalTarget) : content;
}

/** Hoja de edicion de datos fisicos (peso, altura, sexo, objetivo). */
function EditPhysicalModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { profile, updateProfile } = useRogue();
  const [bodyweightKg, setBodyweightKg] = useState(profile.bodyweightKg);
  const [heightCm, setHeightCm] = useState(profile.heightCm);
  const [sex, setSex] = useState<Sex>(profile.sex);
  const [goal, setGoal] = useState(profile.goal);

  // Re-sincroniza el borrador al abrir con los valores actuales.
  useEffect(() => {
    if (open) {
      setBodyweightKg(profile.bodyweightKg);
      setHeightCm(profile.heightCm);
      setSex(profile.sex);
      setGoal(profile.goal);
    }
  }, [open, profile]);

  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  useEffect(() => {
    setPortalTarget(document.getElementById("app-shell"));
  }, []);

  if (!open) return null;

  const content = (
    <div
      className="absolute inset-0 z-[60] flex flex-col justify-end md:items-center md:justify-center"
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="flex w-full flex-col gap-4 rounded-t-3xl border border-border bg-surface p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:max-w-md md:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-base font-semibold">Datos fisicos</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-10 items-center justify-center rounded-full hover:bg-muted"
          >
            <X className="size-5" />
          </button>
        </div>

        <FieldStepper
          label="Peso corporal"
          value={bodyweightKg}
          unit="kg"
          step={1}
          min={30}
          max={300}
          onChange={setBodyweightKg}
        />
        <FieldStepper
          label="Altura"
          value={heightCm}
          unit="cm"
          step={1}
          min={100}
          max={250}
          onChange={setHeightCm}
        />

        <div className="flex gap-2">
          {(["hombre", "mujer"] as Sex[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSex(s)}
              className={cn(
                "flex-1 rounded-2xl border py-3 text-sm font-medium capitalize transition-colors",
                sex === s
                  ? "border-foreground bg-accent text-accent-foreground"
                  : "border-border bg-background text-muted-foreground",
              )}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {GOALS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGoal(g)}
              className={cn(
                "rounded-2xl border py-3 text-sm font-medium transition-colors",
                goal === g
                  ? "border-foreground bg-accent text-accent-foreground"
                  : "border-border bg-background text-muted-foreground",
              )}
            >
              {g}
            </button>
          ))}
        </div>

        <p className="text-[11px] text-muted-foreground">
          Cambiar el peso o el sexo recalcula tus rangos al momento.
        </p>

        <Button
          fullWidth
          onClick={() => {
            updateProfile({ bodyweightKg, heightCm, sex, goal });
            onClose();
          }}
          className="py-3.5"
        >
          <Check className="size-4" />
          Guardar cambios
        </Button>
      </div>
    </div>
  );

  return portalTarget ? createPortal(content, portalTarget) : content;
}

type ProfileTab = "general" | "rangos" | "ajustes";

const PROFILE_TABS: { id: ProfileTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "rangos", label: "Rangos" },
  { id: "ajustes", label: "Ajustes" },
];

function parseTab(value: string | undefined): ProfileTab {
  return value === "rangos" || value === "ajustes" ? value : "general";
}

export default function PerfilPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { profile, sessions, ranks, preferences, resetAll } = useRogue();
  const [editOpen, setEditOpen] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  // Pestana inicial via URL (?tab=rangos, usado por la home y el redirect de
  // /rangos). El toggle local se guarda como override ligado al valor de la
  // URL: si la URL cambia (p.ej. tocar "Perfil" en la barra estando en otra
  // pestana), el override deja de aplicar y manda la URL — sin efectos de
  // sincronizacion.
  const urlTab = parseTab(use(searchParams).tab);
  const [override, setOverride] = useState<{ base: ProfileTab; tab: ProfileTab } | null>(null);
  const tab = override && override.base === urlTab ? override.tab : urlTab;
  const setTab = (next: ProfileTab) => setOverride({ base: urlTab, tab: next });

  const displayName = getDisplayName(profile, preferences);
  const initials =
    displayName
      .split(" ")
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "R";
  const rankedCount = ranks.filter((r) => r.ranked).length;

  return (
    <div className="flex flex-col gap-6 pt-2 pb-4">
      <div className="flex flex-col items-center text-center gap-3 pt-2 pb-2">
        <span className="flex size-24 shrink-0 items-center justify-center rounded-full bg-accent text-3xl font-semibold text-accent-foreground shadow-sm">
          {initials}
        </span>
        <div className="flex flex-col items-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            {displayName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Objetivo: {profile.goal}
          </p>
        </div>
      </div>

      {/* Selector de pestana: mismo patron pill-toggle del resto de la app */}
      <div className="flex rounded-full bg-muted p-1">
        {PROFILE_TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "flex-1 rounded-full py-2 text-xs font-medium transition-colors",
              tab === id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "rangos" && <RanksPanel />}

      {tab === "general" && (
        <>
      <Section title="IDENTIDAD">
        <RowCard
          onRowClick={() => setIdentityOpen(true)}
          rows={[
            { label: "Nombre", value: profile.name || "—" },
            { label: "Usuario", value: `@${profile.username}` },
            {
              label: "Mostrar en la app",
              value: preferences.displayNameSource === "username" ? "Usuario" : "Nombre",
            },
          ]}
        />
      </Section>

      <div className="grid grid-cols-3 gap-3">
        <PastelCard variant="neutral" className="flex flex-col gap-1.5">
          <Flame className="size-4 text-muted-foreground" />
          <p className="font-mono text-lg font-medium leading-none">
            {sessions.length}
          </p>
          <p className="text-[11px] text-muted-foreground">entrenos</p>
        </PastelCard>
        <PastelCard variant="neutral" className="flex flex-col gap-1.5">
          <Shield className="size-4 text-muted-foreground" />
          <p className="font-mono text-lg font-medium leading-none">
            {rankedCount}
          </p>
          <p className="text-[11px] text-muted-foreground">rangos</p>
        </PastelCard>
        <PastelCard variant="neutral" className="flex flex-col gap-1.5">
          <Weight className="size-4 text-muted-foreground" />
          <p className="font-mono text-lg font-medium leading-none">
            {formatWeight(profile.bodyweightKg, preferences.unit)}
            <span className="text-xs font-normal">{preferences.unit}</span>
          </p>
          <p className="text-[11px] text-muted-foreground">peso</p>
        </PastelCard>
      </div>

      <Section title="DATOS FISICOS">
        <RowCard
          onRowClick={() => setEditOpen(true)}
          rows={[
            {
              label: "Peso corporal",
              value: `${formatWeight(profile.bodyweightKg, preferences.unit)} ${preferences.unit}`,
            },
            { label: "Altura", value: `${profile.heightCm} cm` },
            { label: "Sexo", value: profile.sex },
            { label: "Objetivo", value: profile.goal },
          ]}
        />
        <p className="px-1 text-[11px] text-muted-foreground">
          El peso corporal y el sexo se usan para calcular tus rangos de fuerza.
        </p>
      </Section>
        </>
      )}

      {tab === "ajustes" && (
        <>
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
            prefKey="notifyReminders"
          />
          <SwitchRow
            label="Temporizador de descanso"
            description="Vibracion y aviso al acabar el descanso"
            prefKey="notifyRestEnd"
          />
          <SwitchRow
            label="Resumen semanal"
            description="Progreso y rangos cada domingo"
            prefKey="notifyWeeklySummary"
          />
        </PastelCard>
      </Section>

      <div className="flex flex-col gap-2">
        <form action={signOut}>
          <Button type="submit" variant="secondary" fullWidth>
            <LogOut className="size-4" />
            Cerrar sesion
          </Button>
        </form>
        <Button variant="secondary" fullWidth onClick={() => setConfirmResetOpen(true)}>
          <RotateCcw className="size-4" />
          Reiniciar datos de demo
        </Button>
      </div>
        </>
      )}

      <EditPhysicalModal open={editOpen} onClose={() => setEditOpen(false)} />
      <EditIdentityModal open={identityOpen} onClose={() => setIdentityOpen(false)} />

      <ConfirmDialog
        open={confirmResetOpen}
        title="¿Reiniciar todos los datos?"
        description="Perderas tu perfil, historial de entrenos y rutina personalizada. Esta accion no se puede deshacer."
        confirmLabel="Reiniciar"
        onConfirm={() => {
          setConfirmResetOpen(false);
          resetAll();
        }}
        onCancel={() => setConfirmResetOpen(false)}
      />
    </div>
  );
}
