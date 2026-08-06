"use client";

import { useEffect, useState } from "react";
import { Check, Eye, EyeOff, Trash2 } from "lucide-react";
import { PastelCard } from "@/components/ui/pastel-card";
import { Button } from "@/components/ui/button";
import {
  clearNoaKey,
  getNoaKeyStatus,
  saveNoaKey,
} from "@/lib/noa/settings-actions";

/**
 * Tarjeta BYOK: el usuario pega su clave de Gemini para activar NOA. La clave
 * se guarda en el servidor y nunca vuelve entera al cliente: solo vemos su
 * versión enmascarada. Vive en Perfil > Ajustes.
 */
export function NoaKeyCard() {
  const [loading, setLoading] = useState(true);
  const [masked, setMasked] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [reveal, setReveal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getNoaKeyStatus()
      .then((s) => {
        if (!alive) return;
        setMasked(s.masked);
        setLoading(false);
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    const result = await saveNoaKey(value);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMasked(result.masked);
    setValue("");
    setEditing(false);
  }

  async function remove() {
    setSaving(true);
    await clearNoaKey();
    setSaving(false);
    setMasked(null);
    setEditing(false);
  }

  return (
    <PastelCard variant="neutral" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">Clave de Gemini</p>
        <p className="text-xs text-muted-foreground">
          NOA usa tu propia clave de Gemini. Es gratuita, se guarda cifrada y solo
          tú la ves. Consíguela en Google AI Studio.
        </p>
      </div>

      {loading ? (
        <p className="font-mono text-xs text-muted-foreground">Cargando…</p>
      ) : !editing ? (
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-sm text-muted-foreground">
            {masked ?? "No configurada"}
          </span>
          <div className="flex gap-2">
            {masked && (
              <button
                type="button"
                onClick={remove}
                disabled={saving}
                aria-label="Borrar clave"
                className="flex size-10 items-center justify-center rounded-full hover:bg-muted"
              >
                <Trash2 className="size-5" />
              </button>
            )}
            <Button variant="secondary" onClick={() => setEditing(true)}>
              {masked ? "Cambiar" : "Añadir clave"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 focus-within:border-foreground">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              type={reveal ? "text" : "password"}
              placeholder="AIza…"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            <button
              type="button"
              onClick={() => setReveal((r) => !r)}
              aria-label={reveal ? "Ocultar" : "Mostrar"}
              className="text-muted-foreground hover:text-foreground"
            >
              {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2">
            <Button
              variant="secondary"
              fullWidth
              onClick={() => {
                setEditing(false);
                setValue("");
                setError(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              fullWidth
              onClick={save}
              disabled={saving || value.trim().length === 0}
            >
              <Check className="size-4" />
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </div>
      )}
    </PastelCard>
  );
}
