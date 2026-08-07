import "server-only";
import type { NoaToolContext, ToolDef, ToolModule } from "@/lib/noa/types";
import { estimateKcal, estimateSteps } from "@/lib/cardio/estimates";

/**
 * Módulo CARDIO — rutas de carrera/marcha registradas por GPS.
 *
 * Lectura:  getCardioHistory, getCardioSummary
 * Cliente:  startCardioSession (abre el tracker y empieza a grabar)
 * Escritura: deleteCardioSession (con confirmación)
 *
 * NO expone la polilínea de las rutas. Son ~130 KB por ruta y no aportan nada
 * a un razonamiento sobre entrenamiento; además son el dato más sensible que
 * tiene el usuario (empiezan y acaban en su casa) y no hay motivo para que
 * salgan del servidor hacia el modelo.
 *
 * Kcal y pasos son ESTIMACIONES: salen de la misma fórmula que usa la app
 * (`lib/cardio/estimates.ts`, ~1 kcal por kg y km) con el peso del perfil, NO
 * de un pulsómetro. Se exponen para que NOA responda "¿cuántas calorías quemé?"
 * sin inventarse nada; su etiqueta deja claro que son estimadas.
 */

const getCardioHistory: ToolDef = {
  name: "getCardioHistory",
  description:
    "Últimas sesiones de cardio del usuario: fecha, distancia, duración, ritmo y una ESTIMACIÓN de calorías (kcal) y pasos. Úsala para preguntas sobre carreras/caminatas recientes, incluido «¿cuántas calorías quemé?». Presenta kcal y pasos siempre como estimados, no medidos.",
  parameters: {
    type: "object",
    properties: {
      limit: { type: "integer", description: "Cuántas sesiones (def. 10, máx. 50)." },
    },
  },
  module: "cardio",
  kind: "read",
  sensitivity: "safe",
  async handler(args, ctx: NoaToolContext) {
    const limit = clampInt(args.limit, 10, 1, 50);
    const [{ data, error }, bodyweightKg] = await Promise.all([
      ctx.supabase
        .from("cardio_sessions")
        // Sin `coordinates` a propósito (ver cabecera).
        .select("id, date, distance_km, duration_sec")
        .order("date", { ascending: false })
        .limit(limit),
      readBodyweight(ctx),
    ]);
    if (error) throw new Error(error.message);

    return {
      pesoUsadoKg: bodyweightKg,
      sessions: (data ?? []).map((s) => {
        const distanceKm = round(num(s.distance_km), 2);
        return {
          id: s.id,
          date: s.date,
          distanceKm,
          durationSec: num(s.duration_sec),
          ritmoMinPorKm: pace(num(s.distance_km), num(s.duration_sec)),
          kcalEstimadas: estimateKcal(num(s.distance_km), bodyweightKg),
          pasosEstimados: estimateSteps(num(s.distance_km)),
        };
      }),
    };
  },
};

const getCardioSummary: ToolDef = {
  name: "getCardioSummary",
  description:
    "Resumen agregado de cardio en un periodo: número de sesiones, kilómetros y tiempo totales, distancia media, ritmo medio y una ESTIMACIÓN de las calorías totales quemadas. Úsala para progreso general, no para una ruta concreta.",
  parameters: {
    type: "object",
    properties: {
      days: {
        type: "integer",
        description: "Ventana hacia atrás en días (def. 30, máx. 365).",
      },
    },
  },
  module: "cardio",
  kind: "read",
  sensitivity: "safe",
  async handler(args, ctx: NoaToolContext) {
    const days = clampInt(args.days, 30, 1, 365);
    const since = new Date(ctx.now.getTime() - days * 86400_000).toISOString();

    const [{ data, error }, bodyweightKg] = await Promise.all([
      ctx.supabase
        .from("cardio_sessions")
        .select("distance_km, duration_sec")
        .gte("date", since),
      readBodyweight(ctx),
    ]);
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const km = rows.reduce((a, r) => a + num(r.distance_km), 0);
    const sec = rows.reduce((a, r) => a + num(r.duration_sec), 0);
    return {
      ventanaDias: days,
      sesiones: rows.length,
      kmTotales: round(km, 2),
      tiempoTotalSec: sec,
      kmPorSesion: rows.length > 0 ? round(km / rows.length, 2) : 0,
      ritmoMedioMinPorKm: pace(km, sec),
      // Estimación (misma fórmula que la app); lineal en km, así que el total
      // se calcula sobre el kilometraje agregado.
      kcalEstimadasTotales: estimateKcal(km, bodyweightKg),
    };
  },
};

const startCardioSession: ToolDef = {
  name: "startCardioSession",
  description:
    "Inicia una sesión de cardio en la app: activa el GPS y abre el seguimiento en vivo. Úsala solo si el usuario dice explícitamente que va a salir a correr o caminar ahora.",
  parameters: { type: "object", properties: {} },
  module: "cardio",
  kind: "client-action",
  sensitivity: "confirm",
  summarize() {
    return "Empezar a grabar una ruta de cardio con el GPS.";
  },
  toAction() {
    return { type: "startCardio" };
  },
};

const deleteCardioSession: ToolDef = {
  name: "deleteCardioSession",
  description:
    "Borra una ruta de cardio del historial. Necesita el id, que sale de getCardioHistory. Es irreversible: la ruta y su recorrido se pierden.",
  parameters: {
    type: "object",
    properties: {
      id: { type: "string", description: "Id de la sesión (de getCardioHistory)." },
    },
    required: ["id"],
  },
  module: "cardio",
  kind: "write",
  sensitivity: "confirm",
  refetch: "cardio",
  summarize(args) {
    return `Borrar la ruta de cardio ${String(args.id).slice(0, 8)}… del historial. No se puede deshacer.`;
  },
  async handler(args, ctx: NoaToolContext) {
    const id = typeof args.id === "string" ? args.id : "";
    if (!id) throw new Error("Falta el id de la ruta.");
    const { error } = await ctx.supabase
      .from("cardio_sessions")
      .delete()
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { borrada: true };
  },
};

async function contextProvider(ctx: NoaToolContext) {
  const { data } = await ctx.supabase
    .from("cardio_sessions")
    .select("date, distance_km, duration_sec")
    .order("date", { ascending: false })
    .limit(1);
  const last = data?.[0];
  return {
    cardio: {
      ultimaRuta: last
        ? {
            date: last.date,
            distanceKm: round(num(last.distance_km), 2),
            durationSec: num(last.duration_sec),
          }
        : null,
    },
  };
}

export const cardioModule: ToolModule = {
  id: "cardio",
  tools: [getCardioHistory, getCardioSummary, startCardioSession, deleteCardioSession],
  intentKeywords: [
    "cardio",
    "correr",
    "carrera",
    "corri",
    "running",
    "caminar",
    "andar",
    "paseo",
    "ruta",
    "kilometro",
    "kilometros",
    "km",
    "ritmo",
    "pasos",
    "trote",
  ],
  contextProvider,
};

/** Peso corporal del usuario (kg) para las estimaciones; 75 por defecto, igual
 *  que la app cuando el perfil no lo tiene. */
async function readBodyweight(ctx: NoaToolContext): Promise<number> {
  const { data } = await ctx.supabase
    .from("profiles")
    .select("bodyweight_kg")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  const w = num(data?.bodyweight_kg);
  return w > 0 ? w : 75;
}

/** Ritmo en min/km como texto ("5'30\""), o null si no hay distancia. */
function pace(km: number, sec: number): string | null {
  if (km <= 0 || sec <= 0) return null;
  const minPerKm = sec / 60 / km;
  const min = Math.floor(minPerKm);
  const s = Math.round((minPerKm - min) * 60);
  return `${min}'${String(s).padStart(2, "0")}"`;
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}
