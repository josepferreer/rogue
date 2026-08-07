import "server-only";
import type { NoaToolContext, ToolDef, ToolModule } from "@/lib/noa/types";

/**
 * Módulo CALENDAR — qué toca hoy y qué hay planificado.
 *
 * Es el único que cruza dominios: junta el día de rutina que toca (por día de
 * la semana), lo que ya se entrenó y las comidas planificadas. Sin él, "¿qué
 * tengo hoy?" obligaba al modelo a encadenar tres tools de tres módulos, y el
 * Intent Analyzer rara vez los activaba los tres a la vez.
 *
 * Solo lectura: para cambiar algo están las tools de su módulo.
 */

const getAgenda: ToolDef = {
  name: "getAgenda",
  description:
    "Qué tiene el usuario planificado en un rango de días: entreno de rutina que toca cada día, si ya lo hizo, y cuántas comidas tiene planificadas. Úsala para «¿qué toca hoy?» o «¿cómo tengo la semana?».",
  parameters: {
    type: "object",
    properties: {
      days: {
        type: "integer",
        description: "Cuántos días desde hoy, incluido (def. 1 = solo hoy, máx. 14).",
      },
    },
  },
  module: "calendar",
  kind: "read",
  sensitivity: "safe",
  async handler(args, ctx: NoaToolContext) {
    const days = clampInt(args.days, 1, 1, 14);
    const fechas = Array.from({ length: days }, (_, i) => addDays(ctx.now, i));
    const from = dayKey(fechas[0]);
    const to = dayKey(fechas[fechas.length - 1]);

    const [rutina, sesiones, comidas] = await Promise.all([
      readRoutineDays(ctx),
      readSessions(ctx, from, to),
      readPlannedMeals(ctx, from, to),
    ]);

    return {
      desde: from,
      hasta: to,
      dias: fechas.map((d) => {
        const key = dayKey(d);
        const weekday = d.getDay();
        const toca = rutina.filter((r) => r.weekdays.includes(weekday));
        return {
          date: key,
          diaSemana: WEEKDAYS[weekday],
          entrenoProgramado: toca.map((r) => ({ label: r.label, focus: r.focus })),
          esDescanso: toca.length === 0,
          yaEntrenado: sesiones.has(key),
          comidasPlanificadas: comidas.get(key) ?? 0,
        };
      }),
    };
  },
};

export const calendarModule: ToolModule = {
  id: "calendar",
  tools: [getAgenda],
  intentKeywords: [
    "hoy",
    "manana",
    "mañana",
    "semana",
    "agenda",
    "calendario",
    "toca",
    "programado",
    "planificado",
    "descanso",
  ],
};

// —— Lecturas ————————————————————————————————————————————————

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

interface RoutineDayLite {
  label: string;
  focus: string | null;
  weekdays: number[];
}

async function readRoutineDays(ctx: NoaToolContext): Promise<RoutineDayLite[]> {
  const { data: routines, error } = await ctx.supabase
    .from("routines")
    .select("id")
    .order("created_at")
    .limit(1);
  if (error) throw new Error(error.message);
  const routineId = routines?.[0]?.id;
  if (!routineId) return [];

  const { data, error: dErr } = await ctx.supabase
    .from("routine_days")
    .select("label, focus, weekdays")
    .eq("routine_id", routineId)
    .order("position");
  if (dErr) throw new Error(dErr.message);

  return (data ?? []).map((d) => ({
    label: d.label as string,
    focus: (d.focus as string) ?? null,
    weekdays: Array.isArray(d.weekdays) ? (d.weekdays as number[]) : [],
  }));
}

/** Días (YYYY-MM-DD) en los que ya hay un entreno registrado. */
async function readSessions(
  ctx: NoaToolContext,
  from: string,
  to: string,
): Promise<Set<string>> {
  const { data, error } = await ctx.supabase
    .from("workout_sessions")
    .select("date")
    .gte("date", from)
    .lte("date", to);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((s) => String(s.date).slice(0, 10)));
}

/** Comidas planificadas (sin marcar como comidas) por día. */
async function readPlannedMeals(
  ctx: NoaToolContext,
  from: string,
  to: string,
): Promise<Map<string, number>> {
  const { data, error } = await ctx.supabase
    .from("meal_entries")
    .select("date")
    .gte("date", from)
    .lte("date", to)
    .eq("eaten", false);
  if (error) throw new Error(error.message);

  const map = new Map<string, number>();
  for (const r of data ?? []) {
    const key = String(r.date);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

// —— Fechas ——————————————————————————————————————————————————

function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

/** Fecha local YYYY-MM-DD, igual que la guarda la app (no UTC). */
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}
