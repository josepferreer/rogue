"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppShellPortal } from "@/lib/use-app-shell-portal";
import { useEscapeToClose } from "@/lib/use-escape-to-close";
import { usePresence, type PresenceState } from "@/lib/use-presence";
import {
  DEFAULT_PERSONALITY,
  LENGTH_OPTIONS,
  NICKNAME_MAX,
  PERSONA_OPTIONS,
  TONE_OPTIONS,
  type NoaPersonality,
  type Option,
} from "@/lib/noa/personality-options";
import {
  getNoaPersonality,
  saveNoaPersonality,
} from "@/lib/noa/settings-actions";

type Props = { open: boolean; onClose: () => void };

/** Cuánto se espera tras dejar de teclear el apodo antes de guardar. */
const NICKNAME_DEBOUNCE_MS = 600;

/**
 * Ajustes > NOA > Personalidad.
 *
 * Cambia SOLO cómo se comunica NOA (tono, carácter, longitud y cómo te llama).
 * No toca lo que NOA puede hacer ni cómo usa sus herramientas. Se guarda solo,
 * campo a campo, y se aplica en la siguiente conversación.
 */
export function NoaPersonalityModal({ open, onClose }: Props) {
  const portalTarget = useAppShellPortal();
  const { mounted, state } = usePresence(open);
  useEscapeToClose(open, onClose);

  if (!mounted || !portalTarget) return null;
  // La hoja se monta de cero en cada apertura (mismo patron que
  // nutrition-goals-modal): asi lee los ajustes al montar, sin reiniciar
  // estado a mano desde un efecto.
  return createPortal(<PersonalitySheet state={state} onClose={onClose} />, portalTarget);
}

function PersonalitySheet({
  onClose,
  state,
}: {
  onClose: () => void;
  state: PresenceState;
}) {
  const [value, setValue] = useState<NoaPersonality>(DEFAULT_PERSONALITY);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const nicknameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    getNoaPersonality()
      .then((p) => {
        if (!alive) return;
        setValue(p);
        setLoading(false);
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Limpia el guardado pendiente del apodo si se cierra antes de que dispare.
  useEffect(() => {
    return () => {
      if (nicknameTimer.current) clearTimeout(nicknameTimer.current);
    };
  }, []);

  async function persist(patch: Partial<NoaPersonality>) {
    setStatus("saving");
    setError(null);
    const result = await saveNoaPersonality(patch);
    if (!result.ok) {
      setStatus("error");
      setError(result.error);
      return;
    }
    setStatus("saved");
  }

  /** Selectores: optimista en pantalla y guardado inmediato. */
  function choose(patch: Partial<NoaPersonality>) {
    setValue((prev) => ({ ...prev, ...patch }));
    void persist(patch);
  }

  /** El apodo se teclea: se guarda al parar, no en cada pulsación. */
  function onNicknameChange(next: string) {
    setValue((prev) => ({ ...prev, nickname: next }));
    if (nicknameTimer.current) clearTimeout(nicknameTimer.current);
    nicknameTimer.current = setTimeout(() => {
      void persist({ nickname: next });
    }, NICKNAME_DEBOUNCE_MS);
  }

  return (
    <div
      className="overlay-anim absolute inset-0 z-[60] flex flex-col justify-end md:items-center md:justify-center"
      data-state={state}
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div className="sheet-anim w-full md:max-w-md" data-state={state}>
        <div
          className="flex max-h-[90dvh] flex-col rounded-t-3xl border border-border bg-surface md:max-h-[85dvh] md:rounded-3xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between px-5 pb-2 pt-5">
            <div className="min-w-0">
              <p className="text-base font-semibold">Personalidad de NOA</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Cambia cómo te habla. Nunca cambia lo que sabe ni de dónde saca
                los datos.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-muted"
            >
              <X className="size-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            {loading ? (
              <p className="py-10 text-center font-mono text-xs text-muted-foreground">
                Cargando…
              </p>
            ) : (
              <div className="flex flex-col gap-6 pt-2">
                {/* 1 · Cómo te llama */}
                <Field
                  title="¿Cómo quieres que NOA te llame?"
                  hint="Si lo dejas vacío usará el nombre de tu perfil."
                >
                  <input
                    value={value.nickname}
                    onChange={(e) => onNicknameChange(e.target.value)}
                    maxLength={NICKNAME_MAX}
                    placeholder="Josep, Jefe, Campeón…"
                    className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-foreground"
                  />
                </Field>

                <Field
                  title="Estilo de comunicación"
                  hint="Solo cambia el tono, nunca el contenido técnico."
                >
                  <Choices
                    options={TONE_OPTIONS}
                    selected={value.tone}
                    onSelect={(tone) => choose({ tone })}
                  />
                </Field>

                <Field
                  title="Personalidad"
                  hint="Cambia la forma de explicarte las cosas."
                >
                  <Choices
                    options={PERSONA_OPTIONS}
                    selected={value.persona}
                    onSelect={(persona) => choose({ persona })}
                  />
                </Field>

                <Field title="Longitud de respuesta" hint="Cuánto se extiende NOA.">
                  <Choices
                    options={LENGTH_OPTIONS}
                    selected={value.length}
                    onSelect={(length) => choose({ length })}
                  />
                </Field>

                <div className="flex min-h-5 items-center justify-center">
                  {status === "error" ? (
                    <p className="text-xs text-destructive">
                      No se pudo guardar: {error}
                    </p>
                  ) : status === "saving" ? (
                    <p className="font-mono text-xs text-muted-foreground">
                      Guardando…
                    </p>
                  ) : status === "saved" ? (
                    <p className="font-mono text-xs text-muted-foreground">
                      Guardado · se aplica en tu próxima conversación
                    </p>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
      {children}
    </div>
  );
}

function Choices<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: Option<T>[];
  selected: T;
  onSelect: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((o) => {
        const active = o.value === selected;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onSelect(o.value)}
            aria-pressed={active}
            className={cn(
              "flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors",
              active
                ? "border-foreground bg-background"
                : "border-border bg-background hover:bg-muted",
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{o.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{o.hint}</p>
            </div>
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full border",
                active ? "border-foreground bg-foreground text-background" : "border-border",
              )}
            >
              {active && <Check className="size-3" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
