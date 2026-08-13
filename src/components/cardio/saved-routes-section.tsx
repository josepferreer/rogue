"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Route, Trash2, Pencil } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  deleteRoute,
  fetchSavedRoutes,
  renameRoute,
  type SavedRouteSummary,
} from "@/lib/cardio/saved-routes";

/**
 * Sección "MIS RUTAS" de la página de cardio: rutas reutilizables guardadas
 * (desde una actividad o, más adelante, importadas de GPX). Permite renombrar y
 * borrar. El "repetir en modo seguimiento" se añadirá aquí.
 *
 * Si el usuario no tiene rutas, la sección no se pinta (no mete ruido).
 */
export function SavedRoutesSection() {
  const { notify } = useToast();
  const [routes, setRoutes] = useState<SavedRouteSummary[] | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    let alive = true;
    fetchSavedRoutes()
      .then((r) => {
        if (alive) setRoutes(r);
      })
      .catch(() => {
        if (alive) setRoutes([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Aún cargando o sin rutas: no ocupamos espacio.
  if (!routes || routes.length === 0) return null;

  async function commitRename(id: string) {
    const name = editName.trim();
    setEditingId(null);
    if (!name) return;
    setRoutes((rs) => rs?.map((r) => (r.id === id ? { ...r, name } : r)) ?? rs);
    try {
      await renameRoute(id, name);
    } catch {
      notify("No se pudo renombrar la ruta.", "error");
    }
  }

  async function confirmDelete(id: string) {
    setPendingDelete(null);
    setRoutes((rs) => rs?.filter((r) => r.id !== id) ?? rs);
    try {
      await deleteRoute(id);
      notify("Ruta eliminada", "success");
    } catch {
      notify("No se pudo borrar la ruta.", "error");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
        MIS RUTAS
      </p>
      <div className="flex flex-col gap-3 md:grid md:grid-cols-2 md:gap-3">
        {routes.map((r) => (
          <div
            key={r.id}
            className="flex items-center rounded-3xl border border-border bg-surface transition-colors hover:bg-muted/40"
          >
            {editingId === r.id ? (
              <div className="flex min-w-0 flex-1 items-center gap-4 p-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                  <Route className="size-5" />
                </span>
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => commitRename(r.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename(r.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="w-full rounded-lg border border-border bg-background px-2 py-1 text-sm outline-none focus:border-foreground"
                />
              </div>
            ) : (
              <Link
                href={`/app/cardio/ruta/${r.id}`}
                className="flex min-w-0 flex-1 items-center gap-4 p-4 active:bg-muted"
              >
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                  <Route className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{r.name}</p>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                    {r.distanceKm.toFixed(2)} km
                    {r.elevationGainM != null ? ` · ${r.elevationGainM} m D+` : ""}
                  </p>
                </div>
              </Link>
            )}
            <button
              type="button"
              onClick={() => {
                setEditingId(r.id);
                setEditName(r.name);
              }}
              aria-label="Renombrar ruta"
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
            >
              <Pencil className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setPendingDelete(r.id)}
              aria-label="Eliminar ruta"
              className="mr-2 flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-5" />
            </button>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="¿Eliminar esta ruta?"
        description="Se borrará de tus rutas guardadas. Tus actividades del historial no se tocan."
        confirmLabel="Eliminar"
        onConfirm={() => pendingDelete && confirmDelete(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
