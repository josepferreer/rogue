import "server-only";
import type { NoaToolContext, ToolDef, ToolModule } from "@/lib/noa/types";
import { buildMuscleResolver } from "@/lib/exercises/custom-server";
import { MUSCLE_LABELS, type MuscleId } from "@/lib/exercises/types";
import {
  computeMuscleRecovery,
  DEFAULT_RECOVERY_HOURS,
} from "@/lib/training/muscle-recovery";
import type { WorkoutSession } from "@/lib/workout/types";

/**
 * Módulo HEATMAP — recuperación muscular: qué músculos están listos y cuáles
 * siguen descansando.
 *
 * Comparte motor con el mapa de calor de la pantalla de inicio
 * (`lib/training/muscle-recovery`), así que NOA y la UI no pueden decir cosas
 * distintas. Aquí solo se leen los datos y se traduce el resultado.
 *
 * Solo lectura. Los umbrales los cambia el usuario en Ajustes; NOA no los
 * toca (para eso está `profile.updatePreferences`, y ese es un write con su
 * propia confirmación).
 */

/** Ventana de historial suficiente: el umbral más largo son 336 h (14 días). */
const DAYS_BACK = 21;

const getMuscleRecovery: ToolDef = {
  name: "getMuscleRecovery",
  description:
    "Estado de recuperación de cada músculo: cuánto hace que se entrenó, si ya está listo y cuántas horas le faltan. Úsala para «¿qué puedo entrenar hoy?», «¿tengo la espalda recuperada?» o «¿qué músculos llevo más descansados?».",
  parameters: {
    type: "object",
    properties: {
      soloListos: {
        type: "boolean",
        description: "Devuelve únicamente los músculos ya recuperados.",
      },
      musculos: {
        type: "array",
        items: { type: "string" },
        description:
          "Filtra por músculos concretos, en español y en minúsculas: pectoral, dorsal, espalda-media, lumbar, trapecio, deltoide, biceps, triceps, antebrazo, cuadriceps, isquiotibiales, gemelos, gluteo, aductores, abductores, abdominales, oblicuos.",
      },
    },
  },
  module: "heatmap",
  kind: "read",
  sensitivity: "safe",
  async handler(args, ctx: NoaToolContext) {
    // El resolvedor cubre catalogo publico + ejercicios propios del usuario: en
    // servidor el global de repo.ts no tiene los personalizados, y sin esto una
    // serie hecha con uno de ellos no contaba para ningun musculo.
    const [sessions, recoveryHours, resolveMuscles] = await Promise.all([
      readSessions(ctx),
      readRecoveryHours(ctx),
      buildMuscleResolver(ctx.supabase, ctx.userId),
    ]);

    const recovery = computeMuscleRecovery(sessions, resolveMuscles, {
      now: ctx.now.getTime(),
      recoveryHours,
    });

    const pedidos = normalizarMusculos(args.musculos);
    const filtrado = recovery
      .filter((m) => (pedidos ? pedidos.includes(m.muscle) : true))
      .filter((m) => (args.soloListos ? m.state === "listo" : true));

    return {
      // Sin entrenos no hay nada que recuperar: conviene decirlo explícito o el
      // modelo interpreta "todo listo" como que el usuario está descansadísimo.
      sinHistorial: sessions.length === 0,
      musculos: filtrado.map((m) => ({
        musculo: m.muscle,
        nombre: m.label,
        estado: m.state,
        ultimaVez: m.lastTrainedISO,
        horasDesde: m.hoursSince === null ? null : Math.round(m.hoursSince),
        horasQueFaltan: Math.round(m.hoursLeft),
        umbralHoras: m.recoveryHours,
        seriesUltimaVez: m.setsLastTime,
        soloIndirecto: m.lastWasSecondaryOnly,
      })),
      // Explicar el modelo evita que el modelo se invente fisiología.
      comoSeCalcula:
        "Horas desde la última vez que se trabajó el músculo, contra un umbral por músculo que el usuario puede cambiar en Ajustes. Un músculo trabajado solo de forma indirecta (secundario) pide la mitad de ese umbral. No se estima fatiga por volumen ni intensidad.",
    };
  },
};

export const heatmapModule: ToolModule = {
  id: "heatmap",
  tools: [getMuscleRecovery],
  intentKeywords: [
    "recuperado",
    "recuperada",
    "recuperacion",
    "recuperación",
    "descansado",
    "descansada",
    "musculo",
    "músculo",
    "musculos",
    "músculos",
    "mapa de calor",
    "heatmap",
    "que puedo entrenar",
    "qué puedo entrenar",
    "que entreno hoy",
    "qué entreno hoy",
    "listo para entrenar",
    "fatiga",
    "sobrecargado",
  ],
};

// —— Lecturas ————————————————————————————————————————————————

/** Sesiones con sus series, en la forma que espera `computeMuscleRecovery`. */
async function readSessions(ctx: NoaToolContext): Promise<WorkoutSession[]> {
  const desde = new Date(ctx.now.getTime() - DAYS_BACK * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const { data, error } = await ctx.supabase
    .from("workout_sessions")
    .select("id, date, day_label, workout_sets(exercise_id, weight_kg, reps)")
    .gte("date", desde)
    .order("date", { ascending: false });
  if (error) throw new Error(error.message);

  type Row = {
    id: string;
    date: string;
    day_label: string | null;
    workout_sets: { exercise_id: string; weight_kg: number; reps: number }[] | null;
  };

  return ((data ?? []) as Row[]).map((row) => ({
    id: row.id,
    dateISO: row.date,
    dayLabel: row.day_label ?? "",
    sets: (row.workout_sets ?? []).map((s) => ({
      exerciseId: s.exercise_id,
      // `grupo` no lo usa el cálculo (los músculos salen del catálogo), pero
      // forma parte del tipo: se rellena con algo válido y ya.
      grupo: "Core" as const,
      weightKg: Number(s.weight_kg),
      reps: Number(s.reps),
    })),
  }));
}

/** Umbrales que el usuario haya personalizado. */
async function readRecoveryHours(
  ctx: NoaToolContext,
): Promise<Partial<Record<MuscleId, number>>> {
  const { data, error } = await ctx.supabase
    .from("profiles")
    .select("recovery_hours")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  // Que falle la lectura de una personalizacion no debe tumbar la respuesta:
  // se cae a los umbrales por defecto.
  if (error || !data?.recovery_hours) return {};
  const raw = data.recovery_hours as Record<string, unknown>;
  const out: Partial<Record<MuscleId, number>> = {};
  for (const [k, v] of Object.entries(raw)) {
    const n = Number(v);
    if (k in DEFAULT_RECOVERY_HOURS && Number.isFinite(n) && n > 0) {
      out[k as MuscleId] = n;
    }
  }
  return out;
}

/** Acepta los ids tal cual o los nombres visibles ("Isquiotibiales"). */
function normalizarMusculos(input: unknown): MuscleId[] | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  const validos = Object.keys(DEFAULT_RECOVERY_HOURS) as MuscleId[];
  const porNombre = new Map(
    validos.map((id) => [MUSCLE_LABELS[id].toLowerCase(), id]),
  );
  const out: MuscleId[] = [];
  for (const raw of input) {
    const s = String(raw).trim().toLowerCase();
    const id = (validos as string[]).includes(s)
      ? (s as MuscleId)
      : porNombre.get(s);
    if (id && !out.includes(id)) out.push(id);
  }
  return out.length > 0 ? out : null;
}
