"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Minus, Plus } from "lucide-react";
import { useRogue } from "@/lib/store/rogue-store";
import { createClient } from "@/lib/supabase/client";
import { getCurrentUserId } from "@/lib/supabase/exercise-interactions";
import type { Sex } from "@/lib/workout/types";
import { cn } from "@/lib/utils";

const GOALS = ["Hipertrofia", "Fuerza", "Perder grasa", "Mantenerme"];

function Stepper({
  value,
  onChange,
  unit,
  step,
  min,
  max,
  fallback,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  unit: string;
  step: number;
  min: number;
  max: number;
  fallback: number;
  placeholder: string;
}) {
  const clamp = (n: number) => String(Math.min(max, Math.max(min, n)));
  const base = () => (value === "" ? fallback : Number(value) || fallback);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="Restar"
        onClick={() => onChange(clamp(base() - step))}
        className="flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:bg-muted"
      >
        <Minus className="size-4" />
      </button>
      <span className="flex w-[4.5rem] items-baseline justify-center gap-1">
        <input
          type="number"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-10 bg-transparent text-center text-lg outline-none"
        />
        <span className="text-sm text-muted-foreground">{unit}</span>
      </span>
      <button
        type="button"
        aria-label="Sumar"
        onClick={() => onChange(clamp(base() + step))}
        className="flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:bg-muted"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}

export default function OnboardingPage() {
  const { completeOnboarding } = useRogue();
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [sex, setSex] = useState<Sex>("hombre");
  const [bodyweight, setBodyweight] = useState("");
  const [height, setHeight] = useState("");
  const [goal, setGoal] = useState(GOALS[0]);

  // Precarga el nombre con el username elegido al registrarse (editable):
  // asi no se siente como si se pidiera el mismo dato dos veces seguidas.
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const userId = await getCurrentUserId(supabase);
      if (!userId) return;
      const { data } = await supabase
        .from("profiles")
        .select("username")
        .eq("user_id", userId)
        .maybeSingle();
      if (data?.username) setName((prev) => prev || data.username);
    })();
  }, []);

  const canNext =
    (step === 0 && name.trim().length > 0) ||
    (step === 1 && Number(bodyweight) > 0 && Number(height) > 0) ||
    step === 2;

  function finish() {
    completeOnboarding({
      name: name.trim(),
      sex,
      bodyweightKg: Math.round(Number(bodyweight)),
      heightCm: Math.round(Number(height)),
      goal,
    });
    router.replace("/");
  }

  return (
    <div className="mx-auto flex w-full flex-1 flex-col px-6 pb-8 pt-10 md:max-w-md md:justify-center md:pt-8">
      <div className="mb-4 h-10">
        {step > 0 && (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            aria-label="Volver atras"
            className="flex size-10 items-center justify-center rounded-full bg-surface hover:bg-muted"
          >
            <ArrowLeft className="size-5" />
          </button>
        )}
      </div>

      <div className="mb-8 flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i <= step ? "bg-accent" : "bg-muted",
            )}
          />
        ))}
      </div>

      <div className="flex flex-1 flex-col">
        {step === 0 && (
          <div className="flex flex-col gap-6">
            <div>
              <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
                BIENVENIDO A ROGUE
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">
                ¿Como te llamas?
              </h1>
            </div>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tu nombre"
              className="w-full rounded-2xl border border-border bg-surface px-4 py-3.5 text-lg outline-none focus:border-foreground"
            />
            <div>
              <p className="mb-2 text-sm text-muted-foreground">Sexo</p>
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
                        : "border-border bg-surface text-muted-foreground",
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Se usa para calcular tus rangos con los estandares correctos.
              </p>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-6">
            <div>
              <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
                TUS MEDIDAS
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">
                Peso y altura
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                El peso corporal es la base de la fuerza relativa.
              </p>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3">
              <span className="text-sm">Peso corporal</span>
              <Stepper
                value={bodyweight}
                onChange={setBodyweight}
                unit="kg"
                step={1}
                min={30}
                max={300}
                fallback={78}
                placeholder="78"
              />
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3">
              <span className="text-sm">Altura</span>
              <Stepper
                value={height}
                onChange={setHeight}
                unit="cm"
                step={1}
                min={100}
                max={250}
                fallback={179}
                placeholder="179"
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-6">
            <div>
              <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
                TU OBJETIVO
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">
                ¿Que buscas?
              </h1>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {GOALS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGoal(g)}
                  className={cn(
                    "rounded-2xl border py-4 text-sm font-medium transition-colors",
                    goal === g
                      ? "border-foreground bg-accent text-accent-foreground"
                      : "border-border bg-surface text-muted-foreground",
                  )}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        disabled={!canNext}
        onClick={() => (step < 2 ? setStep(step + 1) : finish())}
        className="mt-8 flex items-center justify-center gap-2 rounded-full bg-accent py-4 text-sm font-medium text-accent-foreground transition-opacity disabled:opacity-40"
      >
        {step < 2 ? "Continuar" : "Empezar"}
        {step < 2 ? (
          <ArrowRight className="size-4" />
        ) : (
          <Check className="size-4" />
        )}
      </button>
    </div>
  );
}
