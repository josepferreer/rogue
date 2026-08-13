import { createClient } from "@/lib/supabase/client";
import type { Coordinate } from "@/lib/store/cardio-store";

/**
 * Acceso a `saved_routes`: rutas reutilizables del usuario (importadas de GPX o
 * guardadas desde una actividad). Todo corre bajo la RLS "solo tus rutas".
 *
 * Igual que en cardio: el LISTADO no trae `coordinates` (son pesadas); se
 * cargan bajo demanda al abrir/seguir una ruta.
 */

export type RouteSource = "activity" | "gpx";

export interface SavedRouteSummary {
  id: string;
  name: string;
  distanceKm: number;
  elevationGainM: number | null;
  source: RouteSource;
  createdAt: string;
}

export interface CreateRouteInput {
  name: string;
  coordinates: Coordinate[];
  distanceKm: number;
  source: RouteSource;
  elevationGainM?: number | null;
  /** Sesión de la que se guardó, si nació de una actividad. */
  originSessionId?: string | null;
}

interface RouteRow {
  id: string;
  name: string;
  distance_km: number | string;
  elevation_gain_m: number | string | null;
  source: string;
  created_at: string;
}

function rowToSummary(row: RouteRow): SavedRouteSummary {
  return {
    id: row.id,
    name: row.name,
    distanceKm: Number(row.distance_km),
    elevationGainM: row.elevation_gain_m == null ? null : Number(row.elevation_gain_m),
    source: row.source === "gpx" ? "gpx" : "activity",
    createdAt: row.created_at,
  };
}

/** Rutas del usuario (sin la polilínea). Más recientes primero. */
export async function fetchSavedRoutes(): Promise<SavedRouteSummary[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("saved_routes")
    .select("id, name, distance_km, elevation_gain_m, source, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToSummary(r as RouteRow));
}

export interface SavedRouteFull extends SavedRouteSummary {
  coordinates: Coordinate[];
}

/** Una ruta completa (metadatos + polilínea), para seguirla. null si no existe. */
export async function fetchRoute(id: string): Promise<SavedRouteFull | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("saved_routes")
    .select("id, name, distance_km, elevation_gain_m, source, created_at, coordinates")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const coords = (data.coordinates as Coordinate[] | null) ?? [];
  return {
    ...rowToSummary(data as RouteRow),
    coordinates: Array.isArray(coords) ? coords : [],
  };
}

/** Polilínea de una ruta (para pintarla o seguirla). */
export async function fetchRouteCoordinates(id: string): Promise<Coordinate[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("saved_routes")
    .select("coordinates")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const coords = (data?.coordinates as Coordinate[] | null) ?? [];
  return Array.isArray(coords) ? coords : [];
}

/** Crea una ruta y devuelve su id. `user_id` lo pone la RLS/columna por defecto
 *  no: se manda explícito porque la tabla no tiene default de auth.uid(). */
export async function createRoute(input: CreateRouteInput): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sesión no válida.");

  const { data, error } = await supabase
    .from("saved_routes")
    .insert({
      user_id: user.id,
      name: input.name.trim().slice(0, 80) || "Ruta",
      coordinates: input.coordinates,
      distance_km: Math.round(input.distanceKm * 100) / 100,
      elevation_gain_m: input.elevationGainM ?? null,
      source: input.source,
      origin_session_id: input.originSessionId ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function renameRoute(id: string, name: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("saved_routes")
    .update({ name: name.trim().slice(0, 80), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteRoute(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("saved_routes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
